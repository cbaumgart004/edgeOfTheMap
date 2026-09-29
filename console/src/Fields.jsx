import React, { useEffect, useId, useState } from 'react'
import { newBlock, newListItem, duplicateData, titleOf } from '../schema/schema.js'
import RichText from './RichText.jsx'
import Layout from './Layout.jsx'
import { prepareImage } from './images.js'

// One editor per field kind (schema/SCHEMA.md). `ctx` carries the schema, the
// store (relations and uploads) and the errors for this document.

export function FieldList({ fields, value, onChange, ctx, path = '' }) {
  return fields.map((f) => (
    <Field key={f.name} field={f} value={value?.[f.name]} ctx={ctx} path={path ? `${path}.${f.name}` : f.name}
      onChange={(v) => onChange({ ...value, [f.name]: v })} />
  ))
}

function Field({ field, value, onChange, ctx, path }) {
  const id = useId()
  const error = ctx.errors?.find((e) => e.startsWith(`${path}:`))?.slice(path.length + 2)
  const label = field.label ?? field.name
  const wrap = (control, { block = false } = {}) => (
    <div className={`eotm-field${error ? ' has-error' : ''}${block ? ' is-block' : ''}`}>
      <label htmlFor={id} className="eotm-label">{label}{field.required && <span aria-hidden="true"> *</span>}</label>
      {control}
      {field.help && <p className="eotm-help">{field.help}</p>}
      {error && <p className="eotm-error" role="alert">{error}</p>}
    </div>
  )

  switch (field.kind) {
    case 'text':
      return wrap(<input id={id} className="eotm-input" value={value ?? ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />)
    case 'url':
      return wrap(<input id={id} className="eotm-input" type="url" inputMode="url" value={value ?? ''} placeholder="https://… or /page" onChange={(e) => onChange(e.target.value)} />)
    case 'textarea':
      return wrap(<textarea id={id} className="eotm-input" rows={4} value={value ?? ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />)
    case 'placement':
      return wrap(<Placement id={id} field={field} value={value} onChange={onChange} ctx={ctx} />)
    case 'layout':
      return wrap(<Layout id={id} value={value} onChange={onChange} ctx={ctx} />, { block: true })
    case 'richtext':
      return wrap(<RichText value={value} onChange={onChange} schema={ctx.schema} upload={ctx.upload} label={label} />, { block: true })
    case 'number':
      return wrap(<input id={id} className="eotm-input" type="number" inputMode={field.integer ? 'numeric' : 'decimal'} step={field.step ?? (field.integer ? 1 : 'any')}
        min={field.min} max={field.max} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />)
    case 'money':
      return wrap(
        <div className="eotm-row">
          <input id={id} className="eotm-input" type="number" inputMode="decimal" step="0.01" min="0"
            value={value?.amount == null ? '' : (value.amount / 100).toFixed(2)}
            onChange={(e) => onChange({ currency: value?.currency ?? field.currency ?? 'USD', amount: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} />
          <span className="eotm-unit">{value?.currency ?? field.currency ?? 'USD'}</span>
        </div>)
    case 'boolean':
      return (
        <div className="eotm-field eotm-check">
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id}>{label}</label>
          {field.help && <p className="eotm-help">{field.help}</p>}
        </div>)
    case 'date':
      return wrap(<input id={id} className="eotm-input" type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />)
    case 'datetime':
      return wrap(<DateTime id={id} value={value} onChange={onChange} />)
    case 'select':
      return wrap(
        <select id={id} className="eotm-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">None</option>}
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>)
    case 'image':
      return wrap(<ImageField id={id} value={value} onChange={onChange} ctx={ctx} />, { block: true })
    case 'photos':
      return wrap(<Photos id={id} field={field} value={value ?? []} onChange={onChange} ctx={ctx} />, { block: true })
    case 'relation':
      return wrap(<Relation id={id} field={field} value={value} onChange={onChange} ctx={ctx} />)
    case 'group':
      return (
        <fieldset className="eotm-group">
          <legend>{label}</legend>
          {field.help && <p className="eotm-help">{field.help}</p>}
          <FieldList fields={field.fields} value={value ?? {}} onChange={onChange} ctx={ctx} path={path} />
        </fieldset>)
    case 'list':
      return (
        <Repeater label={label} help={field.help} items={value ?? []} onChange={onChange} ctx={ctx} path={path}
          itemTitle={(item, i) => (field.itemLabel && item[field.itemLabel]) || `${field.itemLabel ?? 'Item'} ${i + 1}`}
          fieldsFor={() => field.fields}
          add={[{ key: 'item', label: `Add ${field.itemLabel ?? 'item'}`, make: () => newListItem(field, ctx.schema) }]} />)
    case 'blocks':
      return (
        <Repeater label={label} help={field.help} items={value ?? []} onChange={onChange} ctx={ctx} path={path} sections
          itemTitle={(b) => {
            const def = ctx.schema.blocks[b._type]
            const t = b.title || b.heading
            return t ? `${def?.label}: ${t}` : def?.label ?? b._type
          }}
          fieldsFor={(b) => ctx.schema.blocks[b._type]?.fields ?? []}
          add={field.of.map((name) => ({ key: name, label: ctx.schema.blocks[name].label, make: () => newBlock(ctx.schema, name) }))} />)
    default:
      return wrap(<p className="eotm-help">Unsupported field kind “{field.kind}”.</p>)
  }
}

// <input type="datetime-local"> has no zone; store the owner's local offset with it.
function DateTime({ id, value, onChange }) {
  const local = value ? toLocalInput(new Date(value)) : ''
  return <input id={id} className="eotm-input" type="datetime-local" value={local}
    onChange={(e) => onChange(e.target.value ? withOffset(e.target.value) : '')} />
}
const pad = (n) => String(n).padStart(2, '0')
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function withOffset(local) {
  const off = -new Date(local).getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${local}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

async function uploadPhoto(file, ctx) {
  const { blob, width, height } = await prepareImage(file)
  const src = await ctx.upload(blob)
  return { src, width, height, alt: '' }
}

function ImageField({ id, value, onChange, ctx }) {
  const [busy, setBusy] = useState(false)
  const pick = async (file) => {
    if (!file) return
    setBusy(true)
    try { onChange(await uploadPhoto(file, ctx)) } catch (e) { ctx.notify(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="eotm-image">
      {value?.src && <img src={value.src} alt="" />}
      <div className="eotm-row">
        <label className="eotm-btn">
          {busy ? 'Uploading…' : value?.src ? 'Replace photo' : 'Add photo'}
          <input id={id} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
        </label>
        {value?.src && <button type="button" className="eotm-btn is-quiet" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {value?.src && <input className="eotm-input" placeholder="Describe the photo for screen readers" value={value.alt ?? ''}
        onChange={(e) => onChange({ ...value, alt: e.target.value })} />}
    </div>
  )
}

function Photos({ id, field, value, onChange, ctx }) {
  const [busy, setBusy] = useState(0)
  const indexes = field.indexes ?? null
  const add = async (files) => {
    const list = [...files]
    setBusy(list.length)
    let next = value
    for (const file of list) {
      try {
        const photo = await uploadPhoto(file, ctx)
        // Suggest the index a pair still lacks: Light first, then Dark.
        if (indexes) photo.index = indexes.find((ix) => !next.some((p) => p.index === ix)) ?? indexes[0]
        next = [...next, photo]
        onChange(next)
      } catch (e) {
        ctx.notify(e.message)
      }
      setBusy((n) => n - 1)
    }
  }
  const set = (i, patch) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const move = (i, d) => {
    const next = [...value]
    const [p] = next.splice(i, 1)
    next.splice(i + d, 0, p)
    onChange(next)
  }
  return (
    <div className="eotm-photos">
      <ul>
        {value.map((p, i) => (
          <li key={`${p.src}-${i}`} className="eotm-photo">
            <img src={p.src} alt="" />
            <div className="eotm-photo-meta">
              {indexes && (
                <div className="eotm-seg" role="radiogroup" aria-label="Lighting">
                  {indexes.map((ix) => (
                    <button key={ix} type="button" role="radio" aria-checked={p.index === ix} className={p.index === ix ? 'is-on' : ''} onClick={() => set(i, { index: ix })}>{ix}</button>
                  ))}
                </div>
              )}
              <input className="eotm-input" placeholder="Describe the photo" value={p.alt ?? ''} onChange={(e) => set(i, { alt: e.target.value })} />
              <div className="eotm-row">
                <button type="button" className="eotm-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">↑</button>
                <button type="button" className="eotm-icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move later">↓</button>
                <button type="button" className="eotm-icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove photo">✕</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <label className="eotm-btn">
        {busy ? `Uploading ${busy}…` : 'Add photos'}
        <input id={id} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </label>
    </div>
  )
}

function Relation({ id, field, value, onChange, ctx }) {
  const [options, setOptions] = useState([])
  useEffect(() => { ctx.store.list(field.to).then(setOptions).catch(() => setOptions([])) }, [field.to, ctx.store])
  const label = (d) => titleOf(ctx.schema, d)
  if (field.many) {
    const ids = value ?? []
    return (
      <select id={id} className="eotm-input" multiple value={ids} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
        {options.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}
      </select>)
  }
  return (
    <select id={id} className="eotm-input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose {ctx.schema.types[field.to]?.label?.toLowerCase() ?? field.to}…</option>
      {options.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}
    </select>)
}

// Page sections and list rows: add from a palette, duplicate, reorder, remove.
function Repeater({ label, help, items, onChange, ctx, path, itemTitle, fieldsFor, add, sections }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) => setOpen((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const update = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)))
  const move = (i, d) => {
    const next = [...items]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }
  const duplicate = (i) => {
    const copy = duplicateData(items[i])
    onChange([...items.slice(0, i + 1), copy, ...items.slice(i + 1)])
    setOpen((s) => new Set(s).add(copy._id))
  }
  const insert = (make) => {
    const item = make()
    onChange([...items, item])
    setOpen((s) => new Set(s).add(item._id))
  }

  return (
    <fieldset className={`eotm-group eotm-repeater${sections ? ' is-sections' : ''}`}>
      <legend>{label}</legend>
      {help && <p className="eotm-help">{help}</p>}
      <ol>
        {items.map((item, i) => {
          const key = item._id ?? i
          const isOpen = open.has(key)
          const hasError = ctx.errors?.some((e) => e.startsWith(`${path}[${i}]`))
          return (
            <li key={key} className={`eotm-item${isOpen ? ' is-open' : ''}${hasError ? ' has-error' : ''}`}>
              <div className="eotm-item-head">
                <button type="button" className="eotm-item-title" aria-expanded={isOpen} onClick={() => toggle(key)}>
                  {itemTitle(item, i)}
                </button>
                <div className="eotm-row">
                  <button type="button" className="eotm-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="eotm-icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="eotm-icon" onClick={() => duplicate(i)} aria-label="Duplicate">⧉</button>
                  <button type="button" className="eotm-icon" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </div>
              </div>
              {isOpen && (
                <div className="eotm-item-body">
                  <FieldList fields={fieldsFor(item)} value={item} onChange={(v) => update(i, v)} ctx={ctx} path={`${path}[${i}]`} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="eotm-palette">
        {add.map((a) => <button key={a.key} type="button" className="eotm-btn is-quiet" onClick={() => insert(a.make)}>+ {a.label}</button>)}
      </div>
    </fieldset>
  )
}

// "Place after" another entry, by title. The site reports its order (with
// entries the console does not hold, such as built-in ones) through
// EOTM.setOrder; without it, the type's other documents are offered.
function Placement({ id, field, value, onChange, ctx }) {
  const { bridge, store, docId, docType } = ctx
  const [entries, setEntries] = useState(() => bridge?.order(docType))
  useEffect(() => {
    if (!bridge) return undefined
    return bridge.subscribe((c) => { if (c.type === docType && c.order) setEntries(bridge.order(docType)) })
  }, [bridge, docType])
  useEffect(() => {
    if (entries) return
    store.list(docType).then((docs) => setEntries(docs.map((d) => ({ key: d.slug, title: titleOf(ctx.schema, d), docId: d.id })))).catch(() => {})
  }, [entries, store, docType, ctx.schema])
  const others = (entries ?? []).filter((e) => e.docId !== docId)
  const known = !value || value === '^' || others.some((e) => e.key === value)
  return (
    <select id={id} className="eotm-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">At the end</option>
      <option value="^">At the start</option>
      {!known && <option value={value}>After “{value}” (no longer listed)</option>}
      {others.map((e) => <option key={e.key} value={e.key}>After “{e.title}”</option>)}
    </select>
  )
}
