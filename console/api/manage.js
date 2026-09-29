// The management page on admin.theedgeofthemap.com: every site, its repo,
// editor version, photo storage and members, and the logins behind them. Only
// an operator (control table `operators`) signed in on the admin page gets here;
// an editor token, which is bound to one site, never does.
//
// deps (from handler.js): control, releases(), createLogin({ email, password, name })

import { ServiceError } from '../core/service.js'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ROLES = ['owner', 'editor']

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
    const { rows } = await q('SELECT id, email, name FROM neon_auth."user" WHERE lower(email) = $1', [email])
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
    const sites = (await q(`SELECT id, slug, name, repo, allowed_origins, console_version, media_bucket, media_base_url, updated_at
                            FROM sites ORDER BY name`)).rows
    const members = (await q(`SELECT m.site_id, m.user_id, m.role, u.email, u.name
                              FROM site_members m LEFT JOIN neon_auth."user" u ON u.id = m.user_id
                              ORDER BY u.email`)).rows
    const operators = (await q(`SELECT o.user_id, u.email FROM operators o LEFT JOIN neon_auth."user" u ON u.id = o.user_id
                                ORDER BY u.email`)).rows
    const logins = (await q('SELECT id, email, name, "createdAt" AS created_at FROM neon_auth."user" ORDER BY email')).rows
    return {
      sites: sites.map(({ id, allowed_origins, ...s }) => ({
        ...s, origins: allowed_origins, members: members.filter((m) => m.site_id === id).map(({ site_id, ...m }) => m),
      })),
      operators,
      logins,
      releases: await deps.releases(),
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
    if (body.site) await addMember(String(body.site), user.id, body.role ?? 'editor')
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
      if (method === 'DELETE' && userId) {
        if (userId === user.id) throw new ServiceError(400, 'You cannot remove yourself.')
        await q('DELETE FROM site_members WHERE site_id = $1 AND user_id = $2', [await siteId(slug), userId])
        return { ok: true }
      }
    }
    throw new ServiceError(404, 'Not found.')
  }
}
