import React, { useEffect, useMemo, useState } from 'react'
import { newId } from '../schema/schema.js'
import { classesOf, canCarry, lineage } from '../schema/classes.js'
import { newElement, classOptions, ELEMENT_LABELS } from '../schema/elements.js'

// Classes on the console's home: the site's classes, then the ones on the page
// open behind the editor, nested as they sit on it (a button inside a card
// inside a panel reads Panels › Cards › Buttons). A + at any level offers to
// add an object with that class to a section; Style opens the class's look.
// Tapping a class opens its card (ClassCard): one of it, what it is made from,
// Add one, and New class from this.

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
  // The class open in its card, and whether it opened on Add.
  const [open, setOpen] = useState(null)
  const [label, setLabel] = useState('')
  const where = typeof location === 'undefined' ? '' : location.pathname
  const byName = new Map(list.map((c) => [c.name, c]))

  const row = (c, count, extra = null) => (
    <span className="eotm-class-row">
      <button type="button" className="eotm-class-name" onClick={() => setOpen({ name: c.name, adding: false })}
        title={`See ${c.label.toLowerCase()} and what you can do with it`}>
        {c.label}{c.custom && <span className="eotm-chip">yours</span>}
      </button>
      <span className="eotm-class-count">{count ? `${count} here` : 'not on this page'}</span>
      <button type="button" className="eotm-icon" aria-label={`Add an object with ${c.label}`} title="Add an object with this class" onClick={() => setOpen({ name: c.name, adding: true })}>+</button>
      <button type="button" className="eotm-btn is-quiet" onClick={() => openStyle(c.name)}>Style</button>
      {extra}
    </span>
  )
  // Whole site: each class with the ones made from it nested under it.
  const kids = (name) => list.filter((c) => c.base === name && byName.has(c.base))
  const site = (items, depth) => (
    <ul className="eotm-class-tree is-site" data-site-depth={depth}>
      {items.map((c) => (
        <li key={c.name}>
          {row(c, scan.counts.get(c.name) ?? 0)}
          {kids(c.name).length > 0 && depth < 5 && site(kids(c.name), depth + 1)}
        </li>
      ))}
    </ul>
  )
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
  const shown = open && byName.get(open.name)

  return (
    <div className="eotm-classes">
      <details className="eotm-fold" open>
        <summary><strong>Whole site</strong> <span className="eotm-class-count">{list.length} class{list.length === 1 ? '' : 'es'}</span></summary>
        {site(list.filter((c) => !c.base || !byName.has(c.base)), 0)}
        <form className="eotm-row" onSubmit={async (e) => { e.preventDefault(); if (label.trim()) { await addClass(label.trim()); setLabel('') } }}>
          <input className="eotm-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A new class of your own" aria-label="New class name" maxLength={40} />
          <button className="eotm-btn" disabled={!label.trim()}>+ Add a class</button>
        </form>
      </details>
      <details className="eotm-fold" open>
        <summary><strong>This page</strong> <span className="eotm-class-count">{where}</span></summary>
        {scan.tree.size ? branch(scan.tree, 0) : <p className="eotm-empty">No classed objects on this page yet.</p>}
      </details>
      {shown && <ClassCard key={shown.name} cls={shown} list={list} adding={open.adding} schema={schema} store={store} scan={scan} addClass={addClass}
        openStyle={openStyle} onOpen={(name) => setOpen({ name, adding: false })}
        onClose={() => setOpen(null)} onAdd={async (t) => { setOpen(null); await onAdd(t) }} />}
    </div>
  )
}

// The types whose documents hold sections: the pages an object can go on.
const pageTypes = (schema) => Object.entries(schema.types).filter(([, t]) => t.fields?.some((f) => f.kind === 'blocks')).map(([n]) => n)

// One of the class on the open page, copied without the editor's marks.
function memberOf(cls, scan) {
  const all = [...scan.byEl.entries()].filter(([, cs]) => cs.some((c) => c.name === cls.name)).map(([el]) => el)
  // The one whose own class is this (not one inside a member of it), and of
  // those one that takes no other class (a plain button, not the menu bar's).
  const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)))
  return outer.find((el) => scan.byEl.get(el).length === 1) ?? outer[0] ?? all[0] ?? null
}
function cleanCopy(el) {
  const copy = el.cloneNode(true)
  copy.querySelectorAll('script, iframe, object, embed, video').forEach((n) => n.remove())
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...n.attributes]) if (a.name === 'id' || a.name.startsWith('data-eotm')) n.removeAttribute(a.name)
  }
  return copy.outerHTML
}

