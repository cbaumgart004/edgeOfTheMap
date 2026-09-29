// How the console reaches documents. Two implementations of one interface:
//   httpStore  - the Lambda API (production)
//   localStore - the same service over localStorage (demo and local development)

import { createService, ServiceError } from '../core/service.js'
import { createMemoryRepo } from '../core/repo-memory.js'
import { sanitizeDocumentData } from './richtext.js'
import { checkCustom, mergeCustom } from '../schema/custom.js'

export class StoreError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    Object.assign(this, { status, ...extra })
  }
}

export function httpStore({ apiBase, site, getToken }) {
  const base = `${apiBase.replace(/\/$/, '')}/api/sites/${site}`
  async function call(method, path, body) {
    const token = await getToken()
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new StoreError(res.status, data.error ?? `Request failed (${res.status})`, data)
    return data
  }
  return {
    list: (type) => call('GET', `/documents?type=${encodeURIComponent(type)}`),
    get: (id) => call('GET', `/documents/${id}`),
    create: (input) => call('POST', '/documents', input),
    duplicate: (id) => call('POST', `/documents/${id}/duplicate`),
    save: (id, input) => call('PUT', `/documents/${id}`, input),
    publish: (id, baseVersion) => call('POST', `/documents/${id}/publish`, { baseVersion }),
    unpublish: (id, baseVersion) => call('POST', `/documents/${id}/unpublish`, { baseVersion }),
    remove: (id, baseVersion) => call('DELETE', `/documents/${id}?baseVersion=${baseVersion}`),
    // "Request a change": emailed and pushed to Edge of the Map (api/requests.js).
    request: (input) => call('POST', '/requests', input),
    // The owner's own types (schema/custom.js); answers { schema } merged.
    saveCustom: (custom) => call('PUT', '/custom-schema', { custom }),
    async upload(blob) {
      const { uploadUrl, src } = await call('POST', '/uploads', { contentType: blob.type, bytes: blob.size })
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': blob.type }, body: blob })
      if (!put.ok) throw new StoreError(put.status, 'The photo did not upload.')
      return src
    },
  }
}

export function localStore({ schema: base, key = `eotm:local:${base.site}` }) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
  const write = (v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode: memory only */ } }
  const repo = createMemoryRepo({ load: read, persist: write })
  const make = (schema) => createService({ schema, repo, sanitize: (type, data) => sanitizeDocumentData(schema, type, data) })
  let svc = make(base)
  const wrap = (fn) => async (...args) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e instanceof ServiceError) throw new StoreError(e.status, e.message, { errors: e.errors, current: e.current })
      throw e
    }
  }
  return {
    list: wrap((type) => svc.list(type)),
    get: wrap((id) => svc.get(id)),
    create: wrap((input) => svc.create(input)),
    duplicate: wrap((id) => svc.duplicate(id)),
    save: wrap((id, input) => svc.save(id, input)),
    publish: wrap((id, baseVersion) => svc.publish(id, { baseVersion })),
    unpublish: wrap((id, baseVersion) => svc.unpublish(id, { baseVersion })),
    remove: wrap((id, baseVersion) => svc.remove(id, { baseVersion })),
    listPublished: wrap((type) => svc.listPublished(type)),
    // Local mode has no one to send to.
    request: async () => { throw new StoreError(400, 'Requests are sent from the real editor, not the demo.') },
    // Local mode keeps the owner's types for this page load only.
    async saveCustom(custom) {
      const errors = checkCustom(base, custom)
      if (errors.length) throw new StoreError(400, `Those types cannot be saved: ${errors[0]}`, { errors })
      const schema = mergeCustom(base, custom)
      svc = make(schema)
      return { schema }
    },
    // Local mode keeps photos as data URLs; fine for a demo, never for a site.
    upload: (blob) => new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    }),
  }
}
