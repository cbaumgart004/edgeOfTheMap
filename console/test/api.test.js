import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { createHandler } from '../api/handler.js'
import { sanitizeRichText, sanitizeDocumentData } from '../src/richtext.js'

const schema = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url), 'utf8'))
const purify = createDOMPurify(new JSDOM('').window)
const ORIGIN = 'https://spiritseedswellness.com'
const SITE = {
  id: 'site-1', slug: 'spiritseeds', name: 'Spirit Seeds', schema, console_version: '0.1.0', console_integrity: 'sha384-x',
  allowed_origins: [ORIGIN], connection_param: '/eotm/sites/spiritseeds/db', media_bucket: 'bucket', media_base_url: 'https://media.example',
}

// A fake site project that understands only the statements repo-pg.js sends.
function fakeSiteDb() {
  const rows = new Map()
  let seq = 0
  const col = (d) => ({ ...d })
  return {
    async query(sql, p) {
      if (sql.startsWith('INSERT INTO documents')) {
        const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
        const r = { id, type: p[0], slug: p[1], status: p[2], version: p[3], data: p[4], published_data: p[5], published_at: p[6], updated_at: p[7], updated_by: p[8] }
        rows.set(id, r)
        return { rows: [col(r)] }
      }
      if (sql.startsWith('SELECT 1 FROM documents')) return { rows: [...rows.values()].filter((r) => r.type === p[0] && r.slug === p[1] && r.id !== p[2]) }
      if (sql.includes('WHERE id = $1') && sql.startsWith('SELECT')) return { rows: rows.has(p[0]) ? [col(rows.get(p[0]))] : [] }
      if (sql.includes('WHERE type = $1')) return { rows: [...rows.values()].filter((r) => r.type === p[0]).map(col) }
      if (sql.startsWith('UPDATE documents')) {
        const r = rows.get(p[0])
        if (!r || r.version !== p[1]) return { rows: [] }
        Object.assign(r, { slug: p[2], status: p[3], version: p[4], data: p[5], published_data: p[6], published_at: p[7], updated_at: p[8], updated_by: p[9] })
        return { rows: [col(r)] }
      }
      if (sql.startsWith('DELETE')) {
        const r = rows.get(p[0])
        if (!r || r.version !== p[1]) return { rowCount: 0 }
        rows.delete(p[0])
        return { rowCount: 1 }
      }
      if (sql.startsWith('INSERT INTO document_revisions')) return { rows: [] }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
}

function setup({ member = true, site = SITE, media } = {}) {
  const db = fakeSiteDb()
  const handle = createHandler({
    control: {
      async query(sql) {
        if (sql.includes('FROM sites')) return { rows: [site] }
        if (sql.includes('FROM site_members')) return { rows: member ? [{ role: 'owner' }] : [] }
        throw new Error(sql)
      },
    },
    siteDb: async () => db,
    verifyToken: async (t) => { if (t !== 'good') throw new Error('bad'); return { id: 'user-1' } },
    presign: async ({ bucket, key }) => `https://${bucket}.s3.amazonaws.com/${key}?sig`,
    media,
    sanitize: (s) => (type, data) => sanitizeDocumentData(s, type, data, purify),
  })
  const call = (method, path, { body, token = 'good', origin = ORIGIN, query } = {}) =>
    handle({ requestContext: { http: { method } }, rawPath: path, queryStringParameters: query,
      headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
      .then((r) => ({ ...r, json: r.body ? JSON.parse(r.body) : null }))
  return { call }
}

const base = '/api/sites/spiritseeds'
const event = { title: 'New moon circle', startsAt: '2026-10-21T18:30:00-06:00', description: '<p onclick="x()">Join <a href="javascript:bad()">us</a> <span class="text-gradient evil">here</span></p>' }

describe('console API', () => {
  it('serves boot data without a login, with CORS for an allowed origin', async () => {
    const r = await setup().call('GET', `${base}/boot`, { token: null })
    expect(r.statusCode).toBe(200)
    expect(r.json).toMatchObject({ site: 'spiritseeds', version: '0.1.0', url: ORIGIN, logo: `${ORIGIN}/uploads/SpiritSeedsLogo.jpg` })
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  it('refuses an origin the site does not list', async () => {
    const r = await setup().call('GET', `${base}/boot`, { origin: 'https://evil.example' })
    expect(r.statusCode).toBe(403)
  })

  it('needs a valid login that is a member of the site', async () => {
    expect((await setup().call('GET', `${base}/documents`, { token: null, query: { type: 'event' } })).statusCode).toBe(401)
    expect((await setup().call('GET', `${base}/documents`, { token: 'forged', query: { type: 'event' } })).statusCode).toBe(401)
    expect((await setup({ member: false }).call('GET', `${base}/documents`, { query: { type: 'event' } })).statusCode).toBe(403)
  })

  it('tells a site backend who a member is, and nothing to anyone else', async () => {
    const me = await setup().call('GET', `${base}/me`, { origin: undefined })
    expect([me.statusCode, me.json]).toEqual([200, { id: 'user-1', email: null, role: 'owner' }])
    expect((await setup({ member: false }).call('GET', `${base}/me`, { origin: undefined })).statusCode).toBe(403)
    expect((await setup().call('GET', `${base}/me`, { token: 'forged', origin: undefined })).statusCode).toBe(401)
  })

  it('sanitizes rich text on create: no handlers, no javascript: links, only brand classes', async () => {
    const r = await setup().call('POST', `${base}/documents`, { body: { type: 'event', data: event } })
    expect(r.statusCode).toBe(201)
    expect(r.json.data.description).toBe('<p>Join <a>us</a> <span class="text-gradient">here</span></p>')
  })

  it('runs create, conflict, publish and the public read end to end', async () => {
    const { call } = setup()
    const created = (await call('POST', `${base}/documents`, { body: { type: 'event', data: event } })).json
    const saved = (await call('PUT', `${base}/documents/${created.id}`, { body: { baseVersion: 1, data: { ...created.data, location: 'Lafayette' } } })).json
    const stale = await call('PUT', `${base}/documents/${created.id}`, { body: { baseVersion: 1, data: created.data } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json.current.data.location).toBe('Lafayette')
    expect((await call('GET', `${base}/public/event`, { token: null })).json).toEqual([])
    const live = await call('POST', `${base}/documents/${created.id}/publish`, { body: { baseVersion: saved.version } })
    expect(live.json.status).toBe('published')
    const pub = (await call('GET', `${base}/public/event`, { token: null })).json
    expect(pub).toHaveLength(1)
    expect(pub[0].data.location).toBe('Lafayette')
  })

  it('signs an upload into the site bucket and refuses other file types', async () => {
    const { call } = setup()
    const ok = await call('POST', `${base}/uploads`, { body: { contentType: 'image/webp', bytes: 20000 } })
    expect(ok.json.src).toMatch(/^https:\/\/media\.example\/uploads\/\d{4}-\d{2}\/[0-9a-f-]+\.webp$/)
    expect((await call('POST', `${base}/uploads`, { body: { contentType: 'text/html', bytes: 10 } })).statusCode).toBe(415)
  })

  it('puts a site without a bucket of its own in the shared bucket, under its own folder', async () => {
    const shared = { ...SITE, media_bucket: '', media_base_url: '' }
    const { call } = setup({ site: shared, media: { bucket: 'eotm-photos', baseUrl: 'https://photos.example/' } })
    const ok = (await call('POST', `${base}/uploads`, { body: { contentType: 'image/webp', bytes: 20000 } })).json
    expect(ok.uploadUrl).toMatch(/^https:\/\/eotm-photos\.s3\.amazonaws\.com\/sites\/spiritseeds\/uploads\//)
    expect(ok.src).toMatch(/^https:\/\/photos\.example\/sites\/spiritseeds\/uploads\/\d{4}-\d{2}\/[0-9a-f-]+\.webp$/)
    const none = setup({ site: shared })
    expect((await none.call('POST', `${base}/uploads`, { body: { contentType: 'image/webp', bytes: 20000 } })).statusCode).toBe(503)
  })
})

describe('rich text', () => {
  it('keeps links, inline images and brand classes', () => {
    const html = '<p><a href="https://x.example" target="_blank">x</a><img src="/uploads/a.webp" alt="a"><span class="text-outline">y</span></p>'
    expect(sanitizeRichText(html, schema, purify)).toBe(
      '<p><a href="https://x.example" target="_blank" rel="noopener noreferrer">x</a><img src="/uploads/a.webp" alt="a"><span class="text-outline">y</span></p>')
  })
})

describe('password reset lookup', () => {
  const make = (users) => {
    const sent = []
    const handle = createHandler({
      control: { async query(sql, p) { if (sql.includes('neon_auth')) return { rows: users.includes(p[0]) ? [{}] : [] }; throw new Error(sql) } },
      siteDb: async () => null, verifyToken: async () => ({}), presign: async () => '', sanitize: () => (t, d) => d,
      requestPasswordReset: async (email) => sent.push(email),
    })
    const call = (email, ip = '1.1.1.1') => handle({ requestContext: { http: { method: 'POST', sourceIp: ip } }, rawPath: '/api/password-reset', headers: {}, body: JSON.stringify({ email }) })
      .then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }))
    return { call, sent }
  }

  it('sends only for an existing login and says which', async () => {
    const { call, sent } = make(['keeper@example.com'])
    expect(await call('Keeper@Example.com')).toMatchObject({ status: 200, json: { sent: true, email: 'keeper@example.com' } })
    expect(await call('nobody@example.com')).toMatchObject({ status: 404, json: { exists: false } })
    expect(sent).toEqual(['keeper@example.com'])
  })

  it('throttles one caller to five tries in ten minutes', async () => {
    const { call } = make([])
    for (let i = 0; i < 5; i++) expect((await call(`a${i}@example.com`, '9.9.9.9')).status).toBe(404)
    expect((await call('a6@example.com', '9.9.9.9')).status).toBe(429)
    expect((await call('a6@example.com', '8.8.8.8')).status).toBe(404)
  })
})

describe('sign-in help', () => {
  it('reaches operators without a login, throttled per caller', async () => {
    const asked = []
    const handle = createHandler({
      control: {
        async query(sql, p) {
          if (sql.startsWith('INSERT INTO change_requests')) { asked.push(p); return { rows: [{ id: 'r-1' }] } }
          if (sql.includes('FROM operators')) return { rows: [] }
          if (sql.includes('push_subscriptions')) return { rows: [] }
          throw new Error(sql)
        },
      },
      siteDb: async () => null, verifyToken: async () => ({}), presign: async () => '', sanitize: () => (t, d) => d,
    })
    const call = (body) => handle({ requestContext: { http: { method: 'POST', sourceIp: '7.7.7.7' } }, rawPath: '/api/signin-help', headers: {}, body: JSON.stringify(body) })
      .then((r) => r.statusCode)
    expect(await call({ email: 'Owner@Example.com', body: 'The password is refused' })).toBe(201)
    expect(asked[0]).toEqual([null, null, 'owner@example.com', null, 'The password is refused'])
    expect(await call({ email: 'not an email' })).toBe(400)
    for (let i = 0; i < 3; i++) await call({ email: 'a@example.com' })
    expect(await call({ email: 'a@example.com' })).toBe(429)
  })
})

describe('editor handoff', () => {
  const make = ({ member = true, mustChange = [] } = {}) => {
    const handle = createHandler({
      control: {
        async query(sql, p = []) {
          if (sql.startsWith('SELECT 1 FROM password_change_required')) return { rows: mustChange.includes(p[0]) ? [{}] : [] }
          if (sql.startsWith('DELETE FROM password_change_required')) { mustChange.splice(mustChange.indexOf(p[0]) >>> 0, 1); return { rows: [] } }
          if (sql.includes('FROM sites')) return { rows: [SITE] }
          if (sql.includes('FROM site_members')) return { rows: member ? [{ role: 'owner' }] : [] }
          throw new Error(sql)
        },
      },
      siteDb: async () => fakeSiteDb(),
      // "neon" is an admin-page JWT; "editor:<site>" an editor token for that site.
      verifyToken: async (t) => t === 'neon' ? { id: 'user-1', email: 'o@x.example' }
        : t.startsWith('editor:') ? { id: 'user-1', email: 'o@x.example', site: t.slice(7) } : Promise.reject(new Error('bad')),
      signEditorToken: async ({ site }) => `editor:${site}`,
      presign: async () => '', sanitize: () => (t, d) => d,
    })
    return (method, path, { token, body, origin } = {}) => handle({ requestContext: { http: { method } }, rawPath: path, queryStringParameters: { type: 'event' },
      headers: { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
      .then((r) => ({ status: r.statusCode, json: JSON.parse(r.body || 'null') }))
  }

  it('trades an admin sign-in for a token bound to one site the login edits', async () => {
    const call = make()
    expect(await call('POST', '/api/handoff', { token: 'neon', body: { site: 'spiritseeds' } }))
      .toMatchObject({ status: 200, json: { token: 'editor:spiritseeds', url: ORIGIN } })
    expect((await make({ member: false })('POST', '/api/handoff', { token: 'neon', body: { site: 'spiritseeds' } })).status).toBe(403)
    expect((await call('POST', '/api/handoff', { body: { site: 'spiritseeds' } })).status).toBe(401)
  })

  it('opens only an address the site lists', async () => {
    const call = make()
    expect((await call('POST', '/api/handoff', { token: 'neon', body: { site: 'spiritseeds', origin: 'https://evil.example' } })).json.url).toBe(ORIGIN)
  })

  it('will not let an editor token mint another', async () => {
    expect((await make()('POST', '/api/handoff', { token: 'editor:spiritseeds', body: { site: 'spiritseeds' } })).status).toBe(403)
  })

  it('an editor token edits its own site and no other', async () => {
    const call = make()
    const q = '/documents'
    expect((await call('GET', `/api/sites/spiritseeds${q}`, { token: 'editor:spiritseeds', origin: ORIGIN })).status).toBe(200)
    expect((await call('GET', `/api/sites/spiritseeds${q}`, { token: 'editor:storyshaped', origin: ORIGIN })).status).toBe(403)
  })

  it('opens no editor until a temporary password is replaced, then does', async () => {
    const mustChange = ['user-1']
    const call = make({ mustChange })
    expect((await call('POST', '/api/handoff', { token: 'neon', body: { site: 'spiritseeds' } })).status).toBe(403)
    expect((await call('POST', '/api/me/password-changed', { token: 'editor:spiritseeds' })).status).toBe(403)
    expect((await call('POST', '/api/me/password-changed', { token: 'neon' })).status).toBe(200)
    expect(mustChange).toEqual([])
    expect((await call('POST', '/api/handoff', { token: 'neon', body: { site: 'spiritseeds' } })).status).toBe(200)
  })

  it('lists pending changes and pushes them all to production', async () => {
    const { call } = setup()
    const made = await call('POST', `${base}/documents`, { body: { type: 'event', data: event } })
    expect(made.statusCode).toBe(201)
    const before = await call('GET', `${base}/release`)
    expect(before.json.pending.map((d) => d.id)).toContain(made.json.id)
    const pushed = await call('POST', `${base}/release`, { body: {} })
    expect(pushed.statusCode).toBe(200)
    expect(pushed.json.published.map((d) => d.id)).toContain(made.json.id)
    expect(pushed.json.pending).toEqual([])
  })
})
