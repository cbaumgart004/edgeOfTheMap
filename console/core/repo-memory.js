// In-memory storage for the service, with optional persistence through a
// load/save pair (the console's local mode passes localStorage). Same contract as
// api/repo-pg.js: update and remove succeed only when the stored version matches.

import { newId } from '../schema/schema.js'

export function createMemoryRepo({ load = () => null, persist = () => {} } = {}) {
  const docs = new Map((load()?.docs ?? []).map((d) => [d.id, d]))
  const revisions = load()?.revisions ?? []
  const commit = () => persist({ docs: [...docs.values()], revisions })
  const copy = (d) => (d ? structuredClone(d) : null)

  return {
    async list(type) {
      return [...docs.values()].filter((d) => d.type === type).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(copy)
    },
    async get(id) {
      return copy(docs.get(id))
    },
    async slugTaken(type, slug, exceptId) {
      return [...docs.values()].some((d) => d.type === type && d.slug === slug && d.id !== exceptId)
    },
    async insert(doc) {
      const row = { ...structuredClone(doc), id: newId() }
      docs.set(row.id, row)
      commit()
      return copy(row)
    },
    async update(doc, baseVersion) {
      const cur = docs.get(doc.id)
      if (!cur || cur.version !== baseVersion) return null
      docs.set(doc.id, structuredClone(doc))
      commit()
      return copy(doc)
    },
    async remove(id, baseVersion) {
      const cur = docs.get(id)
      if (!cur || cur.version !== baseVersion) return false
      docs.delete(id)
      commit()
      return true
    },
    async addRevision(doc, user) {
      revisions.push({ documentId: doc.id, version: doc.version, data: structuredClone(doc.data), author: user?.id ?? null, createdAt: doc.updatedAt })
      commit()
    },
  }
}
