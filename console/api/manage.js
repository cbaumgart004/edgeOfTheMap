// The management page on admin.theedgeofthemap.com: every site, its repo,
// editor version, photo storage and members, and the logins behind them. Only
// an operator (control table `operators`) signed in on the admin page gets here;
// an editor token, which is bound to one site, never does.
//
// deps (from handler.js): control, releases(), createLogin({ email, password, name }),
//   siteSchema(slug): the schema shipped in this package (schema/sites/<slug>.json)
//   requests: api/requests.js (tickets and this operator's push subscriptions)
//   monitors: api/monitors.js, the UptimeRobot monitors and their key
//   logs({ hours, errorsOnly }): api/logs.js, this API's own CloudWatch log (absent outside Lambda)

import { ServiceError } from '../core/service.js'
import { checkSchema } from '../schema/schema.js'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ROLES = ['owner', 'editor']

// Notes are for where things live, not the keys to them: passwords belong in a
// password manager. Refuse text shaped like a credential, so one pasted by
// mistake never reaches the database.
const SECRET_SHAPES = [
  [/\b(password|passwd|pwd|passcode)\s*[:=]/i, 'a password'],
  [/\b(secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*\S{8,}/i, 'a key or token'],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/, 'an AWS access key'],
  [/[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i, 'a connection string with a password'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abp]-[A-Za-z0-9-]{10,}/, 'a service token'],
]
function checkNotes(text) {
  if (text.length > 4000) throw new ServiceError(400, 'Notes are limited to 4,000 characters.')
  const hit = SECRET_SHAPES.find(([re]) => re.test(text))
  if (hit) throw new ServiceError(400, `The notes look like they contain ${hit[1]}. Keep that in a password manager; notes are for where things live.`)
}

// A company's setup record (sites.profile): where each piece lives and the
// address that opens it, so any of them is one click from the Manage page.
// kind: text (a name or id), url (https only, shown as a link), lines (one per line).
export const PROFILE_FIELDS = [
  { key: 'domain', label: 'Production domain', kind: 'text', placeholder: 'example.com' },
  { key: 'registrar', label: 'Registrar', kind: 'text', placeholder: 'Porkbun' },
  { key: 'registrarUrl', label: 'Registrar domain page', kind: 'url' },
  { key: 'dnsHost', label: 'DNS host', kind: 'text', placeholder: 'Porkbun' },
  { key: 'dnsUrl', label: 'DNS records page', kind: 'url' },
  { key: 'awsAccountId', label: 'AWS account id', kind: 'text', pattern: /^\d{12}$/, placeholder: '12 digits' },
  { key: 'amplifyAppId', label: 'Amplify app id', kind: 'text', pattern: /^[a-z0-9]{8,20}$/, placeholder: 'd1a2b3c4d5e6f7' },
  { key: 'amplifyUrl', label: 'Amplify app page', kind: 'url' },
  { key: 'cloudfrontId', label: 'Photo CloudFront distribution id', kind: 'text', pattern: /^E[A-Z0-9]{8,20}$/, placeholder: 'E1ABCDEF2GHIJK' },
  { key: 'cloudfrontUrl', label: 'CloudFront distribution page', kind: 'url' },
  { key: 'emailForwards', label: 'Email forwards (one per line: from → to)', kind: 'lines', placeholder: 'hello@example.com → owner@gmail.com' },
]

export function cleanProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ServiceError(400, 'The company details are not in the right shape.')
  const out = {}
  for (const f of PROFILE_FIELDS) {
    const value = String(input[f.key] ?? '').trim()
    if (!value) continue
    if (value.length > (f.kind === 'lines' ? 2000 : 300)) throw new ServiceError(400, `${f.label} is too long.`)
    if (f.kind === 'url' && !/^https:\/\/[^\s]+$/.test(value)) throw new ServiceError(400, `${f.label} must be an https:// address.`)
    if (f.pattern && !f.pattern.test(value)) throw new ServiceError(400, `${f.label} does not look right (${f.placeholder}).`)
    const hit = SECRET_SHAPES.find(([re]) => re.test(value))
    if (hit) throw new ServiceError(400, `${f.label} looks like it contains ${hit[1]}. Keep that in a password manager.`)
    out[f.key] = value
  }
  return out
}

