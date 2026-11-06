import React, { useEffect, useMemo, useState } from 'react'
import { newId } from '../schema/schema.js'
import { classesOf } from '../schema/classes.js'
import { newElement, classOptions, ELEMENT_LABELS } from '../schema/elements.js'

// Classes on the console's home: the site's classes, then the ones on the page
// open behind the editor, nested as they sit on it (a button inside a card
// inside a panel reads Panels › Cards › Buttons). A + at any level offers to
// add an object with that class to a section; Style opens the class's look.

const MARK = '[data-eotm-edit]'

// The page's elements for each class, and their nesting: a tree of
// { name, label, count, els, children } by class, outermost first.
export function scanClasses(list, root = document) {
  const byEl = new Map()
  for (const c of list) {
    let els = []
    try { els = [...root.querySelectorAll(c.selector)] } catch { /* a selector this browser cannot read */ }
    for (const el of els) {
      if (el.closest('.eotm-root')) continue
      if (!byEl.has(el)) byEl.set(el, [])
      byEl.get(el).push(c)
    }
  }
  const top = { children: new Map() }
  const nodeOf = new Map()
  const place = (el) => {
    if (nodeOf.has(el)) return nodeOf.get(el)
    let up = el.parentElement
    while (up && !byEl.has(up)) up = up.parentElement
    const parent = up ? place(up) : top
    let first = null
    for (const c of byEl.get(el)) {
      if (!parent.children.has(c.name)) parent.children.set(c.name, { name: c.name, label: c.label, count: 0, els: [], children: new Map() })
      const node = parent.children.get(c.name)
      node.count += 1
      node.els.push(el)
      first ??= node
    }
    nodeOf.set(el, first)
    return first
  }
  for (const el of byEl.keys()) place(el)
  const counts = new Map([...byEl.values()].flat().map((c) => [c.name, 0]))
  for (const cs of byEl.values()) for (const c of cs) counts.set(c.name, counts.get(c.name) + 1)
  return { tree: top.children, counts, byEl }
}

// The class path of the nearest classed element around `el`: "Panels › Cards".
function pathAround(el, byEl) {
  const names = []
  for (let up = el; up; up = up.parentElement) if (byEl.has(up)) names.unshift(byEl.get(up)[0].label)
  return names.join(' › ')
}

// Rescanned when the page under the editor changes (a new page, a section added).
function usePageScan(list) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let timer = null
    const later = () => { clearTimeout(timer); timer = setTimeout(() => setTick((n) => n + 1), 300) }
    const watch = new MutationObserver((records) => { if (records.some((r) => !r.target.closest?.('.eotm-root'))) later() })
    watch.observe(document.body, { childList: true, subtree: true })
    addEventListener('popstate', later)
    return () => { clearTimeout(timer); watch.disconnect(); removeEventListener('popstate', later) }
  }, [])
  return useMemo(() => scanClasses(list), [list, tick]) // eslint-disable-line react-hooks/exhaustive-deps
}

