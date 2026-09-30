import React, { useEffect, useId, useState } from 'react'
import { newBlock, newListItem, duplicateData, titleOf, suggestionsFor } from '../schema/schema.js'
import RichText from './RichText.jsx'
import Layout from './Layout.jsx'
import Sketch from './Sketch.jsx'
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
    case 'text': {
      // `suggest`: offer the headings of that kind of section on this page, and
      // say at once when the typed name matches none of them.
      const names = field.suggest ? suggestionsFor(ctx.schema, ctx.docData, field.suggest) : null
      const unmatched = names && value?.trim() && !names.some((n) => n.toLowerCase() === value.trim().toLowerCase())
      return wrap(<>
        <input id={id} className="eotm-input" value={value ?? ''} maxLength={field.maxLength} list={names ? `${id}-list` : undefined}
          onChange={(e) => onChange(e.target.value)} />
        {names && <datalist id={`${id}-list`}>{names.map((n) => <option key={n} value={n} />)}</datalist>}
        {unmatched && !error && <p className="eotm-error" role="status">No {ctx.schema.blocks[field.suggest.block]?.label ?? 'section'} called “{value.trim()}” on this page yet.</p>}
      </>)
    }
    case 'url':
      return wrap(<input id={id} className="eotm-input" type="url" inputMode="url" value={value ?? ''} placeholder="https://… or /page" onChange={(e) => onChange(e.target.value)} />)
    case 'textarea':
      return wrap(<textarea id={id} className="eotm-input" rows={4} value={value ?? ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />)
    case 'placement':
      return wrap(<Placement id={id} field={field} value={value} onChange={onChange} ctx={ctx} />)
    case 'color':
      return wrap(<Color id={id} value={value} onChange={onChange} />)
    case 'layout':
      return wrap(<Layout id={id} value={value} onChange={onChange} ctx={ctx} />, { block: true })
    case 'richtext':
      return wrap(<RichText value={value} onChange={onChange} schema={ctx.schema} upload={ctx.upload} label={label} />, { block: true })
    case 'number':
      // `slider: true`: a range between min and max with the value beside it and
      // a Reset that clears it (blank keeps the site's own; `unit` labels it).
      if (field.slider) return wrap(
        <div className="eotm-slider">
          <input id={id} type="range" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1}
            value={value ?? field.sliderDefault ?? field.min ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
          <output htmlFor={id}>{value == null ? 'site’s own' : `${value}${field.unit ?? ''}`}</output>
          {value != null && <button type="button" className="eotm-btn is-quiet" onClick={() => onChange(null)}>Reset</button>}
        </div>)
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
      return wrap(<ImageField id={id} field={field} value={value} onChange={onChange} ctx={ctx} />, { block: true })
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
          add={field.of.map((name) => ({ key: name, label: ctx.schema.blocks[name].label, def: ctx.schema.blocks[name], make: () => newBlock(ctx.schema, name) }))} />)
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

async function uploadPhoto(file, ctx, limit) {
  const { blob, width, height } = await prepareImage(file, limit)
  const src = await ctx.upload(blob)
  return { src, width, height, alt: '' }
}

// Turn, flip and fade a photo. Stored on the image ({ rotate, flip, opacity })
// and applied by the site as CSS, so the file itself is never re-encoded.
function PhotoLook({ value, onChange }) {
  const rotate = value.rotate ?? 0
  const opacity = value.opacity ?? 100
  const turn = (d) => onChange({ ...value, rotate: (rotate + d + 360) % 360 })
  return (
    <div className="eotm-photo-look">
      <div className="eotm-row">
        <button type="button" className="eotm-icon" aria-label="Rotate left" title="Rotate left" onClick={() => turn(-90)}>↺</button>
        <button type="button" className="eotm-icon" aria-label="Rotate right" title="Rotate right" onClick={() => turn(90)}>↻</button>
        <button type="button" className={`eotm-btn is-quiet${value.flip ? ' is-on' : ''}`} aria-pressed={!!value.flip}
          onClick={() => onChange({ ...value, flip: !value.flip })}>Flip</button>
        {(rotate || value.flip || opacity !== 100) ? (
          <button type="button" className="eotm-btn is-quiet" onClick={() => { const { rotate: r, flip, opacity: o, ...rest } = value; onChange(rest) }}>Reset</button>
        ) : null}
      </div>
      <label className="eotm-label eotm-range">
        Opacity <output>{opacity}%</output>
        <input type="range" min="10" max="100" step="5" value={opacity}
          onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })} />
      </label>
    </div>
  )
}

