import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { titleOf } from '../schema/schema.js'
import { uploadPhoto } from './Fields.jsx'
import { pairedFields, holdsPairs, getAt, updateAt, pairsOf, setSlot, removeSlot, removePair, patchPhoto, tagPhoto, incomplete } from './pairs.js'

// Images (schema `images`): every daylight / blacklight pair on the site in one
// place, whichever document holds it: a Listing's photos, a page's hero, the
// site's own Image pairs. A row is one pair; an empty side takes an upload, so
// a Listing with only Light photos gets its Dark ones here. Each change is
// written to the document holding the pair (pairs.js keeps the other pairs
// together) and reaches the page as a draft, like any edit. Uploads are
// compressed first (images.js, prepareImage).

const STATUS_TEXT = { draft: 'Draft', published: 'Live', changed: 'Live, with unpublished changes' }

export default function Images({ schema, store, bridge, notify, open }) {
  const conf = schema.images
  const own = conf.type
  const types = useMemo(() => [own, ...Object.keys(schema.types).filter((t) => t !== own && holdsPairs(schema, t))], [schema, own])
  const [docs, setDocs] = useState(null)
  const [missingOnly, setMissingOnly] = useState(false)
  const [busy, setBusy] = useState(null) // `${docId}:${row}:${ix}` while uploading

  const load = useCallback(async () => {
    const lists = await Promise.all(types.map((t) => store.list(t).catch(() => [])))
    setDocs(lists.flat())
  }, [types, store])
  useEffect(() => { load().catch((e) => notify(e.message)) }, [load, notify])

  // A change to one field of one document: read it fresh, change it, save it
  // against the version read, and show the page the draft.
  const write = async (doc, path, fn) => {
    try {
      const cur = await store.get(doc.id)
      const data = updateAt(cur.data, path, fn)
      const saved = await store.save(doc.id, { baseVersion: cur.version, data })
      bridge.push(saved)
      setDocs((all) => all.map((d) => (d.id === saved.id ? saved : d)))
      return true
    } catch (e) {
      notify(e.status === 409 ? 'That was changed somewhere else just now. Showing the latest; try again.' : e.message)
      load()
      return false
    }
  }

  const upload = async (doc, loc, k, ix, file) => {
    if (!file) return
    setBusy(`${doc.id}:${loc.key}:${k}:${ix}`)
    try {
      const photo = await uploadPhoto(file, { upload: (b) => store.upload(b) }, loc.field.wide ? 'wide' : 'standard')
      await write(doc, loc.path, (photos) => setSlot(photos, loc.field.indexes, k, ix, photo, { maxItems: loc.field.maxItems }))
    } catch (e) { notify(e.message) } finally { setBusy(null) }
  }

  const addPair = async () => {
    try {
      const doc = await store.create({ type: own, data: { title: 'New pair' } })
      setDocs((all) => [doc, ...(all ?? [])])
    } catch (e) { notify(e.message) }
  }

  if (docs === null) return <p className="eotm-empty">Loading…</p>

  // Documents, each with its paired fields and their rows.
  const groups = docs.map((doc) => {
    const fields = pairedFields(schema, doc.type, doc.data).map((loc, i) => ({
      ...loc, key: i, rows: pairsOf(getAt(doc.data, loc.path), loc.field.indexes),
    }))
    return { doc, fields, missing: fields.reduce((n, f) => n + incomplete(f.rows), 0) }
  }).filter((g) => g.doc.type === own || g.fields.some((f) => f.rows.length))
  const total = groups.reduce((n, g) => n + g.fields.reduce((m, f) => m + f.rows.length, 0), 0)
  const missing = groups.reduce((n, g) => n + g.missing, 0)
  const shown = missingOnly ? groups.filter((g) => g.missing) : groups

  return (
    <div className="eotm-images">
      {conf.help && <p className="eotm-help">{conf.help}</p>}
      <div className="eotm-row">
        <button type="button" className="eotm-btn is-primary" onClick={addPair}>New {schema.types[own].label.toLowerCase()}</button>
        <label className="eotm-check">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
          <span>Only pairs missing a photo ({missing})</span>
        </label>
      </div>
      <p className="eotm-help">{total} pair{total === 1 ? '' : 's'} on the site. Photos are made smaller before they upload.</p>
      {shown.length === 0 && <p className="eotm-empty">{missingOnly ? 'Every pair has both photos.' : 'No photo pairs yet.'}</p>}
      {shown.map(({ doc, fields }) => (
        <section key={doc.id} className="eotm-pair-doc">
          <div className="eotm-doc">
            <button type="button" className="eotm-doc-open" onClick={() => open(doc)} title="Open it in the editor">
              <strong>{titleOf(schema, doc)}</strong>
              <span className="eotm-chip">{schema.types[doc.type]?.label}</span>
              <span className={`eotm-chip is-${doc.status}`}>{STATUS_TEXT[doc.status]}</span>
            </button>
          </div>
          {doc.type === own && (
            <input className="eotm-input" aria-label="Name of this pair" defaultValue={doc.data?.title ?? ''} maxLength={120}
              onBlur={(e) => { const title = e.target.value.trim(); if (title && title !== doc.data?.title) write(doc, [], (d) => ({ ...d, title })) }} />
          )}
          {fields.map((loc) => (
            <div key={loc.key} className="eotm-pair-field">
              {(loc.where || fields.length > 1) && <p className="eotm-label">{loc.where ?? loc.field.label}</p>}
              <ul className="eotm-pairs">
                {loc.rows.map((row, k) => (row.untagged
                  ? <Untagged key={`u${row.untagged.at}`} photo={row.untagged.photo} indexes={loc.field.indexes}
                      onTag={(ix) => write(doc, loc.path, (p) => tagPhoto(p, loc.field.indexes, row.untagged.at, ix))}
                      onRemove={() => write(doc, loc.path, (p) => (p ?? []).filter((_, i) => i !== row.untagged.at))} />
                  : (
                    <li key={k} className="eotm-pair">
                      {loc.field.indexes.map((ix) => (
                        <Slot key={`${ix}:${row.slots[ix]?.photo.src ?? ''}`} ix={ix} slot={row.slots[ix]} busy={busy === `${doc.id}:${loc.key}:${k}:${ix}`}
                          onFile={(f) => upload(doc, loc, k, ix, f)}
                          onAlt={(alt) => write(doc, loc.path, (p) => patchPhoto(p, row.slots[ix].at, { alt }))}
                          onRemove={() => write(doc, loc.path, (p) => removeSlot(p, loc.field.indexes, k, ix))} />
                      ))}
                      <button type="button" className="eotm-icon" aria-label="Remove this pair" title="Remove both photos"
                        onClick={() => write(doc, loc.path, (p) => removePair(p, loc.field.indexes, k))}>✕</button>
                    </li>
                  )))}
                {/* Room for another pair, once every pair here is whole: a photo
                    added while one is missing a side would fill that side. */}
                {!incomplete(loc.rows) && (!loc.field.maxItems || (getAt(doc.data, loc.path)?.length ?? 0) < loc.field.maxItems) && (
                  <li className="eotm-pair is-new">
                    {loc.field.indexes.map((ix) => (
                      <Slot key={ix} ix={ix} slot={null} busy={busy === `${doc.id}:${loc.key}:${loc.rows.length}:${ix}`}
                        label={loc.rows.length ? `Another pair: ${ix}` : undefined}
                        onFile={(f) => upload(doc, loc, loc.rows.length, ix, f)} />
                    ))}
                  </li>
                )}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function Slot({ ix, slot, busy, label, onFile, onAlt, onRemove }) {
  const picker = (text) => (
    <label className="eotm-btn">
      {busy ? 'Uploading…' : text}
      <input type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = '' }} />
    </label>
  )
  if (!slot) return (
    <div className="eotm-slot is-empty">
      <span className="eotm-chip">{ix}</span>
      <p className="eotm-help">{label ?? `No ${ix} photo`}</p>
      {picker(`Upload ${ix}`)}
    </div>
  )
  const { photo } = slot
  return (
    <div className="eotm-slot">
      <span className="eotm-chip">{ix}</span>
      <img src={photo.src} alt="" loading="lazy" />
      <input className="eotm-input" placeholder="Describe the photo" defaultValue={photo.alt ?? ''}
        onBlur={(e) => { if (e.target.value !== (photo.alt ?? '')) onAlt(e.target.value) }} />
      <div className="eotm-row">
        {picker('Replace')}
        <button type="button" className="eotm-btn is-quiet" onClick={onRemove}>Remove</button>
      </div>
    </div>
  )
}

function Untagged({ photo, indexes, onTag, onRemove }) {
  return (
    <li className="eotm-pair is-untagged">
      <div className="eotm-slot">
        <img src={photo.src} alt="" loading="lazy" />
        <p className="eotm-help">Not marked {indexes.join(' or ')} yet. Which is it?</p>
        <div className="eotm-row">
          {indexes.map((ix) => <button key={ix} type="button" className="eotm-btn" onClick={() => onTag(ix)}>{ix}</button>)}
          <button type="button" className="eotm-btn is-quiet" onClick={onRemove}>Remove</button>
        </div>
      </div>
    </li>
  )
}
