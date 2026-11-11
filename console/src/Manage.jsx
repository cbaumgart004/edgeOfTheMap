// A type's manager (schema `manage`, 1.38.0+): the list a shop works from, as
// a marketplace seller app lays it out. Search across the fields `search`
// names, a filter panel, the documents grouped by `groupBy` (Section, then
// Category) as photo cards, Quick edit (the fields edited most, in place on
// each card), and a selection edited together (Bulk edit) or published at once.
//
// `stock` (optional) reads each variation's quantity from the site's own
// inventory by SKU and writes a changed one back as a count, so a quantity is
// never kept in the document: the inventory stays the one source of it.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { titleOf } from '../schema/schema.js'
import { FieldList } from './Fields.jsx'

const SAVE_DELAY = 800
const STATUS = { draft: 'Draft', published: 'Live', changed: 'Live, edited' }

// Every value at a dotted path, a list stepped into: "tags.tag" on
// { tags: [{ tag: 'a' }, { tag: 'b' }] } is ['a', 'b'].
export function valuesAt(data, path) {
  let vals = [data]
  for (const part of path.split('.')) {
    vals = vals.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => v?.[part]).filter((v) => v != null)
  }
  return vals.flatMap((v) => (Array.isArray(v) ? v : [v]))
}

// The documents that match a search: any value at any `search` path holds it.
export function matches(manage, doc, q) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (manage.search ?? ['title']).some((p) => valuesAt(doc.data, p).some((v) => typeof v !== 'object' && String(v).toLowerCase().includes(s)))
}

const money = (m) => (m?.amount == null ? null : m.amount / 100)
const priceText = (amounts) => {
  const a = amounts.filter((n) => n != null)
  if (!a.length) return 'No price'
  const lo = Math.min(...a)
  const hi = Math.max(...a)
  const f = (n) => `$${n.toFixed(2)}`
  return lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`
}

// The site's inventory, by SKU, when the schema names it.
function useStock(stock, getToken, notify) {
  const [bySku, setBySku] = useState(null)
  useEffect(() => {
    if (!stock?.list) return
    let gone = false
    ;(async () => {
      try {
        const token = await getToken?.()
        const res = await fetch(stock.list, { headers: token ? { authorization: `Bearer ${token}` } : {} })
        if (!res.ok) throw new Error(`Inventory answered ${res.status}`)
        const rows = await res.json()
        if (!gone) setBySku(new Map((Array.isArray(rows) ? rows : []).filter((r) => r.sku).map((r) => [r.sku, r])))
      } catch (e) {
        console.warn('[manage] inventory not read:', e.message)
        // Unreadable stays null: no Qty column, rather than None on every row.
      }
    })()
    return () => { gone = true }
  }, [stock?.list, getToken])
  const setCount = async (sku, quantity) => {
    const item = bySku?.get(sku)
    if (!item) return
    try {
      const token = await getToken?.()
      const res = await fetch(stock.count.replace('{id}', encodeURIComponent(item.id)), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind: 'count', quantity, note: 'Quick edit' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Inventory answered ${res.status}`)
      setBySku((m) => new Map(m).set(sku, { ...item, quantity: body.item?.quantity ?? body.quantity ?? quantity }))
      notify(`${sku}: ${quantity} in stock.`)
    } catch (e) {
      notify(`${sku} not counted: ${e.message}`)
    }
  }
  return { bySku, setCount }
}

