// Postgres storage for core/service.js, over one customer's own Neon project.
// update and remove carry the base version in their WHERE clause, so a
// concurrent write turns into zero rows and the service reports a conflict.

const COLUMNS = `id, type, slug, status, version, data, published_data, published_at, updated_at, updated_by`

function toDoc(r) {
  if (!r) return null
  return {
    id: r.id, type: r.type, slug: r.slug, status: r.status, version: r.version, data: r.data,
    publishedData: r.published_data, publishedAt: r.published_at?.toISOString?.() ?? r.published_at,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at, updatedBy: r.updated_by,
  }
}

export function createPgRepo(db) {
  return {
    async list(type) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM documents WHERE type = $1 ORDER BY updated_at DESC`, [type])
      return rows.map(toDoc)
    },
    async get(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM documents WHERE id = $1`, [id])
      return toDoc(rows[0])
    },
    async slugTaken(type, slug, exceptId) {
      const { rows } = await db.query(
        'SELECT 1 FROM documents WHERE type = $1 AND slug = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)', [type, slug, exceptId ?? null])
      return rows.length > 0
    },
    async insert(d) {
      const { rows } = await db.query(
        `INSERT INTO documents (type, slug, status, version, data, published_data, published_at, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
        [d.type, d.slug, d.status, d.version, d.data, d.publishedData, d.publishedAt, d.updatedAt, d.updatedBy])
      return toDoc(rows[0])
    },
    async update(d, baseVersion) {
      const { rows } = await db.query(
        `UPDATE documents SET slug = $3, status = $4, version = $5, data = $6, published_data = $7,
           published_at = $8, updated_at = $9, updated_by = $10
         WHERE id = $1 AND version = $2 RETURNING ${COLUMNS}`,
        [d.id, baseVersion, d.slug, d.status, d.version, d.data, d.publishedData, d.publishedAt, d.updatedAt, d.updatedBy])
      return toDoc(rows[0])
    },
    async remove(id, baseVersion) {
      const { rowCount } = await db.query('DELETE FROM documents WHERE id = $1 AND version = $2', [id, baseVersion])
      return rowCount === 1
    },
    async addRevision(d, user) {
      await db.query('INSERT INTO document_revisions (document_id, version, data, author) VALUES ($1, $2, $3, $4)',
        [d.id, d.version, d.data, user?.id ?? null])
    },
  }
}
