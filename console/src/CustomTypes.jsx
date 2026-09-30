import React, { useMemo, useState } from 'react'
import { CUSTOM_KINDS, customName, fieldName } from '../schema/custom.js'

// "Types and names": the owner designs a section (placed on any page) or a
// collection (its own list), names its fields and picks what each holds, and
// renames the site's built-in types and fields to words they would use.
// Saved to the site through PUT /custom-schema (schema/custom.js has the rules).

const KIND_LABELS = {
  text: 'Short text', textarea: 'Paragraph', richtext: 'Formatted text', url: 'Link', number: 'Number',
  boolean: 'Yes / no', date: 'Date', datetime: 'Date and time', select: 'Choice from a list', image: 'Photo',
  color: 'Colour', money: 'Price', list: 'List of items',
}

let seq = 0
const key = () => `k${++seq}`

// The owner's current definitions, from the merged schema the console holds.
function customOf(schema) {
  const pick = (defs) => Object.fromEntries(Object.entries(defs ?? {}).filter(([, d]) => d.custom).map(([n, d]) => {
    const { custom, ...rest } = d
    return [n, rest]
  }))
  return { blocks: pick(schema.blocks), types: pick(schema.types) }
}

// Editable rows: every field gets a stable React key and keeps its saved name.
const toRows = (fields = []) => fields.map((f) => ({
  _key: key(), name: f.name, label: f.label ?? f.name, kind: f.kind, required: !!f.required, help: f.help ?? '',
  options: (f.options ?? []).map((o) => o.label).join('\n'), fields: toRows(f.fields),
}))

// Rows back to schema fields, naming new ones from their labels.
function toFields(rows) {
  const used = new Set(rows.filter((r) => r.name).map((r) => r.name))
  return rows.map((r) => {
    let name = r.name
    if (!name) {
      const base = fieldName(r.label) || 'field'
      name = base
      for (let n = 2; used.has(name); n++) name = `${base}${n}`
      used.add(name)
    }
    const f = { name, kind: r.kind, label: r.label.trim() }
    if (r.required) f.required = true
    if (r.help.trim()) f.help = r.help.trim()
    if (r.kind === 'select') {
      const labels = r.options.split('\n').map((o) => o.trim()).filter(Boolean)
      f.options = labels.map((label) => ({ value: fieldName(label) || label.toLowerCase(), label }))
    }
    if (r.kind === 'list') {
      f.fields = toFields(r.fields)
      f.itemLabel = f.fields.find((x) => x.kind === 'text')?.name
    }
    return f
  })
}

// Renaming what the site ships: the type (and its plural) and every field,
// lists' own fields included. Names are labels only; content is untouched.
function RenameFields({ fields, prefix, labels, setLabel }) {
  return (fields ?? []).map((f) => {
    const path = `${prefix}.${f.name}`
    return (
      <div key={path} className="eotm-rename-field">
        <RenameInput label={f.label ?? f.name} shipped={f.shippedLabel} value={labels.fields?.[path]}
          onChange={(v) => setLabel('fields', path, v)} />
        {f.fields && <div className="eotm-custom-sub"><RenameFields fields={f.fields} prefix={path} labels={labels} setLabel={setLabel} /></div>}
      </div>
    )
  })
}

// Shows the current name; typing sets the owner's own, Reset returns to the site's.
function RenameInput({ label, shipped, value, onChange, aria }) {
  const current = value ?? label
  const original = shipped ?? label
  return (
    <div className="eotm-row">
      <input className="eotm-input" aria-label={aria ?? `Rename ${original}`} value={current} maxLength={60}
        onChange={(e) => onChange(e.target.value === original ? undefined : e.target.value)} />
      {current !== original && (
        <button type="button" className="eotm-btn is-quiet" title={`Back to “${original}”`} onClick={() => onChange(undefined)}>Reset</button>
      )}
    </div>
  )
}

