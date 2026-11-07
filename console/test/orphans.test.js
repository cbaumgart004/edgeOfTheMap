// A file deleted from a site's library whose object could not be deleted is
// listed for an operator (migration 011, Manage > Usage), who can remove it
// once the API role may delete, or dismiss it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHandler } from '../api/handler.js'

const schema = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
const SITE = {
  id: 'site-1', slug: 'spiritseeds', name: 'Spirit Seeds', schema, console_version: '0.1.0', console_integrity: 'sha384-x',
  allowed_origins: ['https://spiritseedswellness.com'], connection_param: '/eotm/sites/spiritseeds/db', media_bucket: '', media_base_url: '',
}
const ID = '00000000-0000-4000-8000-000000000001'
const KEY = 'sites/spiritseeds/uploads/2026-11/a.webp'

function world({ canDelete = false } = {}) {
  const orphans = []
  const deleted = []
  const control = {
    async query(sql, p = []) {
      if (sql.startsWith('SELECT 1 FROM operators')) return { rows: [{}] }
      if (sql.includes('FROM sites')) return { rows: [SITE] }
      if (sql.includes('FROM site_members')) return { rows: [{ role: 'owner', name: null }] }
      if (sql.startsWith('INSERT INTO orphan_files')) {
        const o = orphans.find((x) => x.bucket === p[0] && x.key === p[1])
        if (o) o.error = p[3]
        else orphans.push({ bucket: p[0], key: p[1], site_id: p[2], error: p[3], failed_at: '2026-11-07T00:00:00Z' })
        return { rows: [] }
      }
      if (sql.includes('FROM orphan_files o')) return { rows: orphans.map((o) => ({ ...o, site: 'Spirit Seeds' })) }
      if (sql.startsWith('SELECT bucket, key FROM orphan_files')) return { rows: orphans.filter((o) => o.bucket === p[0] && o.key === p[1]) }
      if (sql.startsWith('UPDATE orphan_files')) { orphans.find((o) => o.bucket === p[0] && o.key === p[1]).error = p[2]; return { rows: [] } }
      if (sql.startsWith('DELETE FROM orphan_files')) { orphans.splice(orphans.findIndex((o) => o.bucket === p[0] && o.key === p[1]), 1); return { rows: [] } }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  const item = { id: ID, src: `https://photos.example/${KEY}`, object_key: KEY, name: 'a', folder: '', content_type: 'image/webp', bytes: 10 }
  const siteDb = {
    async query(sql) {
      if (sql.includes('FROM media WHERE id')) return { rows: [item] }
      if (sql.startsWith('DELETE FROM media')) return { rows: [] }
      if (sql.includes('FROM documents')) return { rows: [] }
      throw new Error(`unexpected site SQL: ${sql}`)
    },
  }
  const handle = createHandler({
    control, siteDb: async () => siteDb, presign: async () => '', sanitize: () => (t, d) => d,
    media: { bucket: 'eotm-photos', baseUrl: 'https://photos.example' },
    verifyToken: async () => ({ id: 'op-1', email: 'op@eotm.example' }),
    removeObject: async (o) => { if (!world.allow && !canDelete) throw new Error('AccessDenied'); deleted.push(o) },
  })
  const call = (method, path, body) => handle({ requestContext: { http: { method } }, rawPath: path,
    headers: { origin: 'https://spiritseedswellness.com', authorization: 'Bearer t' }, body: body && JSON.stringify(body) })
    .then((r) => ({ status: r.statusCode, json: r.body ? JSON.parse(r.body) : null }))
  return { call, orphans, deleted, allow: () => { world.allow = true } }
}

describe('files left in storage', () => {
  it('lists a file whose delete failed, and keeps the library delete', async () => {
    world.allow = false
    const w = world()
    expect((await w.call('DELETE', `/api/sites/spiritseeds/media/${ID}`)).status).toBe(200)
    expect(w.orphans).toMatchObject([{ bucket: 'eotm-photos', key: KEY, site_id: 'site-1', error: 'AccessDenied' }])
    expect((await w.call('GET', '/api/manage/orphans')).json).toMatchObject([{ key: KEY, site: 'Spirit Seeds' }])
  })

  it('lists nothing when the delete works', async () => {
    world.allow = false
    const w = world({ canDelete: true })
    await w.call('DELETE', `/api/sites/spiritseeds/media/${ID}`)
    expect(w.orphans).toEqual([])
    expect(w.deleted).toEqual([{ bucket: 'eotm-photos', key: KEY }])
  })

  it('remove retries the delete and keeps the row while it still fails; dismiss forgets it', async () => {
    world.allow = false
    const w = world()
    await w.call('DELETE', `/api/sites/spiritseeds/media/${ID}`)
    const still = await w.call('POST', '/api/manage/orphans/remove', { bucket: 'eotm-photos', key: KEY })
    expect(still.status).toBe(502)
    expect(w.orphans).toHaveLength(1)
    w.allow()
    expect((await w.call('POST', '/api/manage/orphans/remove', { bucket: 'eotm-photos', key: KEY })).status).toBe(200)
    expect(w.orphans).toEqual([])
    expect((await w.call('POST', '/api/manage/orphans/dismiss', { bucket: 'eotm-photos', key: KEY })).status).toBe(404)
    world.allow = false
  })
})