// Every photo address already used in this site's documents, for reusing one
// without uploading it again (what a media library is for).
async function sitePhotos(ctx) {
  const srcs = new Set()
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    if (typeof v.src === 'string' && v.src) srcs.add(v.src)
    Object.values(v).forEach(walk)
  }
  for (const type of Object.keys(ctx.schema.types)) {
    try { walk((await ctx.store.list(type)).map((d) => d.data)) } catch { /* a type that fails to list is skipped */ }
  }
  walk(ctx.docData)
  return [...srcs]
}

function ImageField({ id, field, value, onChange, ctx }) {
  const [busy, setBusy] = useState(false)
  const [library, setLibrary] = useState(null) // null closed, [] loading or empty
  // The file just uploaded, kept so "Sharper" can send it again at full size
  // without the owner picking it a second time. Gone on reload, by design.
  const [last, setLast] = useState(null) // { file, src, limit }
  const base = field?.wide ? 'wide' : 'standard'
  const pick = async (file, limit = base) => {
    if (!file) return
    setBusy(true)
    try {
      const photo = await uploadPhoto(file, ctx, limit)
      // Keep what the owner set on the photo (alt text, turn, fade) when only the file changes.
      onChange(limit === 'full' && value ? { ...value, ...photo, alt: value.alt ?? '' } : photo)
      setLast({ file, src: photo.src, limit })
      if (limit === 'full') ctx.notify('Uploaded at full quality. The file is larger, so the page loads a little slower.')
    } catch (e) { ctx.notify(e.message) } finally { setBusy(false) }
  }
  const openLibrary = async () => {
    if (library) return setLibrary(null)
    setLibrary([])
    setLibrary(await sitePhotos(ctx))
  }
  return (
    <div className="eotm-image">
      {value?.src && <img src={value.src} alt="" style={{
        transform: `rotate(${value.rotate ?? 0}deg)${value.flip ? ' scaleX(-1)' : ''}`, opacity: (value.opacity ?? 100) / 100 }} />}
      <div className="eotm-row">
        <label className="eotm-btn">
          {busy ? 'Uploading…' : value?.src ? 'Replace photo' : 'Add photo'}
          <input id={id} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
        </label>
        <button type="button" className="eotm-btn is-quiet" aria-expanded={!!library} onClick={openLibrary}>Site photos</button>
        {value?.src && <button type="button" className="eotm-btn is-quiet" onClick={() => onChange(null)}>Remove</button>}
        {last && last.src === value?.src && last.limit !== 'full' && (
          <button type="button" className="eotm-btn is-quiet" disabled={busy} onClick={() => pick(last.file, 'full')}
            title="Uploads this photo again at up to 3200 px. Use it when the preview looks soft.">Sharper (larger file)</button>
        )}
      </div>
      {library && (
        <div className="eotm-library">
          {library.length ? library.map((src) => (
            <button key={src} type="button" className={`eotm-thumb${value?.src === src ? ' is-on' : ''}`} aria-label="Use this photo"
              onClick={() => { onChange({ ...(value ?? {}), src, alt: value?.alt ?? '' }); setLibrary(null) }}>
              <img src={src} alt="" loading="lazy" />
            </button>)) : <p className="eotm-help">No photos on the site yet.</p>}
          <input className="eotm-input" placeholder="Or paste a photo address: https://… or /uploads/…"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const src = e.currentTarget.value.trim()
              if (/^(https?:\/\/|\/(?!\/))/i.test(src)) { onChange({ ...(value ?? {}), src, alt: value?.alt ?? '' }); setLibrary(null) }
              else ctx.notify('A photo address starts with https:// or /')
            }} />
        </div>
      )}
      {value?.src && <input className="eotm-input" placeholder="Describe the photo for screen readers" value={value.alt ?? ''}
        onChange={(e) => onChange({ ...value, alt: e.target.value })} />}
      {value?.src && <PhotoLook value={value} onChange={onChange} />}
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
        const photo = await uploadPhoto(file, ctx, field.wide ? 'wide' : 'standard')
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