export default function ClassTree({ schema, store, openStyle, addClass, onAdd }) {
  const list = useMemo(() => classesOf(schema), [schema])
  const scan = usePageScan(list)
  const [adding, setAdding] = useState(null)
  const [label, setLabel] = useState('')
  const where = typeof location === 'undefined' ? '' : location.pathname

  const row = (c, count, extra = null) => (
    <span className="eotm-class-row">
      <span className="eotm-class-name">{c.label}{c.custom && <span className="eotm-chip">yours</span>}</span>
      <span className="eotm-class-count">{count ? `${count} here` : 'not on this page'}</span>
      <button type="button" className="eotm-icon" aria-label={`Add an object with ${c.label}`} title="Add an object with this class" onClick={() => setAdding(c)}>+</button>
      <button type="button" className="eotm-btn is-quiet" onClick={() => openStyle(c.name)}>Style</button>
      {extra}
    </span>
  )
  const byName = new Map(list.map((c) => [c.name, c]))
  const branch = (nodes, depth) => (
    <ul className="eotm-class-tree" data-depth={depth}>
      {[...nodes.values()].map((n) => (
        <li key={n.name}>
          {n.children.size ? (
            <details className="eotm-fold" open={depth < 1}>
              <summary>{row(byName.get(n.name), n.count)}</summary>
              {branch(n.children, depth + 1)}
            </details>
          ) : row(byName.get(n.name), n.count)}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="eotm-classes">
      <details className="eotm-fold" open>
        <summary><strong>Whole site</strong> <span className="eotm-class-count">{list.length} class{list.length === 1 ? '' : 'es'}</span></summary>
        <ul className="eotm-class-tree">{list.map((c) => <li key={c.name}>{row(c, scan.counts.get(c.name) ?? 0)}</li>)}</ul>
        <form className="eotm-row" onSubmit={async (e) => { e.preventDefault(); if (label.trim()) { await addClass(label.trim()); setLabel('') } }}>
          <input className="eotm-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A new class of your own" aria-label="New class name" maxLength={40} />
          <button className="eotm-btn" disabled={!label.trim()}>+ Add a class</button>
        </form>
      </details>
      <details className="eotm-fold" open>
        <summary><strong>This page</strong> <span className="eotm-class-count">{where}</span></summary>
        {scan.tree.size ? branch(scan.tree, 0) : <p className="eotm-empty">No classed objects on this page yet.</p>}
      </details>
      {adding && <AddWithClass cls={adding} schema={schema} store={store} scan={scan} addClass={addClass}
        onClose={() => setAdding(null)} onAdd={async (t) => { setAdding(null); await onAdd(t) }} />}
    </div>
  )
}

// The types whose documents hold sections: the pages an object can go on.
const pageTypes = (schema) => Object.entries(schema.types).filter(([, t]) => t.fields?.some((f) => f.kind === 'blocks')).map(([n]) => n)

function AddWithClass({ cls, schema, store, scan, addClass, onClose, onAdd }) {
  const options = useMemo(() => classOptions(schema), [schema])
  const assignable = options.some((o) => o.value === cls.name)
  const [docs, setDocs] = useState(null)
  const [docId, setDocId] = useState('')
  const [section, setSection] = useState('')
  const [kind, setKind] = useState(/btn|button/i.test(`${cls.name} ${cls.selector}`) ? 'button' : 'text')
  const [klass, setKlass] = useState(assignable ? cls.name : '')
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)
  // The page open behind the editor, by the document its sections name.
  const here = useMemo(() => {
    const mark = document.querySelector(`${MARK}[data-eotm-item]`)
    return mark ? mark.dataset.eotmEdit.split(':').slice(1).join(':') : null
  }, [])
  useEffect(() => {
    Promise.all(pageTypes(schema).map((t) => store.list(t))).then((lists) => {
      const all = lists.flat()
      setDocs(all)
      setDocId((d) => d || all.find((x) => x.id === here || x.slug === here)?.id || all[0]?.id || '')
    }).catch(() => setDocs([]))
  }, [schema, store, here])
  const doc = docs?.find((d) => d.id === docId)
  // The chosen page's sections, grouped by the classes they sit in on the page
  // (only the open page can say); first, one holding this class already.
  const groups = useMemo(() => {
    if (!doc) return []
    const out = new Map()
    const onPage = new Map([...document.querySelectorAll('[data-eotm-item]')].filter((e) => !e.closest('.eotm-root')).map((e) => [e.dataset.eotmItem, e]))
    for (const f of schema.types[doc.type]?.fields ?? []) {
      if (f.kind !== 'blocks') continue
      for (const b of doc.data?.[f.name] ?? []) {
        if (!b?._id) continue
        const el = onPage.get(b._id)
        const g = el ? pathAround(el, scan.byEl) || 'On the page' : 'Not on the open page'
        const name = schema.blocks?.[b._type]?.label ?? b._type
        const has = el && [...scan.byEl.entries()].some(([e, cs]) => el.contains(e) && cs.some((c) => c.name === cls.name))
        if (!out.has(g)) out.set(g, [])
        out.get(g).push({ id: b._id, label: b.title ? `${name}: ${String(b.title).slice(0, 40)}` : name, has })
      }
    }
    return [...out.entries()]
  }, [doc, schema, scan, cls.name])
  useEffect(() => {
    const flat = groups.flatMap(([, s]) => s)
    setSection((s) => (flat.some((x) => x.id === s) ? s : (flat.find((x) => x.has) ?? flat[0])?.id ?? ''))
  }, [groups])

  const sample = scan.byEl && [...scan.byEl.entries()].find(([, cs]) => cs.some((c) => c.name === cls.name))?.[0]
  const sampleHtml = useMemo(() => {
    if (!sample) return `<div class="${cls.custom ? `c-${cls.name}` : ''}">${cls.label}</div>`
    const copy = sample.cloneNode(true)
    copy.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove())
    return copy.outerHTML
  }, [sample, cls])

  const add = async () => {
    setBusy(true)
    try {
      let name = klass
      if (klass === '__own') name = await addClass(own.trim())
      const element = newElement(kind, newId(), name ? { class: name } : {})
      await onAdd({ type: doc.type, key: doc.id, item: section, element })
    } finally { setBusy(false) }
  }
  return (
    <div className="eotm-modal" role="dialog" aria-modal="true" aria-label={`Add an object with ${cls.label}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="eotm-modal-card">
        <h3>{cls.label}</h3>
        <div className="eotm-preview eotm-class-sample" dangerouslySetInnerHTML={{ __html: sampleHtml }} />
        <p className="eotm-help">Add an object with this class?{!assignable && ' This look comes from where an object sits, so pick a class it can carry, or make one of your own.'}</p>
        <label className="eotm-label">Page
          <select className="eotm-input" value={docId} onChange={(e) => setDocId(e.target.value)} disabled={!docs}>
            {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.data?.title || d.slug || d.id}{d.id === here || d.slug === here ? ' (this page)' : ''}</option>)}
          </select>
        </label>
        <label className="eotm-label">Into
          <select className="eotm-input" value={section} onChange={(e) => setSection(e.target.value)}>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>{list.map((s) => <option key={s.id} value={s.id}>{s.label}{s.has ? ` (has ${cls.label.toLowerCase()})` : ''}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label className="eotm-label">Object
          <select className="eotm-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {['text', 'button', 'richtext', 'box'].map((k) => <option key={k} value={k}>{ELEMENT_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="eotm-label">Class
          <select className="eotm-input" value={klass} onChange={(e) => setKlass(e.target.value)}>
            <option value="">None</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="__own">Custom class…</option>
          </select>
        </label>
        {klass === '__own' && <input className="eotm-input" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Name your class" aria-label="Custom class name" maxLength={40} autoFocus />}
        <div className="eotm-row">
          <button type="button" className="eotm-btn is-primary" disabled={busy || !doc || !section || (klass === '__own' && !own.trim())} onClick={add}>Add</button>
          <button type="button" className="eotm-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