// With none on the page: the layout its selector describes, built so the
// site's own styles draw it (".section h2" is a heading inside a section).
// A class made from another is drawn as that one, with its own class added.
export function sampleFromSelector(chain, text) {
  const root = chain[0]
  const own = chain.slice(1).map((c) => `c-${c.name}`)
  const selector = root.custom ? `.c-${root.name}` : String(root.selector ?? '').split(',')[0].trim()
  const steps = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
  const make = (step, last) => {
    const tag = step.match(/^[a-z][a-z0-9]*/i)?.[0]
    const classes = [...step.matchAll(/\.([\w-]+)/g)].map((m) => m[1])
    const el = document.createElement(tag || (/btn|button/i.test(`${classes.join(' ')} ${root.name}`) ? 'a' : 'div'))
    if (classes.length) el.className = classes.join(' ')
    for (const m of step.matchAll(/\[([\w-]+)(?:\s*=\s*['"]?([^'"\]]*)['"]?)?\]/g)) if (!m[1].startsWith('data-eotm')) el.setAttribute(m[1], m[2] ?? '')
    if (last) {
      if (own.length) el.className = `${el.className} ${own.join(' ')}`.trim()
      el.textContent = text
    }
    return el
  }
  const els = steps.map((s, i) => make(s, i === steps.length - 1))
  els.reduce((outer, inner) => (outer.append(inner), inner))
  return els[0]?.outerHTML ?? ''
}

// A class's card: one of it as it looks (from the page, or built from its
// selector), what it is made from, and its two uses: add an object with it
// where it already sits, or make a class of your own from it.
function ClassCard({ cls, list, adding: startAdding, schema, store, scan, addClass, openStyle, onOpen, onClose, onAdd }) {
  const chain = useMemo(() => lineage(list, cls), [list, cls])
  const member = memberOf(cls, scan)
  const sampleHtml = useMemo(() => (member ? cleanCopy(member) : sampleFromSelector(chain, cls.label)), [member, chain, cls.label])
  const [mode, setMode] = useState(startAdding ? 'add' : null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const carry = canCarry(cls)
  const makeFrom = async () => {
    setBusy(true)
    try { const made = await addClass(name.trim(), cls.name); if (made) onOpen(made) } finally { setBusy(false) }
  }
  return (
    <div className="eotm-modal" role="dialog" aria-modal="true" aria-label={cls.label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="eotm-modal-card eotm-class-card">
        <div className="eotm-class-card-head">
          <h3>{cls.label}</h3>
          <button type="button" className="eotm-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {chain.length > 1 && (
          <p className="eotm-class-lineage" aria-label="Made from">
            {chain.map((c, i) => (
              <React.Fragment key={c.name}>
                {i > 0 && <span aria-hidden="true"> › </span>}
                {c === cls ? <strong>{c.label}</strong> : <button type="button" className="eotm-link" onClick={() => onOpen(c.name)}>{c.label}</button>}
              </React.Fragment>
            ))}
          </p>
        )}
        <div className="eotm-preview eotm-class-sample" dangerouslySetInnerHTML={{ __html: sampleHtml }} />
        <p className="eotm-help">{member ? 'One of them, as it is on this page.' : 'None on this page: drawn as one would be.'}
          {chain.length > 1 && ` It takes the look of ${chain[chain.length - 2].label} and its own style on top, so a change to ${chain[chain.length - 2].label} still reaches it.`}</p>
        <div className="eotm-row eotm-class-actions">
          <button type="button" className={`eotm-btn${mode === 'add' ? ' is-primary' : ''}`} aria-pressed={mode === 'add'} onClick={() => setMode((m) => (m === 'add' ? null : 'add'))}>+ Add one</button>
          {carry && <button type="button" className={`eotm-btn${mode === 'from' ? ' is-primary' : ''}`} aria-pressed={mode === 'from'} onClick={() => setMode((m) => (m === 'from' ? null : 'from'))}>New class from this…</button>}
          <button type="button" className="eotm-btn is-quiet" onClick={() => { onClose(); openStyle(cls.name) }}>Style</button>
        </div>
        {!carry && <p className="eotm-help">This look comes from where an object sits (every {cls.label.toLowerCase()} in its place), so a class cannot be made from it.</p>}
        {mode === 'from' && (
          <form className="eotm-row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) makeFrom() }}>
            <input className="eotm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Outline ${cls.label.toLowerCase()}`}
              aria-label="Name of the new class" maxLength={40} autoFocus />
            <button className="eotm-btn is-primary" disabled={busy || !name.trim()}>Make</button>
          </form>
        )}
        {mode === 'from' && <p className="eotm-help">It starts as {cls.label.toLowerCase()} look. Change its style to make it differ; the rest stays shared.</p>}
        {mode === 'add' && <AddWithClass cls={cls} schema={schema} store={store} scan={scan} addClass={addClass} onAdd={onAdd} />}
      </div>
    </div>
  )
}