// Whether a row holds the picked row somewhere inside it (a Glossary term
// inside its section), so the rows around it open on the way down.
const holds = (item, id) => Boolean(id) && JSON.stringify(item).includes(`"_id":"${id}"`)

// Page sections and list rows: add from a palette, duplicate, reorder, remove.
function Repeater({ label, help, items, onChange, ctx, path, itemTitle, fieldsFor, add, sections }) {
  // A section picked on the page (click-to-edit, App.jsx PageTargets) opens
  // here already expanded and scrolled into view.
  const focused = () => items.find((x) => x._id === ctx.focus || holds(x, ctx.focus))
  const [open, setOpen] = useState(() => new Set(focused() ? [focused()._id] : []))
  useEffect(() => {
    const hit = focused()
    if (!hit) return
    setOpen((s) => new Set(s).add(hit._id))
    // Scroll only at the row itself; a row holding it opens and the list
    // inside it scrolls.
    if (hit._id === ctx.focus) requestAnimationFrame(() => document.querySelector(`.eotm-root [data-eotm-item="${ctx.focus}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }))
  }, [ctx.focus, ctx.focusAt]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const [picked, setPicked] = useState('')
  const insert = (make) => {
    const item = make()
    onChange([...items, item])
    setOpen((s) => new Set(s).add(item._id))
    // The page draws the new section from the draft; bring it into view and
    // outline it for a moment, so the owner sees what they added and where.
    if (sections) {
      setTimeout(() => {
        const el = [...document.querySelectorAll(`[data-eotm-item="${item._id}"]`)].find((n) => !n.closest('.eotm-root'))
        if (!el) return
        el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        el.classList.add('eotm-just-added')
        setTimeout(() => el.classList.remove('eotm-just-added'), 1600)
      }, 120)
    }
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
            <li key={key} data-eotm-item={key} className={`eotm-item${isOpen ? ' is-open' : ''}${hasError ? ' has-error' : ''}`}>
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
      {add.length > 6 && !matchMedia('(min-width: 1024px)').matches ? (
        // More than six kinds on a phone: one dropdown instead of a wall of
        // buttons; the chosen kind shows its sketch before it is added.
        <div className="eotm-palette-pick">
          <select className="eotm-input" aria-label={`Add to ${label}`} value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">Add a section…</option>
            {add.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          {picked && (() => {
            const a = add.find((x) => x.key === picked)
            return (
              <button type="button" className="eotm-add" onClick={() => { insert(a.make); setPicked('') }}>
                {a.def && <Sketch def={a.def} />}
                <span>+ Add {a.label}</span>
              </button>
            )
          })()}
        </div>
      ) : sections ? (
        <div className="eotm-palette is-sketches">
          {add.map((a) => (
            <button key={a.key} type="button" className="eotm-add" onClick={() => insert(a.make)}>
              {a.def && <Sketch def={a.def} />}
              <span>+ {a.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="eotm-palette">
          {add.map((a) => <button key={a.key} type="button" className="eotm-btn is-quiet" onClick={() => insert(a.make)}>+ {a.label}</button>)}
        </div>
      )}
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

// A colour as #rrggbb, or blank for "keep the site's own". A native picker has
// no blank state, so the text box and Clear carry it.
function Color({ id, value, onChange }) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  return (
    <div className="eotm-row">
      <input type="color" className="eotm-swatch" aria-label="Pick a colour" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input id={id} className="eotm-input" value={text} placeholder="Site default" spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase())
          else if (!e.target.value) onChange('')
        }} />
      {value && <button type="button" className="eotm-btn is-quiet" onClick={() => onChange('')}>Clear</button>}
    </div>
  )
}