function Rename({ schema, labels, setLabel }) {
  const builtIn = (kind) => Object.entries(schema[kind] ?? {}).filter(([, d]) => !d.custom)
  const [open, setOpen] = useState(null)
  const entry = (kind, name, def) => {
    const k = `${kind}.${name}`
    const own = labels[kind]?.[name] ?? {}
    return (
      <li key={k} className={`eotm-item${open === k ? ' is-open' : ''}`}>
        <div className="eotm-item-head">
          <button type="button" className="eotm-item-title" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
            {own.label ?? def.label ?? name} <span className="eotm-help">· {kind === 'types' ? 'type' : 'section'}</span>
          </button>
        </div>
        {open === k && (
          <div className="eotm-item-body">
            <p className="eotm-label">Name</p>
            <RenameInput label={def.label ?? name} shipped={def.shippedLabel} value={own.label} aria={`Name of ${def.shippedLabel ?? def.label ?? name}`}
              onChange={(v) => setLabel(kind, name, v, 'label')} />
            {kind === 'types' && def.plural && (
              <>
                <p className="eotm-label">Name for more than one</p>
                <RenameInput label={def.plural} shipped={def.shippedPlural} value={own.plural} onChange={(v) => setLabel(kind, name, v, 'plural')} />
              </>
            )}
            <p className="eotm-label">Fields</p>
            <RenameFields fields={def.fields} prefix={k} labels={labels} setLabel={setLabel} />
          </div>
        )}
      </li>
    )
  }
  return (
    <ul className="eotm-custom-list">
      {builtIn('types').map(([n, d]) => entry('types', n, d))}
      {builtIn('blocks').map(([n, d]) => entry('blocks', n, d))}
    </ul>
  )
}

function FieldRows({ rows, onChange, kinds, depth = 0 }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i, d) => { const n = [...rows]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n) }
  return (
    <ol className="eotm-custom-fields">
      {rows.map((r, i) => (
        <li key={r._key} className="eotm-custom-field">
          <div className="eotm-row">
            <input className="eotm-input" aria-label="Field name" placeholder="Field name, e.g. Button text" value={r.label}
              onChange={(e) => set(i, { label: e.target.value })} />
            <select className="eotm-input" aria-label="What it holds" value={r.kind} disabled={!!r.name}
              title={r.name ? 'Saved fields keep their kind, so existing entries stay valid.' : undefined}
              onChange={(e) => set(i, { kind: e.target.value })}>
              {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </div>
          <div className="eotm-row">
            <label className="eotm-check"><input type="checkbox" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
            <span className="eotm-spacer" />
            <button type="button" className="eotm-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move field up">↑</button>
            <button type="button" className="eotm-icon" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move field down">↓</button>
            <button type="button" className="eotm-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove field">✕</button>
          </div>
          <input className="eotm-input" placeholder="Hint shown under it (optional)" value={r.help} onChange={(e) => set(i, { help: e.target.value })} />
          {r.kind === 'select' && (
            <textarea className="eotm-input" rows={3} placeholder="The choices, one per line" value={r.options}
              onChange={(e) => set(i, { options: e.target.value })} />
          )}
          {r.kind === 'list' && depth === 0 && (
            <div className="eotm-custom-sub">
              <p className="eotm-help">Each item in the list has:</p>
              <FieldRows rows={r.fields} depth={1} kinds={kinds.filter((k) => k !== 'list')} onChange={(fields) => set(i, { fields })} />
            </div>
          )}
        </li>
      ))}
      <li>
        <button type="button" className="eotm-btn is-quiet"
          onClick={() => onChange([...rows, { _key: key(), name: '', label: '', kind: 'text', required: false, help: '', options: '', fields: [] }])}>
          + Field
        </button>
      </li>
    </ol>
  )
}

