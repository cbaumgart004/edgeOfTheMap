import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { createHandler } from '../api/handler.js'
import { sanitizeRichText, sanitizeDocumentData } from '../src/richtext.js'

const schema = JSON.parse(readFileSync(new URL('../schema/sites/spiritseeds.json', import.meta.url), 'utf8'))
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

function setup({ member = true } = {}) {
  const db = fakeSiteDb()
  const handle = createHandler({
    control: {
      async query(sql) {
        if (sql.includes('FROM sites')) return { rows: [SITE] }
        if (sql.includes('FROM site_members')) return { rows: member ? [{ role: 'owner' }] : [] }
        throw new Error(sql)
      },
    },
    siteDb: async () => db,
    verifyToken: async (t) => { if (t !== 'good') throw new Error('bad'); return { id: 'user-1' } },
    presign: async ({ key }) => `https://bucket.s3.amazonaws.com/${key}?sig`,
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
    expect(r.json).toMatchObject({ site: 'spiritseeds', version: '0.1.0' })
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
})

describe('rich text', () => {
  it('keeps links, inline images and brand classes', () => {
    const html = '<p><a href="https://x.example" target="_blank">x</a><img src="/uploads/a.webp" alt="a"><span class="text-outline">y</span></p>'
    expect(sanitizeRichText(html, schema, purify)).toBe(
      '<p><a href="https://x.example" target="_blank" rel="noopener noreferrer">x</a><img src="/uploads/a.webp" alt="a"><span class="text-outline">y</span></p>')
  })
})
