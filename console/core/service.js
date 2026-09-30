// Document rules, independent of storage. The Lambda API runs it over Postgres
// (api/repo-pg.js); the console's local mode and the tests run it over memory
// (core/repo-memory.js). One implementation, so the demo cannot drift from
// production on what a save or a publish means.

import { checkDocument, relationIds, slugify, defaultData, duplicateDocument } from '../schema/schema.js'

export class ServiceError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    Object.assign(this, extra)
  }
}

// A save based on an old version. `current` is the stored document, so the
// console can show what changed instead of overwriting it (platform plan §3.4).
export class ConflictError extends ServiceError {
  constructor(current) {
    super(409, 'This was changed somewhere else since you opened it.', { current })
  }
}

// Status: 'draft' (never published), 'published' (live equals draft),
// 'changed' (live, with unpublished edits).
function statusAfterEdit(doc) {
  return doc.publishedData ? 'changed' : 'draft'
}

export function createService({ schema, repo, sanitize = (type, data) => data, now = () => new Date().toISOString() }) {
  const typeOf = (name) => {
    const t = schema.types[name]
    if (!t) throw new ServiceError(400, `Unknown type "${name}".`)
    return t
  }
  const invalid = (errors) => new ServiceError(422, errors[0], { errors })

  async function uniqueSlug(type, wanted, exceptId) {
    const base = slugify(wanted) || type
    let slug = base
    for (let n = 2; await repo.slugTaken(type, slug, exceptId); n++) slug = `${base}-${n}`
    return slug
  }

  async function load(id) {
    const doc = await repo.get(id)
    if (!doc) throw new ServiceError(404, 'Not found.')
    return doc
  }

  function checkBase(doc, baseVersion) {
    if (baseVersion !== doc.version) throw new ConflictError(doc)
  }

  return {
    schema,

    list(type) {
      typeOf(type)
      return repo.list(type)
    },

    get: load,

    async create({ type, slug, data }, user) {
      const t = typeOf(type)
      if (t.singleton && (await repo.list(type)).length) throw new ServiceError(409, `There is already a ${t.label}.`)
      const clean = sanitize(type, { ...defaultData(t.fields, schema), ...(data ?? {}) })
      const errors = checkDocument(schema, type, clean, { draft: true })
      if (errors.length) throw invalid(errors)
      const wanted = slug || (t.slugFrom ? clean[t.slugFrom] : '') || type
      const doc = {
        type, slug: await uniqueSlug(type, wanted), status: 'draft', version: 1,
        data: clean, publishedData: null, publishedAt: null, updatedAt: now(), updatedBy: user?.id ?? null,
      }
      const saved = await repo.insert(doc)
      await repo.addRevision(saved, user)
      return saved
    },

    async duplicate(id, user) {
      const doc = await load(id)
      const copy = duplicateDocument(schema, doc)
      return this.create({ type: copy.type, slug: copy.slug, data: copy.data }, user)
    },

    async save(id, { baseVersion, slug, data }, user) {
      const doc = await load(id)
      checkBase(doc, baseVersion)
      const clean = sanitize(doc.type, data ?? doc.data)
      const errors = checkDocument(schema, doc.type, clean, { draft: true })
      if (errors.length) throw invalid(errors)
      const next = {
        ...doc,
        slug: slug && slug !== doc.slug ? await uniqueSlug(doc.type, slug, id) : doc.slug,
        data: clean, version: doc.version + 1, status: statusAfterEdit(doc), updatedAt: now(), updatedBy: user?.id ?? null,
      }
      const saved = await repo.update(next, baseVersion)
      if (!saved) throw new ConflictError(await load(id))
      await repo.addRevision(saved, user)
      return saved
    },

    async publish(id, { baseVersion }, user) {
      const doc = await load(id)
      checkBase(doc, baseVersion)
      const errors = checkDocument(schema, doc.type, doc.data)
      for (const ref of relationIds(schema, doc.type, doc.data)) {
        const target = await repo.get(ref.id)
        if (!target || target.type !== ref.to) errors.push(`A linked ${schema.types[ref.to]?.label ?? ref.to} no longer exists.`)
      }
      if (errors.length) throw invalid(errors)
      const next = {
        ...doc, publishedData: doc.data, publishedAt: now(), status: 'published',
        version: doc.version + 1, updatedAt: now(), updatedBy: user?.id ?? null,
      }
      const saved = await repo.update(next, baseVersion)
      if (!saved) throw new ConflictError(await load(id))
      return saved
    },

    async unpublish(id, { baseVersion }, user) {
      const doc = await load(id)
      checkBase(doc, baseVersion)
      const next = { ...doc, publishedData: null, publishedAt: null, status: 'draft', version: doc.version + 1, updatedAt: now(), updatedBy: user?.id ?? null }
      const saved = await repo.update(next, baseVersion)
      if (!saved) throw new ConflictError(await load(id))
      return saved
    },

    async remove(id, { baseVersion }) {
      const doc = await load(id)
      checkBase(doc, baseVersion)
      if (!(await repo.remove(id, baseVersion))) throw new ConflictError(await load(id))
      return { id, deleted: true }
    },

    // What visitors see: published copies only.
    async listPublished(type) {
      typeOf(type)
      return (await repo.list(type))
        .filter((d) => d.publishedData)
        .map((d) => ({ id: d.id, type: d.type, slug: d.slug, data: d.publishedData, publishedAt: d.publishedAt }))
    },
  }
}
