// The contract between the console and a customer's page. The loader installs it
// as window.EOTM before the console exists, so a site can subscribe on startup and
// the console never has to know how the site renders.
//
// A site renders published documents it fetched itself. While the owner edits,
// the console pushes the working draft here and the site re-renders from it, which
// is the live preview (StoryShaped ADR-0007). Closing the editor clears every draft
// and the site falls back to what it fetched.

export function createBridge() {
  const drafts = new Map() // `${type}:${id}` -> document
  const listeners = new Set()
  const orders = new Map() // type -> [{ key, title, docId? }]
  const emit = (change) => listeners.forEach((fn) => { try { fn(change) } catch (e) { console.error('[EOTM]', e) } })

  return {
    version: 3,
    editing: false,
    // The schema the console is editing with, the owner's own types included
    // (schema/custom.js). A site renders a custom section from its fields;
    // `{ type: '$schema' }` arrives when the owner changes them.
    schema: null,

    // Site side ------------------------------------------------------------

    // fn({ type, id, doc }) runs on every draft change; doc is null when a draft
    // is dropped. An order report from setOrder arrives as { type, order: true };
    // a listener that re-renders on drafts must ignore it, or it loops. Returns an unsubscribe function.
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    // The draft for one document, or null. Match by id or slug.
    draft(type, idOrSlug) {
      for (const d of drafts.values()) {
        if (d.type === type && (d.id === idOrSlug || d.slug === idOrSlug)) return d
      }
      return null
    },
    // Every draft of a type, including new documents not yet on the site.
    drafts(type) {
      return [...drafts.values()].filter((d) => d.type === type)
    },
    // Overlay drafts on a list the site fetched: edited ones replace their
    // published copy, new ones are appended, deleted ones are dropped.
    merge(type, published) {
      const out = published.map((p) => this.draft(type, p.id) ?? p).filter((d) => !d.deleted)
      for (const d of this.drafts(type)) if (!published.some((p) => p.id === d.id) && !d.deleted) out.push(d)
      return out
    },

    // The order the site shows a type in, for placement fields: [{ key, title,
    // docId? }]. A site calls it whenever its list changes; the console reads it.
    setOrder(type, entries) {
      orders.set(type, entries)
      emit({ type, order: true })
    },
    order(type) {
      return orders.get(type) ?? null
    },

    // Console side ---------------------------------------------------------

    setSchema(schema) {
      this.schema = schema
      emit({ type: '$schema' })
    },

    push(doc) {
      drafts.set(`${doc.type}:${doc.id}`, doc)
      emit({ type: doc.type, id: doc.id, doc })
    },
    drop(type, id) {
      drafts.delete(`${type}:${id}`)
      emit({ type, id, doc: null })
    },
    clear() {
      const all = [...drafts.values()]
      drafts.clear()
      for (const d of all) emit({ type: d.type, id: d.id, doc: null })
    },
    // Ask the site to show a path, for a document whose page is not open. Sites
    // using a client router listen for 'eotm:navigate'; the default is a normal
    // navigation only when the site does not handle it.
    navigate(path) {
      const event = new CustomEvent('eotm:navigate', { detail: { path }, cancelable: true })
      if (window.dispatchEvent(event) && location.pathname !== path) {
        history.pushState({}, '', path)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    },
  }
}

export function previewPathFor(type, doc) {
  const template = type?.previewPath
  if (!template) return null
  // Slashes survive, so a template of "{path}" can name any page, "/" included.
  return template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(key === 'slug' ? doc.slug ?? '' : doc.data?.[key] ?? '').replace(/%2F/gi, '/'))
}
