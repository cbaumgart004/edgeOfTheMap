import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHandler } from '../api/handler.js'
import { createPublished } from '../api/published.js'

const schema = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url), 'utf8'))
const ORIGIN = 'https://spiritseedswellness.com'
const SITE = {
  id: 'site-1', slug: 'spiritseeds', name: 'Spirit Seeds', schema, console_version: '0.1.0', console_integrity: 'sha384-x',
  allowed_origins: [ORIGIN], connection_param: '/eotm/sites/spiritseeds/db', media_bucket: 'bucket', media_base_url: 'https://media.example',
}

// A site project holding documents, counting every statement it is sent.
function siteDb() {
  const rows = new Map()
  let seq = 0
  const db = {
    queries: 0,
    async query(sql, p) {
      db.queries++
      if (sql.startsWith('INSERT INTO documents')) {
        const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
        const r = { id, type: p[0], slug: p[1], status: p[2], version: p[3], data: p[4], published_data: p[5], published_at: p[6], updated_at: p[7], updated_by: p[8] }
        rows.set(id, r)
        return { rows: [{ ...r }] }
      }
      if (sql.startsWith('SELECT 1 FROM documents')) return { rows: [] }
      if (sql.includes('WHERE id = $1') && sql.startsWith('SELECT')) return { rows: rows.has(p[0]) ? [{ ...rows.get(p[0]) }] : [] }
      if (sql.includes('WHERE type = $1')) return { rows: [...rows.values()].filter((r) => r.type === p[0]).map((r) => ({ ...r })) }
      if (sql.startsWith('UPDATE documents')) {
        const r = rows.get(p[0])
        if (!r || r.version !== p[1]) return { rows: [] }
        Object.assign(r, { slug: p[2], status: p[3], version: p[4], data: p[5], published_data: p[6], published_at: p[7], updated_at: p[8], updated_by: p[9] })
        return { rows: [{ ...r }] }
      }
      if (sql.startsWith('INSERT INTO document_revisions')) return { rows: [] }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  return db
}

function setup() {
  const db = siteDb()
  const control = {
    queries: 0,
    async query(sql) {
      control.queries++
      if (sql.includes('FROM sites')) return { rows: [{ ...SITE }] }
      if (sql.includes('FROM site_members')) return { rows: [{ role: 'owner' }] }
      if (sql.includes('FROM operators')) return { rows: [] }
      throw new Error(sql)
    },
  }
  const store = new Map()
  const handle = createHandler({
    control,
    siteDb: async () => db,
    verifyToken: async () => ({ id: 'user-1' }),
    sanitize: () => (type, data) => data,
    fetch: async () => ({ ok: true, status: 200, headers: new Map(), text: async () => '<html><head><title>Spirit Seeds</title></head><body><div id="root"></div></body></html>' }),
    published: { read: async (slug) => store.get(slug) ?? null, write: async (slug, snap) => { store.set(slug, snap) } },
  })
  const call = (method, path, body) => handle({
    requestContext: { http: { method } }, rawPath: `/api/sites/spiritseeds${path}`,
    headers: { origin: ORIGIN, authorization: 'Bearer good' }, body: body && JSON.stringify(body),
  }).then((r) => ({ ...r, json: r.body && /json/.test(r.headers?.['content-type'] ?? '') ? JSON.parse(r.body) : null }))
  return { call, db, control, store }
}

const EVENT = { title: 'New moon circle', startsAt: '2026-10-21T18:30:00-06:00', description: '<p>Join us</p>' }

describe('published snapshot', () => {
  it('serves public reads without touching either database once built', async () => {
    const { call, db, control, store } = setup()
    const doc = (await call('POST', '/documents', { type: 'event', data: EVENT })).json
    await call('POST', `/documents/${doc.id}/publish`, { baseVersion: doc.version })
    expect(store.get('spiritseeds').docs.event.map((d) => d.data.title)).toEqual(['New moon circle'])

    db.queries = 0
    control.queries = 0
    const pub = await call('GET', '/public/event')
    expect(pub.json.map((d) => d.data.title)).toEqual(['New moon circle'])
    expect((await call('GET', '/boot')).statusCode).toBe(200)
    expect((await call('GET', '/seo')).statusCode).toBe(200)
    expect((await call('GET', '/sitemap.xml')).statusCode).toBe(200)
    expect([200, 404]).toContain((await call('GET', '/page/')).statusCode)
    expect(db.queries).toBe(0)
    expect(control.queries).toBe(0)
  })

  it('keeps drafts out, and an unpublish takes the document out', async () => {
    const { call, store } = setup()
    const doc = (await call('POST', '/documents', { type: 'event', data: EVENT })).json
    expect(store.get('spiritseeds')).toBeUndefined() // a draft rebuilds nothing
    const live = (await call('POST', `/documents/${doc.id}/publish`, { baseVersion: doc.version })).json
    await call('POST', `/documents/${doc.id}/unpublish`, { baseVersion: live.version })
    expect(store.get('spiritseeds').docs.event).toBeUndefined()
  })

  it('builds a missing snapshot once, then reads it', async () => {
    let builds = 0
    const store = new Map()
    const p = createPublished({
      read: async (s) => store.get(s) ?? null,
      write: async (s, snap) => { store.set(s, snap) },
      build: async () => { builds++; return { site: { slug: 'x' }, docs: { page: [{ id: 1 }] } } },
      ttl: 0,
    })
    expect(await p.list('x', 'page')).toEqual([{ id: 1 }])
    expect(await p.list('x', 'page')).toEqual([{ id: 1 }])
    expect(builds).toBe(1)
  })
})
