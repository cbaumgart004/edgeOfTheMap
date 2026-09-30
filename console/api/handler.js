// The console's API, one Lambda behind a function URL under
// admin.theedgeofthemap.com (StoryShaped ADR-0007). Every dependency is passed in
// (lambda.js wires the real ones), so the routing and the access rules are
// tested without AWS or Neon.
//
// Access: a request names a site. The bearer JWT is verified, the login must be
// a member of that site in the control project, and only then is the site's own
// project opened. The Origin must be one of the site's allowed origins.

import { createService, ServiceError } from '../core/service.js'
import { createPgRepo } from './repo-pg.js'
import { checkSchema } from '../schema/schema.js'
import { createManage } from './manage.js'
import { createRequests } from './requests.js'
import { mergeCustom, checkCustom, droppedCustom } from '../schema/custom.js'

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const IMAGE_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif' }

function json(status, body, headers = {}) {
  return { statusCode: status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }
}

function cors(origin, site) {
  if (!origin || !site?.allowed_origins?.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

// A site's logo as an absolute URL: the schema names it as a path on the
// site's own domain.
function logoOf(schema, origin) {
  const logo = schema?.brand?.logo
  if (!logo || !origin) return null
  try { return new URL(logo, origin).href } catch { return null }
}

function parseBody(event) {
  if (!event.body) return {}
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  try {
    return JSON.parse(raw)
  } catch {
    throw new ServiceError(400, 'Body must be JSON.')
  }
}

// deps: {
//   control: { query(sql, params) }                   Edge of the Map's project
//   siteDb(site): Promise<{ query }>                  that customer's project
//   verifyToken(jwt): Promise<{ id, email, site? }>   throws when invalid; `site`
//                                                     is set on an editor token
//   signEditorToken({ id, email, site }): Promise<string>
//   releases(): Promise<[{ version, integrity }]>      released console versions
//   createLogin({ email, password, name }): Promise<{ id }>   a new Neon Auth login
//   presign({ bucket, key, contentType, bytes }): Promise<string>
//   media: { bucket, baseUrl }                        the shared photo bucket; each site
//                                                     writes under sites/<slug>/. A site's own
//                                                     media_bucket, where set, overrides it.
//   sanitize(schema): (type, data) => data
//   sendEmail({ to, subject, text }), sendPush(sub, payload, vapid), generateVapid()   see requests.js
//   monitors: { list, connect, disconnect }, see monitors.js
// }
export function createHandler(deps) {
  const siteCache = new Map()
  const resetTries = new Map() // ip -> timestamps, per warm container
  const helpTries = new Map()
  const requests = createRequests(deps)
  const manage = createManage({ ...deps, requests }, { onSiteChange: (slug) => siteCache.delete(slug) })

  function allow(tries, ip, now = Date.now()) {
    const recent = (tries.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
    if (recent.length >= 5) return false
    recent.push(now)
    tries.set(ip, recent)
    return true
  }

  async function loadSite(slug) {
    const hit = siteCache.get(slug)
    if (hit && hit.at > Date.now() - 60_000) return hit.site
    const { rows } = await deps.control.query('SELECT * FROM sites WHERE slug = $1', [slug])
    const site = rows[0] ?? null
    if (site) {
      // The owner's own types over the shipped schema (schema/custom.js).
      site.base_schema = site.schema
      site.schema = mergeCustom(site.schema, site.custom_schema)
      const problems = checkSchema(site.schema)
      if (problems.length) throw new ServiceError(500, `Site schema is invalid: ${problems[0]}`)
    }
    siteCache.set(slug, { site, at: Date.now() })
    return site
  }

  async function verified(event) {
    const header = event.headers?.authorization ?? event.headers?.Authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new ServiceError(401, 'Sign in to edit.')
    try {
      return await deps.verifyToken(token)
    } catch {
      throw new ServiceError(401, 'Your sign-in has expired.')
    }
  }

  // Still on an operator's temporary password (control migration 008). Before
  // that migration runs the table is missing (42P01), which means no one is.
  async function passwordChangeRequired(userId) {
    try {
      return (await deps.control.query('SELECT 1 FROM password_change_required WHERE user_id = $1', [userId])).rows.length > 0
    } catch (err) {
      if (err?.code === '42P01') return false
      throw err
    }
  }

  async function authorize(event, site) {
    const user = await verified(event)
    const { rows } = await deps.control.query(
      'SELECT role FROM site_members WHERE site_id = $1 AND user_id = $2', [site.id, user.id])
    if (!rows.length) throw new ServiceError(403, 'This login cannot edit this site.')
    // An editor token opens one site only.
    if (user.site && user.site !== site.slug) throw new ServiceError(403, 'This sign-in is for another site.')
    return { ...user, role: rows[0].role }
  }

  async function serviceFor(site) {
    const db = await deps.siteDb(site)
    return createService({ schema: site.schema, repo: createPgRepo(db), sanitize: deps.sanitize(site.schema) })
  }

  return async function handle(event) {
    const method = event.requestContext?.http?.method ?? event.httpMethod
    const path = (event.rawPath ?? event.path ?? '').replace(/\/+$/, '')
    const origin = event.headers?.origin ?? event.headers?.Origin
    const query = event.queryStringParameters ?? {}
    let headers = {}

    try {
      // The admin home page asks for a password link. Neon Auth answers the same
      // whether or not the email has a login (to stop address probing); the owner
      // asked to be told which, so look it up first, throttled per caller.
      if (method === 'POST' && path === '/api/password-reset') {
        const ip = event.requestContext?.http?.sourceIp ?? 'unknown'
        if (!allow(resetTries, ip)) return json(429, { error: 'Too many tries. Wait ten minutes and try again.' }, { 'cache-control': 'no-store' })
        const email = String(parseBody(event).email ?? '').trim().toLowerCase()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter an email address.' }, { 'cache-control': 'no-store' })
        const { rows } = await deps.control.query('SELECT 1 FROM neon_auth."user" WHERE lower(email) = $1 LIMIT 1', [email])
        if (!rows.length) return json(404, { exists: false, email }, { 'cache-control': 'no-store' })
        await deps.requestPasswordReset(email)
        return json(200, { exists: true, sent: true, email }, { 'cache-control': 'no-store' })
      }

      // "Can't sign in?" on the admin page, before any login: goes to operators
      // like a change request, throttled per caller like the reset link.
      if (method === 'POST' && path === '/api/signin-help') {
        const ip = event.requestContext?.http?.sourceIp ?? 'unknown'
        if (!allow(helpTries, ip)) return json(429, { error: 'Too many tries. Wait ten minutes and try again.' }, { 'cache-control': 'no-store' })
        return json(201, await requests.signinHelp(parseBody(event)), { 'cache-control': 'no-store' })
      }

      // Single sign-on to a site's editor. The admin page holds the Neon Auth
      // session (first-party there), and a site's own domain cannot read it, so
      // the admin page trades its Neon JWT for an editor token bound to one site
      // and hands it to that site in the URL fragment. Only a Neon JWT may ask:
      // an editor token cannot mint another.
      // The user has changed the temporary password an operator gave them
      // (the admin page calls this once auth.changePassword succeeds).
      if (method === 'POST' && path === '/api/me/password-changed') {
        const user = await verified(event)
        if (user.site) throw new ServiceError(403, 'Sign in on the admin page.')
        await deps.control.query('DELETE FROM password_change_required WHERE user_id = $1', [user.id])
        return json(200, { ok: true }, { 'cache-control': 'no-store' })
      }
      if (method === 'POST' && path === '/api/handoff') {
        const user = await verified(event)
        if (user.site) throw new ServiceError(403, 'Sign in on the admin page.')
        if (await passwordChangeRequired(user.id)) throw new ServiceError(403, 'Choose your own password first, on the admin page.')
        const slug = String(parseBody(event).site ?? '')
        const site = /^[a-z0-9-]+$/.test(slug) ? await loadSite(slug) : null
        if (!site) return json(404, { error: 'No such site.' }, { 'cache-control': 'no-store' })
        const member = await authorize(event, site)
        const token = await deps.signEditorToken({ id: member.id, email: member.email, site: site.slug })
        // Which of the site's addresses to open (production or a preview);
        // only one the site lists, so this cannot send a token elsewhere.
        const asked = parseBody(event).origin
        const url = site.allowed_origins.includes(asked) ? asked : site.allowed_origins[0]
        return json(200, { token, url }, { 'cache-control': 'private, no-store' })
      }

      // "Request a change" from the admin page (same origin, so no CORS): a
      // member of the named site, signed in there.
      if (method === 'POST' && path === '/api/requests') {
        const body = parseBody(event)
        const site = /^[a-z0-9-]+$/.test(String(body.site ?? '')) ? await loadSite(body.site) : null
        if (!site) return json(404, { error: 'No such site.' }, { 'cache-control': 'no-store' })
        const member = await authorize(event, site)
        return json(201, await requests.submit(site, member, body), { 'cache-control': 'no-store' })
      }

      // The signed-in user's own tickets, with the replies to them.
      if (method === 'GET' && path === '/api/me/requests') {
        const user = await verified(event)
        return json(200, await requests.mine(user), { 'cache-control': 'private, no-store' })
      }

      // Anyone signed in on the admin page can be told about their tickets on
      // this device; an editor token (bound to one site) cannot subscribe.
      if (path === '/api/me/push' && (method === 'POST' || method === 'DELETE')) {
        const user = await verified(event)
        if (user.site) return json(403, { error: 'Sign in on the admin page.' }, { 'cache-control': 'no-store' })
        const body = parseBody(event)
        if (method === 'POST') await requests.subscribe(user, body.subscription)
        else await requests.unsubscribe(user, body.endpoint)
        return json(200, { ok: true }, { 'cache-control': 'no-store' })
      }

      // Web Push for operators on the admin page. The public key is public.
      if (method === 'GET' && path === '/api/push/key') return json(200, { key: await requests.publicKey() })

      // The management page (same origin): operators only, see manage.js.
      const mg = path.match(/^\/api\/manage(\/.*)?$/)
      if (mg) {
        const user = await verified(event)
        const body = ['POST', 'PUT', 'DELETE'].includes(method) ? parseBody(event) : {}
        return json(200, await manage(method, mg[1] ?? '', body, user), { 'cache-control': 'private, no-store' })
      }

      // The admin home page (same origin, so no CORS): the sites this login edits.
      if (method === 'GET' && path === '/api/me/sites') {
        const user = await verified(event)
        const { rows } = await deps.control.query(
          `SELECT s.slug, s.name, s.allowed_origins, s.schema, m.role FROM site_members m JOIN sites s ON s.id = m.site_id
           WHERE m.user_id = $1 ORDER BY s.name`, [user.id])
        const operator = !user.site && (await deps.control.query('SELECT 1 FROM operators WHERE user_id = $1', [user.id])).rows.length > 0
        const mustChangePassword = await passwordChangeRequired(user.id)
        return json(200, { email: user.email, operator, mustChangePassword, sites: rows.map((r) => ({ slug: r.slug, name: r.name, role: r.role, url: r.allowed_origins[0], origins: r.allowed_origins, logo: logoOf(r.schema, r.allowed_origins[0]) })) },
          { 'cache-control': 'private, no-store' })
      }

      const m = path.match(/^\/api\/sites\/([a-z0-9-]+)(\/.*)?$/)
      if (!m) return json(404, { error: 'Not found.' })
      const site = await loadSite(m[1])
      if (!site) return json(404, { error: 'No such site.' })
      headers = cors(origin, site)
      // A browser request from anywhere else gets no CORS headers, so the
      // browser refuses the response; refusing here as well saves the work.
      if (origin && !headers['access-control-allow-origin']) return json(403, { error: 'Origin not allowed.' })
      if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' }

      const rest = m[2] ?? ''

      // Public: what the loader and visitors need, no login.
      if (method === 'GET' && rest === '/boot') {
        return json(200, {
          site: site.slug, name: site.name, url: site.allowed_origins[0], logo: logoOf(site.schema, site.allowed_origins[0]), version: site.console_version,
          integrity: site.console_integrity, schema: site.schema,
        }, { ...headers, 'cache-control': 'public, max-age=60' })
      }
      const pub = rest.match(/^\/public\/([a-zA-Z0-9_]+)$/)
      if (method === 'GET' && pub) {
        const docs = await (await serviceFor(site)).listPublished(pub[1])
        return json(200, docs, { ...headers, 'cache-control': 'public, max-age=30, stale-while-revalidate=300' })
      }

      // Everything else edits, so it needs a member's login.
      // Never cacheable: CloudFront sits in front of this API and keys on the path,
      // so a cached draft list would be served to the next caller.
      headers = { ...headers, 'cache-control': 'private, no-store' }
      const user = await authorize(event, site)
      // Who this sign-in is, for a site's own backend guarding its admin routes
      // (StoryShaped's inventory): a 200 means a member of this site.
      if (method === 'GET' && rest === '/me') return json(200, { id: user.id, email: user.email ?? null, role: user.role }, headers)
      // The owner's own section and collection types (schema/custom.js). Owners
      // only; a type still used by a document cannot be dropped.
      if (method === 'PUT' && rest === '/custom-schema') {
        if (user.role !== 'owner') throw new ServiceError(403, 'Only the site owner can change its types.')
        const custom = parseBody(event).custom ?? {}
        const problems = checkCustom(site.base_schema ?? site.schema, custom)
        if (problems.length) throw new ServiceError(400, `Those types cannot be saved: ${problems[0]}`, { errors: problems })
        const gone = droppedCustom(site.custom_schema, custom)
        if (gone.types.length || gone.blocks.length) {
          const db = await deps.siteDb(site)
          for (const t of gone.types) {
            if ((await db.query('SELECT 1 FROM documents WHERE type = $1 LIMIT 1', [t])).rows.length) {
              throw new ServiceError(409, `"${site.custom_schema.types[t].label}" still has entries. Delete them first.`)
            }
          }
          for (const b of gone.blocks) {
            if ((await db.query(`SELECT 1 FROM documents WHERE data::text LIKE $1 OR published_data::text LIKE $1 LIMIT 1`, [`%"_type": "${b}"%`])).rows.length) {
              throw new ServiceError(409, `"${site.custom_schema.blocks[b].label}" is still on a page. Remove those sections first.`)
            }
          }
        }
        await deps.control.query('UPDATE sites SET custom_schema = $2, updated_at = now() WHERE id = $1', [site.id, custom])
        siteCache.delete(site.slug)
        return json(200, { schema: mergeCustom(site.base_schema ?? site.schema, custom) }, headers)
      }
      // "Request a change" from the editor on the site itself.
      if (method === 'POST' && rest === '/requests') return json(201, await requests.submit(site, user, parseBody(event)), headers)
      const svc = await serviceFor(site)
      const body = ['POST', 'PUT'].includes(method) ? parseBody(event) : {}

      // "To the Developer" in the editor: what is not yet live, and pushing it.
      // A `request` with the push goes to Edge of the Map as a change request,
      // only once the push has gone through.
      if (method === 'GET' && rest === '/release') return json(200, { pending: await svc.pending() }, headers)
      if (method === 'POST' && rest === '/release') {
        const result = await svc.publishAll(user)
        const note = String(body.request ?? '').trim()
        if (note) {
          const pushed = `Pushed ${result.published.length} change${result.published.length === 1 ? '' : 's'} to production${result.published.length ? `: ${result.published.map((d) => d.title).join(', ')}` : ''}.`
          result.request = await requests.submit(site, user, { body: `${note}

${pushed}`, page: body.page })
        }
        return json(200, { ...result, pending: await svc.pending() }, headers)
      }

      if (method === 'GET' && rest === '/documents') return json(200, await svc.list(query.type), headers)
      if (method === 'POST' && rest === '/documents') return json(201, await svc.create(body, user), headers)

      if (method === 'POST' && rest === '/uploads') {
        // The shared bucket, each site in its own folder, unless the site has a bucket of its own.
        const own = Boolean(site.media_bucket)
        const bucket = own ? site.media_bucket : deps.media?.bucket
        const baseUrl = own ? site.media_base_url : deps.media?.baseUrl
        if (!bucket || !baseUrl) return json(503, { error: 'Photo storage is not set up for this site yet.' }, headers)
        const ext = IMAGE_TYPES[body.contentType]
        if (!ext) return json(415, { error: 'Photos must be WebP, JPEG, PNG or AVIF.' }, headers)
        if (!(body.bytes > 0 && body.bytes <= MAX_UPLOAD_BYTES)) return json(413, { error: 'Photo is too large.' }, headers)
        const key = `${own ? '' : `sites/${site.slug}/`}uploads/${new Date().toISOString().slice(0, 7)}/${globalThis.crypto.randomUUID()}.${ext}`
        const uploadUrl = await deps.presign({ bucket, key, contentType: body.contentType, bytes: body.bytes })
        return json(200, { uploadUrl, src: `${baseUrl.replace(/\/$/, '')}/${key}` }, headers)
      }

      const doc = rest.match(/^\/documents\/([0-9a-f-]{36})(\/(duplicate|publish|unpublish))?$/i)
      if (doc) {
        const [, id, , action] = doc
        if (method === 'GET' && !action) return json(200, await svc.get(id), headers)
        if (method === 'PUT' && !action) return json(200, await svc.save(id, body, user), headers)
        if (method === 'DELETE' && !action) return json(200, await svc.remove(id, { baseVersion: Number(query.baseVersion) }), headers)
        if (method === 'POST' && action === 'duplicate') return json(201, await svc.duplicate(id, user), headers)
        if (method === 'POST' && action === 'publish') return json(200, await svc.publish(id, body, user), headers)
        if (method === 'POST' && action === 'unpublish') return json(200, await svc.unpublish(id, body, user), headers)
      }
      return json(404, { error: 'Not found.' }, headers)
    } catch (err) {
      if (err instanceof ServiceError) {
        return json(err.status, { error: err.message, errors: err.errors, current: err.current }, headers)
      }
      console.error('[console-api]', err)
      // The management page is operator-only (checked before any other query),
      // and its logs are not to hand, so it shows the cause.
      const detail = path.startsWith('/api/manage') ? ` (${err.message})` : ''
      return json(500, { error: `Something went wrong on our side.${detail}` }, headers)
    }
  }
}