export function createManage(deps, { onSiteChange }) {
  const q = (sql, params) => deps.control.query(sql, params)

  async function requireOperator(user) {
    if (user.site) throw new ServiceError(403, 'Sign in on the admin page.')
    const { rows } = await q('SELECT 1 FROM operators WHERE user_id = $1', [user.id])
    if (!rows.length) throw new ServiceError(403, 'Only Edge of the Map can manage sites.')
  }

  async function siteId(slug) {
    const { rows } = await q('SELECT id FROM sites WHERE slug = $1', [slug])
    if (!rows.length) throw new ServiceError(404, 'No such site.')
    return rows[0].id
  }

  async function userByEmail(email) {
    const { rows } = await q('SELECT id::text AS id, email, name FROM neon_auth."user" WHERE lower(email) = $1', [email])
    return rows[0] ?? null
  }

  function cleanEmail(value) {
    const email = String(value ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) throw new ServiceError(400, 'Enter an email address.')
    return email
  }

  async function addMember(slug, userId, role = 'editor') {
    if (!ROLES.includes(role)) throw new ServiceError(400, 'Role must be owner or editor.')
    await q(`INSERT INTO site_members (site_id, user_id, role) VALUES ($1, $2, $3)
             ON CONFLICT (site_id, user_id) DO UPDATE SET role = $3`, [await siteId(slug), userId, role])
  }

  async function overview() {
    const sites = (await q(`SELECT id, slug, name, repo, notes, allowed_origins, console_version, media_bucket, media_base_url, profile, updated_at
                            FROM sites ORDER BY name`)).rows
    const members = (await q(`SELECT m.site_id, m.user_id, m.role, u.email, u.name
                              FROM site_members m LEFT JOIN neon_auth."user" u ON u.id::text = m.user_id
                              ORDER BY u.email`)).rows
    const operators = (await q(`SELECT o.user_id, u.email FROM operators o LEFT JOIN neon_auth."user" u ON u.id::text = o.user_id
                                ORDER BY u.email`)).rows
    const logins = (await q('SELECT id::text AS id, email, name FROM neon_auth."user" ORDER BY email')).rows
    return {
      sites: sites.map(({ id, allowed_origins, ...s }) => ({
        ...s, origins: allowed_origins, members: members.filter((m) => m.site_id === id).map(({ site_id, ...m }) => m),
      })),
      operators,
      logins,
      releases: await deps.releases(),
      profileFields: PROFILE_FIELDS.map(({ pattern, ...f }) => f),
    }
  }

  // A new login with a temporary password the operator passes on, or an
  // existing login found by email; either way optionally given a site.
  async function addUser(body) {
    const email = cleanEmail(body.email)
    let user = await userByEmail(email)
    let created = false
    if (!user) {
      const password = String(body.password ?? '')
      if (password.length < 8) throw new ServiceError(400, 'The temporary password needs at least 8 characters.')
      user = await deps.createLogin({ email, password, name: String(body.name ?? '').trim() || email.split('@')[0] })
      created = true
    }
    // The site first: a failure after the login exists must not leave it with no site.
    if (body.site) await addMember(String(body.site), user.id, body.role ?? 'editor')
    // The operator knows this password, so the user must replace it before anything else.
    if (created) await q('INSERT INTO password_change_required (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id])
    return { id: user.id, email, created }
  }

  async function updateSite(slug, body) {
    const sets = []
    const params = []
    const set = (col, value) => { params.push(value); sets.push(`${col} = $${params.length}`) }
    if ('repo' in body) {
      const repo = String(body.repo ?? '').trim()
      if (repo && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) throw new ServiceError(400, 'Repo must be a https://github.com/<owner>/<repo> address.')
      set('repo', repo || null)
    }
    if ('consoleVersion' in body) {
      const release = (await deps.releases()).find((r) => r.version === body.consoleVersion)
      if (!release) throw new ServiceError(400, `Console ${body.consoleVersion} is not released.`)
      set('console_version', release.version)
      set('console_integrity', release.integrity)
    }
    if ('mediaBucket' in body || 'mediaBaseUrl' in body) {
      const bucket = String(body.mediaBucket ?? '').trim()
      const base = String(body.mediaBaseUrl ?? '').trim().replace(/\/$/, '')
      if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new ServiceError(400, 'That is not an S3 bucket name.')
      if (base && !/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(base)) throw new ServiceError(400, 'Photo address must start with https://.')
      set('media_bucket', bucket)
      set('media_base_url', base)
    }
    if ('profile' in body) set('profile', cleanProfile(body.profile))
    if ('notes' in body) {
      const notes = String(body.notes ?? '').trim()
      checkNotes(notes)
      set('notes', notes || null)
    }
    // Saving a site also takes the schema shipped with this deploy, so a
    // schema change reaches the editor without hand-run SQL.
    if (body.reloadSchema) {
      const schema = await deps.siteSchema(slug)
      if (!schema) throw new ServiceError(400, `No schema ships for ${slug}.`)
      const problems = checkSchema(schema)
      if (problems.length) throw new ServiceError(400, `The shipped schema is invalid: ${problems[0]}`)
      set('schema', schema) // the owner's own types stay in custom_schema
    }
    if (!sets.length) throw new ServiceError(400, 'Nothing to change.')
    params.push(slug)
    const { rowCount } = await q(`UPDATE sites SET ${sets.join(', ')}, updated_at = now() WHERE slug = $${params.length}`, params)
    if (!rowCount) throw new ServiceError(404, 'No such site.')
    onSiteChange(slug)
  }

  // rest: the path after /api/manage
  return async function manage(method, rest, body, user) {
    await requireOperator(user)
    if (method === 'GET' && rest === '') return overview()
    if (method === 'POST' && rest === '/users') return addUser(body)
    if (method === 'GET' && rest === '/requests') return deps.requests.list()
    const req = rest.match(/^\/requests\/([0-9a-f-]{36})(\/comments)?$/i)
    if (method === 'PUT' && req && !req[2]) { await deps.requests.update(req[1], body, user); return { ok: true } }
    if (method === 'POST' && req && req[2]) return deps.requests.comment(req[1], body, user)
    if (method === 'GET' && rest === '/monitors') return deps.monitors ? deps.monitors.list() : { configured: false, monitors: [] }
    if (method === 'PUT' && rest === '/monitors/key' && deps.monitors) return deps.monitors.connect(body.key)
    if (method === 'DELETE' && rest === '/monitors/key' && deps.monitors) { await deps.monitors.disconnect(); return { ok: true } }
    if (method === 'GET' && rest === '/logs') {
      if (!deps.logs) throw new ServiceError(503, 'The API log is only readable when running in Lambda.')
      return deps.logs({ hours: 24 })
    }
    if (method === 'POST' && rest === '/push') { await deps.requests.subscribe(user, body.subscription); return { ok: true } }
    if (method === 'DELETE' && rest === '/push') { await deps.requests.unsubscribe(user, body.endpoint); return { ok: true } }
    if (method === 'POST' && rest === '/push/test') return deps.requests.test(user, body.kind)
    if (method === 'POST' && rest === '/operators') {
      const found = await userByEmail(cleanEmail(body.email))
      if (!found) throw new ServiceError(404, 'No login uses that email. Add the user first.')
      await q('INSERT INTO operators (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [found.id])
      return { ok: true }
    }
    const site = rest.match(/^\/sites\/([a-z0-9-]+)(\/members(?:\/([\w-]+))?)?$/)
    if (site) {
      const [, slug, members, userId] = site
      if (method === 'PUT' && !members) { await updateSite(slug, body); return { ok: true } }
      if (method === 'POST' && members && !userId) {
        const found = await userByEmail(cleanEmail(body.email))
        if (!found) throw new ServiceError(404, 'No login uses that email. Add the user first.')
        await addMember(slug, found.id, body.role ?? 'editor')
        return { ok: true }
      }
      if (method === 'PUT' && userId) {
        if (!ROLES.includes(body.role)) throw new ServiceError(400, 'Role must be owner or editor.')
        const { rowCount } = await q('UPDATE site_members SET role = $3 WHERE site_id = $1 AND user_id = $2', [await siteId(slug), userId, body.role])
        if (!rowCount) throw new ServiceError(404, 'That login is not a member of this site.')
        return { ok: true }
      }
      if (method === 'DELETE' && userId) {
        if (userId === user.id) throw new ServiceError(400, 'You cannot remove yourself.')
        await q('DELETE FROM site_members WHERE site_id = $1 AND user_id = $2', [await siteId(slug), userId])
        return { ok: true }
      }
    }
    throw new ServiceError(404, 'Not found.')
  }
}