export default function ManageList({ schema, store, type, notify, open, ctxBase, getToken }) {
  const t = schema.types[type]
  const manage = t.manage
  const fieldOf = (n) => t.fields.find((f) => f.name === n)
  const [docs, setDocs] = useState(null)
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [filters, setFilters] = useState({ status: '' })
  const [picked, setPicked] = useState(() => new Set())
  const [bulk, setBulk] = useState(false)
  const { bySku, setCount } = useStock(manage.stock, getToken, notify)
  const load = () => store.list(type).then(setDocs).catch((e) => notify(e.message))
  useEffect(() => { load() }, [store, type]) // eslint-disable-line react-hooks/exhaustive-deps
  const replace = (d) => setDocs((list) => list.map((x) => (x.id === d.id ? d : x)))

  const groupBy = manage.groupBy ?? []
  const shown = useMemo(() => (docs ?? []).filter((d) => matches(manage, d, q)
    && (!filters.status || d.status === filters.status)
    && groupBy.every((g) => filters[g] == null || filters[g] === '' || (d.data?.[g] ?? '') === filters[g])), [docs, q, filters, manage]) // eslint-disable-line react-hooks/exhaustive-deps
  const choices = (g) => [...new Set((docs ?? []).map((d) => d.data?.[g] ?? ''))].sort()

  // Section › Category › cards, each heading with its count.
  const tree = useMemo(() => {
    const grow = (list, depth) => {
      if (depth >= groupBy.length) return list
      const by = new Map()
      for (const d of list) {
        const k = d.data?.[groupBy[depth]] ?? ''
        if (!by.has(k)) by.set(k, [])
        by.get(k).push(d)
      }
      return [...by.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b))).map(([k, l]) => ({ key: k, count: l.length, items: grow(l, depth + 1) }))
    }
    return grow([...shown].sort((a, b) => titleOf(schema, a).localeCompare(titleOf(schema, b))), 0)
  }, [shown, schema]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // A search opens every group it leaves, unless it leaves too many to draw.
  const searching = q.trim() !== '' && shown.length <= 60
  const noneLabel = (g) => `No ${(fieldOf(g)?.label ?? g).toLowerCase()}`
  const card = (d) => (
    <Card key={d.id} d={d} schema={schema} manage={manage} picked={picked.has(d.id)} onPick={() => toggle(d.id)} onOpen={() => open(d)}
      quick={quick} store={store} notify={notify} ctxBase={ctxBase} onSaved={replace} bySku={bySku} setCount={setCount} />
  )
  const branch = (nodes, depth, at) => (depth >= groupBy.length ? <ul className="eotm-manage-cards">{nodes.map(card)}</ul> : nodes.map((n) => (
    <Group key={`${at}/${n.key}`} depth={depth} searching={searching} count={n.count} title={n.key}
      label={n.key ? (depth > 0 ? n.key.split(' < ').slice(-2).join(' › ') : n.key) : noneLabel(groupBy[depth])}>
      {() => branch(n.items, depth + 1, `${at}/${n.key}`)}
    </Group>
  )))

  const pickedDocs = (docs ?? []).filter((d) => picked.has(d.id))
  const publishPicked = async () => {
    let done = 0
    const held = []
    for (const d of pickedDocs) {
      if (d.status === 'published') continue
      try { replace(await store.publish(d.id, d.version)); done++ } catch (e) { held.push(`${titleOf(schema, d)}: ${e.message}`) }
    }
    notify(held.length ? `Published ${done}; ${held.length} held. ${held[0]}` : `Published ${done}.`)
  }

  return (
    <div className="eotm-manage">
      <div className="eotm-manage-bar">
        <input className="eotm-input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={manage.searchLabel ?? `Search ${(t.plural ?? t.label).toLowerCase()}`} aria-label={manage.searchLabel ?? 'Search'} />
        <button type="button" className={`eotm-icon${quick ? ' is-on' : ''}`} aria-pressed={quick} onClick={() => setQuick((v) => !v)}
          title="Quick edit: change the fields edited most, right on each card" aria-label="Quick edit">✎</button>
        <button type="button" className={`eotm-icon${filtering || filters.status || groupBy.some((g) => filters[g] != null && filters[g] !== '') ? ' is-on' : ''}`}
          aria-pressed={filtering} onClick={() => setFiltering((v) => !v)} title="Filter" aria-label="Filter">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
        </button>
      </div>
      {filtering && (
        <div className="eotm-manage-filters">
          <label className="eotm-field"><span className="eotm-label">Status</span>
            <select className="eotm-input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Any</option>
              {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {groupBy.map((g) => (
            <label key={g} className="eotm-field"><span className="eotm-label">{fieldOf(g)?.label ?? g}</span>
              <select className="eotm-input" value={filters[g] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [g]: e.target.value }))}>
                <option value="">Any</option>
                {choices(g).map((c) => <option key={c || 'none'} value={c}>{c || noneLabel(g)}</option>)}
              </select>
            </label>
          ))}
          <button type="button" className="eotm-btn is-quiet" onClick={() => setFilters({ status: '' })}>Clear filters</button>
        </div>
      )}
      <div className="eotm-row eotm-manage-count">
        <span className="eotm-help">{docs ? `${shown.length} of ${docs.length}` : ''}</span>
        {shown.length > 0 && <button type="button" className="eotm-btn is-quiet" onClick={() => setPicked(picked.size ? new Set() : new Set(shown.map((d) => d.id)))}>{picked.size ? 'Select none' : `Select all ${shown.length}`}</button>}
        <button type="button" className="eotm-btn is-primary" onClick={async () => { try { open(await store.create({ type, data: {} })) } catch (e) { notify(e.message) } }}>New {t.label.toLowerCase()}</button>
      </div>
      {docs === null ? <p className="eotm-empty">Loading…</p> : shown.length === 0 ? <p className="eotm-empty">Nothing matches.</p> : branch(tree, 0, '')}
      {picked.size > 0 && (
        <div className="eotm-manage-picked" role="region" aria-label="Selected">
          <strong>{picked.size} selected</strong>
          <button type="button" className="eotm-btn is-primary" onClick={() => setBulk(true)}>Edit together</button>
          <button type="button" className="eotm-btn" onClick={publishPicked}>Publish</button>
          <button type="button" className="eotm-btn is-quiet" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
      {bulk && <BulkEdit schema={schema} type={type} docs={pickedDocs} store={store} notify={notify} ctxBase={ctxBase}
        onDone={(saved) => { saved.forEach(replace); setBulk(false) }} onCancel={() => setBulk(false)} />}
    </div>
  )
}

