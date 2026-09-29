import { describe, it, expect } from 'vitest'
import { createHandler } from '../api/handler.js'

// A control project that understands only what manage.js sends.
function world({ operator = true } = {}) {
  const logins = [{ id: 'op-1', email: 'op@eotm.example', name: 'Op' }]
  const members = []
  const sites = [{ id: 's-1', slug: 'storyshaped', name: 'Story Shaped', repo: null, allowed_origins: ['https://ss.example'],
    console_version: '0.1.1', console_integrity: 'sha384-old', media_bucket: '', media_base_url: '' }]
  const updates = []
  const control = {
    async query(sql, p = []) {
      if (sql.startsWith('SELECT 1 FROM operators')) return { rows: operator && p[0] === 'op-1' ? [{}] : [] }
      if (sql.includes('FROM neon_auth."user" WHERE lower(email)')) return { rows: logins.filter((l) => l.email === p[0]) }
      if (sql.startsWith('SELECT id FROM sites')) return { rows: sites.filter((s) => s.slug === p[0]) }
      if (sql.startsWith('INSERT INTO site_members')) { members.push({ site_id: p[0], user_id: p[1], role: p[2] }); return { rows: [] } }
      if (sql.startsWith('UPDATE sites')) { updates.push({ sql, p }); return { rowCount: 1 } }
      if (sql.includes('FROM sites ORDER BY name')) return { rows: sites }
      if (sql.includes('FROM site_members m')) return { rows: members }
      if (sql.includes('FROM operators o')) return { rows: [{ user_id: 'op-1', email: 'op@eotm.example' }] }
      if (sql.includes('FROM neon_auth."user" ORDER BY')) return { rows: logins }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  const created = []
  const handle = createHandler({
    control, siteDb: async () => null, presign: async () => '', sanitize: () => (t, d) => d,
    verifyToken: async (t) => t === 'op' ? { id: 'op-1', email: 'op@eotm.example' }
      : t === 'editor' ? { id: 'op-1', email: 'op@eotm.example', site: 'storyshaped' } : Promise.reject(new Error('bad')),
    releases: async () => [{ version: '0.1.1', integrity: 'sha384-old' }, { version: '0.1.2', integrity: 'sha384-new' }],
    createLogin: async ({ email }) => { const u = { id: `u-${created.length + 1}`, email }; created.push(u); logins.push(u); return u },
  })
  const call = (method, path, { token = 'op', body } = {}) => handle({ requestContext: { http: { method } }, rawPath: path,
    headers: token ? { authorization: `Bearer ${token}` } : {}, body: body && JSON.stringify(body) })
    .then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }))
  return { call, members, created, updates }
}

describe('management page API', () => {
  it('is for operators signed in on the admin page only', async () => {
    expect((await world().call('GET', '/api/manage')).status).toBe(200)
    expect((await world({ operator: false }).call('GET', '/api/manage')).status).toBe(403)
    expect((await world().call('GET', '/api/manage', { token: 'editor' })).status).toBe(403)
    expect((await world().call('GET', '/api/manage', { token: null })).status).toBe(401)
  })

  it('creates a login with a temporary password and gives it a site', async () => {
    const w = world()
    const r = await w.call('POST', '/api/manage/users', { body: { email: 'New@Shop.example', password: 'temp-pass-1', site: 'storyshaped', role: 'editor' } })
    expect(r.json).toMatchObject({ email: 'new@shop.example', created: true })
    expect(w.members).toEqual([{ site_id: 's-1', user_id: 'u-1', role: 'editor' }])
    expect((await w.call('POST', '/api/manage/users', { body: { email: 'b@shop.example', password: 'short' } })).status).toBe(400)
  })

  it('reuses an existing login instead of creating a second', async () => {
    const w = world()
    const r = await w.call('POST', '/api/manage/users', { body: { email: 'op@eotm.example', site: 'storyshaped', role: 'owner' } })
    expect(r.json.created).toBe(false)
    expect(w.created).toEqual([])
  })

  it('pins a site to a released version with that release\'s integrity', async () => {
    const w = world()
    expect((await w.call('PUT', '/api/manage/sites/storyshaped', { body: { consoleVersion: '0.1.2' } })).status).toBe(200)
    expect(w.updates[0].p).toEqual(['0.1.2', 'sha384-new', 'storyshaped'])
    expect((await w.call('PUT', '/api/manage/sites/storyshaped', { body: { consoleVersion: '9.9.9' } })).status).toBe(400)
  })
})

describe('placement field', async () => {
  const { checkDocument, checkSchema } = await import('../schema/schema.js')
  const schema = { version: 1, site: 's', brand: { name: 'S' }, types: { a: { label: 'A', titleField: 't', fields: [{ name: 't', kind: 'text' }, { name: 'after', kind: 'placement' }] } } }
  it('accepts first, last or a key, and nothing else', () => {
    expect(checkSchema(schema)).toEqual([])
    for (const after of ['', '^', 'what-is-uranium-glass']) expect(checkDocument(schema, 'a', { t: 'x', after })).toEqual([])
    expect(checkDocument(schema, 'a', { t: 'x', after: 3 }).length).toBe(1)
  })
})

describe('site notes', () => {
  it('keeps where things live and refuses what looks like a secret', async () => {
    const w = world()
    expect((await w.call('PUT', '/api/manage/sites/storyshaped', { body: { notes: 'Registrar: Porkbun, renews 2028-05-25. DNS at Porkbun.' } })).status).toBe(200)
    for (const notes of ['AWS root password: hunter22', 'key AKIAABCDEFGHIJKLMNOP', 'postgres://u:pw@host/db', 'api_key = abcdefghijkl']) {
      expect((await w.call('PUT', '/api/manage/sites/storyshaped', { body: { notes } })).status).toBe(400)
    }
  })
})