export default function CustomTypes({ schema, store, notify, onSaved }) {
  const initial = useMemo(() => {
    const c = customOf(schema)
    const list = [
      ...Object.entries(c.blocks).map(([name, d]) => ({ _key: key(), name, as: 'section', label: d.label, fields: toRows(d.fields) })),
      ...Object.entries(c.types).map(([name, d]) => ({ _key: key(), name, as: 'collection', label: d.label, fields: toRows(d.fields) })),
    ]
    return list
  }, [schema])
  const [items, setItems] = useState(initial)
  const [labels, setLabels] = useState(() => structuredClone(schema.custom?.labels ?? {}))
  // kind 'fields': path -> text; kind 'types'/'blocks': name -> { label, plural }.
  const setLabel = (kind, name, value, key) => setLabels((all) => {
    const next = structuredClone(all)
    if (kind === 'fields') {
      next.fields ??= {}
      if (value == null) delete next.fields[name]
      else next.fields[name] = value
    } else {
      next[kind] ??= {}
      next[kind][name] ??= {}
      if (value == null) delete next[kind][name][key]
      else next[kind][name][key] = value
      if (!Object.keys(next[kind][name]).length) delete next[kind][name]
    }
    return next
  })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])

  const set = (k, patch) => setItems((all) => all.map((x) => (x._key === k ? { ...x, ...patch } : x)))
  const add = (as) => {
    const item = { _key: key(), name: '', as, label: '', fields: [{ _key: key(), name: '', label: 'Heading', kind: 'text', required: false, help: '', options: '', fields: [] }] }
    setItems((all) => [...all, item])
    setOpen(item._key)
  }

  const save = async () => {
    const custom = { blocks: {}, types: {}, labels }
    const used = new Set([...Object.keys(schema.blocks ?? {}), ...Object.keys(schema.types ?? {})])
    for (const it of items) {
      let name = it.name
      if (!name) {
        const base = customName(it.label) || 'customType'
        name = base
        for (let n = 2; used.has(name); n++) name = `${base}${n}`
      }
      used.add(name)
      const fields = toFields(it.fields)
      if (it.as === 'section') custom.blocks[name] = { label: it.label.trim(), className: `section custom-${name.slice(6).toLowerCase()}`, fields }
      else {
        custom.types[name] = { label: it.label.trim(), plural: it.label.trim(), fields,
          ...(fields.find((f) => f.kind === 'text') ? { titleField: fields.find((f) => f.kind === 'text').name } : {}) }
      }
    }
    setBusy(true)
    setErrors([])
    try {
      const { schema: next } = await store.saveCustom(custom)
      onSaved(next)
      notify('Saved. Your types are ready to use.')
    } catch (e) {
      setErrors(e.errors ?? [e.message])
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="eotm-custom">
      <p className="eotm-help">
        Design your own <strong>sections</strong> (placed on any page, like a banner or a testimonial) or
        <strong> collections</strong> (a list of their own, such as a menu or a price list). The site shows a new
        section straight away in a plain style; ask Edge of the Map when you want it styled to match.
      </p>
      <ul className="eotm-custom-list">
        {items.map((it) => (
          <li key={it._key} className={`eotm-item${open === it._key ? ' is-open' : ''}`}>
            <div className="eotm-item-head">
              <button type="button" className="eotm-item-title" aria-expanded={open === it._key} onClick={() => setOpen(open === it._key ? null : it._key)}>
                {it.label || 'New type'} <span className="eotm-help">· {it.as === 'section' ? 'section' : 'collection'}</span>
              </button>
              <button type="button" className="eotm-icon" aria-label={`Delete ${it.label || 'type'}`}
                onClick={() => setItems((all) => all.filter((x) => x._key !== it._key))}>✕</button>
            </div>
            {open === it._key && (
              <div className="eotm-item-body">
                <label className="eotm-label" htmlFor={`${it._key}-label`}>Name</label>
                <input id={`${it._key}-label`} className="eotm-input" placeholder="e.g. Banner" value={it.label}
                  onChange={(e) => set(it._key, { label: e.target.value })} />
                <p className="eotm-label">Fields</p>
                <FieldRows rows={it.fields} kinds={CUSTOM_KINDS} onChange={(fields) => set(it._key, { fields })} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="eotm-palette">
        <button type="button" className="eotm-btn is-quiet" onClick={() => add('section')}>+ New section type</button>
        <button type="button" className="eotm-btn is-quiet" onClick={() => add('collection')}>+ New collection</button>
      </div>
      <h3 className="eotm-label">Rename the site's own types and fields</h3>
      <p className="eotm-help">Call things what you call them. Only the names in the editor change; your content and the site stay as they are.</p>
      <Rename schema={schema} labels={labels} setLabel={setLabel} />
      {errors.length > 0 && <ul className="eotm-error" role="alert">{errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
      <button type="button" className="eotm-btn is-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