// A Section or Category heading. Its cards are built only while it is open: a
// shop of hundreds, each card with its Quick edit, is too much to keep drawn.
function Group({ depth, searching, count, title, label, children }) {
  const [isOpen, setOpen] = useState(false)
  const shown = isOpen || searching
  return (
    <details className={`eotm-fold eotm-manage-group is-depth-${depth}`} open={shown || undefined}
      onToggle={(e) => { if (!searching) setOpen(e.currentTarget.open) }}>
      <summary>
        <span className="eotm-fold-label" title={title}>{label}</span>
        <span className="eotm-class-count">{count}</span>
      </summary>
      {shown && children()}
    </details>
  )
}

function Card({ d, schema, manage, picked, onPick, onOpen, quick, store, notify, ctxBase, onSaved, bySku, setCount }) {
  const photo = manage.photo ? valuesAt(d.data, manage.photo)[0] : null
  const src = typeof photo === 'string' ? photo : photo?.src
  const v = manage.variations
  const rows = v ? d.data?.[v.list] ?? [] : []
  const qty = bySku && v ? rows.reduce((n, r) => n + (bySku.get(r[v.sku])?.quantity ?? 0), 0) : null
  const title = titleOf(schema, d)
  return (
    <li className={`eotm-manage-card${picked ? ' is-picked' : ''}`}>
      <div className="eotm-manage-head">
        <label className="eotm-manage-pick"><input type="checkbox" className="eotm-manage-check" checked={picked} onChange={onPick} aria-label={`Select ${title}`} /></label>
        <button type="button" className="eotm-manage-open" onClick={onOpen} title="Open every field">
          {src ? <img src={src} alt="" loading="lazy" /> : <span className="eotm-manage-nophoto" aria-hidden="true" />}
          <span className="eotm-manage-text">
            <strong>{title}</strong>
            <span className="eotm-help">
              {v ? priceText(rows.map((r) => money(r[v.price]))) : ''}
              {qty != null ? ` · ${qty} in stock` : ''}
              {v ? ` · ${rows.length} SKU${rows.length === 1 ? '' : 's'}` : ''}
            </span>
            <span className={`eotm-chip is-${d.status}`}>{STATUS[d.status]}</span>
          </span>
        </button>
      </div>
      {quick && <QuickEdit d={d} schema={schema} manage={manage} store={store} notify={notify} ctxBase={ctxBase} onSaved={onSaved} bySku={bySku} setCount={setCount} />}
    </li>
  )
}

