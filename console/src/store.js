// How the console reaches documents. Two implementations of one interface:
//   httpStore  - the Lambda API (production)
//   localStore - the same service over localStorage (demo and local development)

import { createService, ServiceError } from '../core/service.js'
import { createMemoryRepo } from '../core/repo-memory.js'
import { sanitizeDocumentData } from './richtext.js'

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
    async upload(blob) {
      const { uploadUrl, src } = await call('POST', '/uploads', { contentType: blob.type, bytes: blob.size })
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': blob.type }, body: blob })
      if (!put.ok) throw new StoreError(put.status, 'The photo did not upload.')
      return src
    },
  }
}

export function localStore({ schema, key = `eotm:local:${schema.site}` }) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
  const write = (v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode: memory only */ } }
  const svc = createService({
    schema,
    repo: createMemoryRepo({ load: read, persist: write }),
    sanitize: (type, data) => sanitizeDocumentData(schema, type, data),
  })
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
    // Local mode keeps photos as data URLs; fine for a demo, never for a site.
    upload: (blob) => new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    }),
  }
}
