// Postgres storage for the media library (core/media.js), over one site's own
// project (site migration 002_media.sql).

const COLUMNS = 'id, src, object_key, name, folder, content_type, bytes, width, height, created_at, created_by'

function toItem(r) {
  if (!r) return null
  return {
    id: r.id, src: r.src, key: r.object_key, name: r.name, folder: r.folder, contentType: r.content_type,
    bytes: r.bytes == null ? null : Number(r.bytes), width: r.width, height: r.height,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at, createdBy: r.created_by,
  }
}

export function createPgMediaRepo(db) {
  return {
    async listItems() {
      return (await db.query(`SELECT ${COLUMNS} FROM media`)).rows.map(toItem)
    },
    async getItem(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      return toItem((await db.query(`SELECT ${COLUMNS} FROM media WHERE id = $1`, [id])).rows[0])
    },
    async insertItem(i) {
      const { rows } = await db.query(
        `INSERT INTO media (id, src, object_key, name, folder, content_type, bytes, width, height, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (src) DO NOTHING RETURNING ${COLUMNS}`,
        [i.id, i.src, i.key, i.name, i.folder, i.contentType, i.bytes, i.width, i.height, i.createdAt, i.createdBy])
      return toItem(rows[0] ?? (await db.query(`SELECT ${COLUMNS} FROM media WHERE src = $1`, [i.src])).rows[0])
    },
    async updateItem(id, { name, folder }) {
      return toItem((await db.query(`UPDATE media SET name = $2, folder = $3 WHERE id = $1 RETURNING ${COLUMNS}`, [id, name, folder])).rows[0])
    },
    async removeItem(id) {
      await db.query('DELETE FROM media WHERE id = $1', [id])
    },
    async listFolders() {
      return (await db.query('SELECT path FROM media_folders')).rows.map((r) => r.path)
    },
    async insertFolder(path) {
      await db.query('INSERT INTO media_folders (path) VALUES ($1) ON CONFLICT DO NOTHING', [path])
    },
    async removeFolder(path) {
      await db.query('DELETE FROM media_folders WHERE path = $1', [path])
    },
    // One statement for folders and files, so a rename is never half done
    // (the pool may run separate queries on separate connections). A folder
    // known only from the files in it moves with them.
    async renameFolder(from, to) {
      const swap = (col) => `$2 || substr(${col}, length($1) + 1)`
      const under = (col) => `(${col} = $1 OR left(${col}, length($1) + 1) = $1 || '/')`
      await db.query(
        `WITH f AS (UPDATE media_folders SET path = ${swap('path')} WHERE ${under('path')} RETURNING 1)
         UPDATE media SET folder = ${swap('folder')} WHERE ${under('folder')}`, [from, to])
    },
  }
}

// Documents whose draft or live data names `src`.
export async function pgUses(db, src) {
  const { rows } = await db.query(
    `SELECT id, type, slug, data->>'title' AS title FROM documents
     WHERE strpos(data::text, $1) > 0 OR strpos(coalesce(published_data::text, ''), $1) > 0 LIMIT 20`, [src])
  return rows.map((r) => ({ id: r.id, type: r.type, slug: r.slug, title: r.title ?? r.slug }))
}