// The fields `quick` names, on the card, saving as they change; then each
// variation's SKU, price and (from the inventory) quantity.
function QuickEdit({ d, schema, manage, store, notify, ctxBase, onSaved, bySku, setCount }) {
  const t = schema.types[d.type]
  const [doc, setDoc] = useState(d)
  const latest = useRef(d)
  const timer = useRef(null)
  const flush = async () => {
    clearTimeout(timer.current)
    const cur = latest.current
    if (!cur.dirty) return
    latest.current = { ...cur, dirty: false }
    try {
      const saved = await store.save(cur.id, { baseVersion: cur.version, data: cur.data })
      latest.current = { ...saved, data: latest.current.dirty ? latest.current.data : saved.data, dirty: latest.current.dirty }
      onSaved(saved)
      if (!latest.current.dirty) setDoc(saved)
    } catch (e) {
      if (e.status === 409 && e.current) { latest.current = e.current; setDoc(e.current); onSaved(e.current); notify('Changed somewhere else; showing that version.') } else notify(e.message)
    }
  }
  useEffect(() => () => { flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const change = (data) => {
    latest.current = { ...latest.current, data, dirty: true }
    setDoc((x) => ({ ...x, data }))
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }
  const fields = (manage.quick ?? []).map((n) => t.fields.find((f) => f.name === n)).filter(Boolean)
  const ctx = { ...ctxBase, docId: doc.id, docType: doc.type, docData: doc.data, errors: [], stateOf: () => null, saveNow: flush, onPick: () => {}, focus: null }
  const v = manage.variations
  const rows = v ? doc.data?.[v.list] ?? [] : []
  const setRow = (i, patch) => change({ ...doc.data, [v.list]: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div className="eotm-manage-quick">
      <FieldList fields={fields} value={doc.data} onChange={change} ctx={ctx} />
      {v && rows.length > 0 && (
        <table className="eotm-manage-rows">
          <thead><tr><th>{v.optionLabel ?? 'Option'}</th><th>SKU</th><th>Price</th>{bySku && <th>Qty</th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const item = bySku?.get(r[v.sku])
              return (
                <tr key={r._id ?? i}>
                  <td>{r[v.option] || '(one)'}</td>
                  <td><input className="eotm-input" value={r[v.sku] ?? ''} aria-label="SKU" onChange={(e) => setRow(i, { [v.sku]: e.target.value })} /></td>
                  <td><input className="eotm-input" type="number" min="0" step="0.01" inputMode="decimal" aria-label="Price" key={`${doc.id}:${i}:${r[v.price]?.amount}`}
                    defaultValue={money(r[v.price]) ?? ''} onBlur={(e) => {
                      const n = e.target.value === '' ? null : Math.round(Number(e.target.value) * 100)
                      if (n !== (r[v.price]?.amount ?? null) && (n == null || Number.isFinite(n))) setRow(i, { [v.price]: { currency: r[v.price]?.currency ?? 'USD', amount: n } })
                    }} /></td>
                  {bySku && (
                    <td>{item ? (
                      <input className="eotm-input" type="number" min="0" step="1" inputMode="numeric" aria-label="Quantity" key={`${r[v.sku]}:${item.quantity}`}
                        defaultValue={item.quantity} onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (e.target.value !== '' && Number.isInteger(n) && n >= 0 && n !== item.quantity) setCount(r[v.sku], n)
                        }} />
                    ) : <span className="eotm-help" title="No inventory item has this SKU">None</span>}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// The selection, edited together: each field set here goes to every one; a
// field left alone is left as each has it. `setPrice` sets every variation's.
function BulkEdit({ schema, type, docs, store, notify, ctxBase, onDone, onCancel }) {
  const t = schema.types[type]
  const manage = t.manage
  const [value, setValue] = useState({})
  const [touched, setTouched] = useState(() => new Set())
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const fields = (manage.bulk ?? []).map((n) => t.fields.find((f) => f.name === n)).filter(Boolean)
  const ctx = { ...ctxBase, docId: null, docType: type, docData: value, errors: [], stateOf: () => null, saveNow: () => {}, onPick: () => {}, focus: null }
  const v = manage.variations
  const apply = async () => {
    setBusy(true)
    const saved = []
    const failed = []
    const cents = price === '' ? null : Math.round(Number(price) * 100)
    for (const d of docs) {
      try {
        const cur = await store.get(d.id)
        const data = { ...cur.data }
        for (const n of touched) data[n] = value[n]
        if (v && cents != null && Number.isFinite(cents)) data[v.list] = (data[v.list] ?? []).map((r) => ({ ...r, [v.price]: { currency: r[v.price]?.currency ?? 'USD', amount: cents } }))
        saved.push(await store.save(d.id, { baseVersion: cur.version, data }))
      } catch (e) {
        failed.push(`${titleOf(schema, d)}: ${e.message}`)
      }
    }
    setBusy(false)
    notify(failed.length ? `Saved ${saved.length}; ${failed.length} not saved. ${failed[0]}` : `Saved ${saved.length}.`)
    onDone(saved)
  }
  return (
    <div className="eotm-manage-bulk" role="dialog" aria-label={`Edit ${docs.length} together`}>
      <h3>Edit {docs.length} together</h3>
      <p className="eotm-help">Only what you change here is applied; everything else stays as each one has it.</p>
      <FieldList fields={fields} value={value} ctx={ctx} onChange={(next) => {
        const changed = Object.keys(next).filter((k) => next[k] !== value[k])
        setTouched((s) => new Set([...s, ...changed]))
        setValue(next)
      }} />
      {v && (
        <label className="eotm-field"><span className="eotm-label">Price of every variation</span>
          <input className="eotm-input" type="number" min="0" step="0.01" inputMode="decimal" value={price} placeholder="Leave empty to keep each" onChange={(e) => setPrice(e.target.value)} />
        </label>
      )}
      <div className="eotm-row">
        <button type="button" className="eotm-btn is-primary" disabled={busy || (!touched.size && price === '')} onClick={apply}>{busy ? 'Saving…' : `Apply to ${docs.length}`}</button>
        <button type="button" className="eotm-btn is-quiet" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