// Where an object can go on a page: its sections, and the rows inside them the
// site draws objects in (a card in a row of cards, marked data-eotm-holds),
// each named by the classes around it, and whether this class already sits there.
function targetsOf(doc, schema, scan, cls) {
  const out = []
  const visible = (sel) => [...document.querySelectorAll(sel)].filter((e) => !e.closest('.eotm-root'))
  const onPage = new Map(visible('[data-eotm-item]').map((e) => [e.dataset.eotmItem, e]))
  const holders = new Map(visible('[data-eotm-holds]').map((e) => [e.dataset.eotmHolds, e]))
  const hasHere = (el) => !!el && [...scan.byEl.entries()].some(([e, cs]) => el.contains(e) && cs.some((c) => c.name === cls.name))
  const words = (v) => String(v.title || v.heading || v.label || v.name || '').slice(0, 40)
  for (const f of schema.types[doc.type]?.fields ?? []) {
    if (f.kind !== 'blocks') continue
    for (const b of doc.data?.[f.name] ?? []) {
      if (!b?._id) continue
      const el = onPage.get(b._id)
      const kind = schema.blocks?.[b._type]?.label ?? b._type
      const title = words(b)
      const group = el ? pathAround(el, scan.byEl) || kind : 'Not on the open page'
      // The group names the kind already: the label is then its title alone.
      out.push({ id: b._id, group, label: title ? (group === kind ? title : `${kind}: ${title}`) : kind, has: hasHere(el) })
      // Its rows the site draws objects in, under the section's name.
      for (const [k, v] of Object.entries(b)) {
        if (!Array.isArray(v)) continue
        v.forEach((r, i) => {
          const h = r?._id && holders.get(r._id)
          if (!h) return
          const around = pathAround(h, scan.byEl).split(' › ').pop() || k
          out.push({ id: r._id, group: `${title || kind} › ${around}`, label: `${around.replace(/s$/, '')} ${i + 1}${words(r) ? `: ${words(r)}` : ''}`, has: hasHere(h) })
        })
      }
    }
  }
  return out
}

function AddWithClass({ cls, schema, store, scan, addClass, onAdd }) {
  const options = useMemo(() => classOptions(schema), [schema])
  const assignable = options.some((o) => o.value === cls.name)
  const [docs, setDocs] = useState(null)
  const [docId, setDocId] = useState('')
  const [target, setTarget] = useState('')
  const [onlyWhere, setOnlyWhere] = useState(true)
  const [kind, setKind] = useState(/btn|button/i.test(`${cls.name} ${cls.selector} ${cls.base ?? ''}`) ? 'button' : 'text')
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
  const all = useMemo(() => (doc ? targetsOf(doc, schema, scan, cls) : []), [doc, schema, scan, cls])
  // Bound to where the class already sits on the page, unless asked for all.
  const anyHas = all.some((t) => t.has)
  const shown = onlyWhere && anyHas ? all.filter((t) => t.has) : all
  const groups = useMemo(() => {
    const out = new Map()
    for (const t of shown) { if (!out.has(t.group)) out.set(t.group, []); out.get(t.group).push(t) }
    return [...out.entries()]
  }, [shown])
  useEffect(() => {
    setTarget((s) => (shown.some((x) => x.id === s) ? s : (shown.find((x) => x.has) ?? shown[0])?.id ?? ''))
  }, [shown])

  const add = async () => {
    setBusy(true)
    try {
      let name = klass
      if (klass === '__own') name = await addClass(own.trim())
      const element = newElement(kind, newId(), name ? { class: name } : {})
      await onAdd({ type: doc.type, key: doc.id, item: target, element })
    } finally { setBusy(false) }
  }
  return (
    <div className="eotm-class-add">
      <p className="eotm-help">Add an object with this class?{!assignable && ' This look comes from where an object sits, so pick a class it can carry, or make one of your own.'}</p>
      <label className="eotm-label">Page
        <select className="eotm-input" value={docId} onChange={(e) => setDocId(e.target.value)} disabled={!docs}>
          {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.data?.title || d.slug || d.id}{d.id === here || d.slug === here ? ' (this page)' : ''}</option>)}
        </select>
      </label>
      <label className="eotm-label">Into
        <select className="eotm-input" value={target} onChange={(e) => setTarget(e.target.value)}>
          {groups.map(([g, items]) => (
            <optgroup key={g} label={g}>{items.map((s) => <option key={s.id} value={s.id}>{s.label}{s.has ? ` (has ${cls.label.toLowerCase()})` : ''}</option>)}</optgroup>
          ))}
        </select>
      </label>
      {anyHas && all.some((x) => !x.has) && (
        <label className="eotm-check">
          <input type="checkbox" checked={onlyWhere} onChange={(e) => setOnlyWhere(e.target.checked)} />
          Only where {cls.label.toLowerCase()} already are
        </label>
      )}
      <label className="eotm-label">Object
        <select className="eotm-input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {['text', 'button', 'richtext', 'box'].map((k) => <option key={k} value={k}>{ELEMENT_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="eotm-label">Class
        <select className="eotm-input" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">None</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}{o.base ? ` (from ${options.find((x) => x.value === o.base)?.label ?? o.base})` : ''}</option>)}
          <option value="__own">Custom class…</option>
        </select>
      </label>
      {klass === '__own' && <input className="eotm-input" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Name your class" aria-label="Custom class name" maxLength={40} autoFocus />}
      <div className="eotm-row">
        <button type="button" className="eotm-btn is-primary" disabled={busy || !doc || !target || (klass === '__own' && !own.trim())} onClick={add}>Add</button>
      </div>
    </div>
  )
}
