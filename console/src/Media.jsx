import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepareImage } from './images.js'
import { nameFromFile } from '../core/media.js'
import { RemoveButton } from './Fields.jsx'

// Media: the site's library of uploaded photos and clips (core/media.js), in
// folders, so a mass upload has somewhere to land and anything uploaded once
// can be used again from any photo field ("Site photos").
//
//   Upload: pick or drop many files at once. Each photo is shrunk in the
//   browser first (images.js), as every upload is, so nothing large reaches
//   storage; a clip goes up as recorded (200 MB at most). Three at a time, each
//   with its own progress line, so one failure does not stop the rest.
//   Folders: made, renamed (everything in them moves along) and deleted once empty.
//   A file: renamed, moved to a folder, its address copied, or deleted. Its
//   address never changes, so a page using it keeps it; deleting one a page
//   still uses is refused, naming the page.

const AT_ONCE = 3
const VIDEO = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO = 200 * 1024 * 1024

export const size = (bytes) => (bytes == null ? '' : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const leaf = (p) => p.slice(p.lastIndexOf('/') + 1)

export default function Media({ store, notify }) {
  const [lib, setLib] = useState(null) // { items, folders, bytes }
  const [here, setHere] = useState('') // the folder shown
  const [queue, setQueue] = useState([]) // [{ id, name, state, error }]
  const [picked, setPicked] = useState(() => new Set())
  const [over, setOver] = useState(false)
  const [naming, setNaming] = useState(null) // { from: null (new) or a folder path, value }
  const input = useRef(null)

  const load = useCallback(async () => {
    try { setLib(await store.media.list()) } catch (e) { notify(e.message); setLib((l) => l ?? { items: [], folders: [], bytes: 0 }) }
  }, [store, notify])
  useEffect(() => { load() }, [load])

  const run = async (fn) => { try { await fn() } catch (e) { notify(e.message) } finally { load() } }

  // Each file through prepareImage (photos) or as it is (clips), then into the
  // folder shown, a few at a time.
  const upload = async (files) => {
    const list = [...files].map((file, i) => ({ id: `${Date.now()}:${i}`, file, name: file.name, state: 'waiting' }))
    if (!list.length) return
    const folder = here
    setQueue((q) => [...q.filter((x) => x.state !== 'done'), ...list.map(({ file, ...rest }) => rest)])
    const mark = (id, patch) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    const one = async ({ id, file }) => {
      try {
        const meta = { name: nameFromFile(file.name), folder }
        if (VIDEO.includes(file.type)) {
          if (file.size > MAX_VIDEO) throw new Error('Videos are 200 MB at most.')
          mark(id, { state: 'uploading' })
          await store.upload(file, meta)
        } else {
          mark(id, { state: 'shrinking' })
          const { blob, width, height } = await prepareImage(file)
          mark(id, { state: 'uploading', size: blob.size, from: file.size })
          await store.upload(blob, { ...meta, width, height })
        }
        mark(id, { state: 'done' })
      } catch (e) {
        mark(id, { state: 'failed', error: /decode|source image/i.test(e.message) ? 'This browser cannot open that kind of photo. Save it as JPEG first.' : e.message })
      }
    }
    const todo = [...list]
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, todo.length) }, async () => {
      while (todo.length) await one(todo.shift())
    }))
    load()
  }

  const items = useMemo(() => (lib?.items ?? []).filter((i) => i.folder === here), [lib, here])
  const subfolders = useMemo(() => (lib?.folders ?? []).filter((f) => parentOf(f) === here), [lib, here])
  const counts = useMemo(() => {
    const c = {}
    for (const i of lib?.items ?? []) for (const f of lib.folders) if (i.folder === f || i.folder.startsWith(`${f}/`)) c[f] = (c[f] ?? 0) + 1
    return c
  }, [lib])
  if (!lib) return <p className="eotm-empty">Loading…</p>

  const saveName = () => {
    const { from, value } = naming
    const name = value.trim()
    setNaming(null)
    if (!name) return
    if (name.includes('/')) return notify('A folder name cannot hold "/".')
    if (from == null) run(() => store.media.addFolder(here ? `${here}/${name}` : name))
    else if (name !== leaf(from)) run(() => store.media.renameFolder(from, parentOf(from) ? `${parentOf(from)}/${name}` : name))
  }
  const move = (ids, folder) => run(async () => { for (const id of ids) await store.media.update(id, { folder }); setPicked(new Set()) })
  const removeMany = (ids) => run(async () => {
    const kept = []
    for (const id of ids) {
      try { await store.media.remove(id) } catch (e) { kept.push(e.message) }
    }
    setPicked(new Set())
    if (kept.length) notify(kept.length === 1 ? kept[0] : `${kept.length} files are still used on pages and were kept. ${kept[0]}`)
  })
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const crumbs = here ? here.split('/').map((_, i, all) => all.slice(0, i + 1).join('/')) : []
  const busy = queue.some((q) => !['done', 'failed'].includes(q.state))

  return (
    <div className={`eotm-media${over ? ' is-over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}>
      <p className="eotm-help">Everything uploaded to the site, in folders. Drop photos here or press Upload; each photo is made web-sized before it is stored. Renaming or moving a file never breaks a page using it.</p>
      <div className="eotm-row">
        <button type="button" className="eotm-btn is-primary" onClick={() => input.current.click()}>{busy ? 'Uploading…' : 'Upload'}</button>
        <input ref={input} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" hidden
          onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
        <button type="button" className="eotm-btn" onClick={() => setNaming({ from: null, value: '' })}>New folder</button>
        <span className="eotm-class-count">{lib.items.length} files · {size(lib.bytes) || '0 KB'}</span>
      </div>

      <nav className="eotm-media-crumbs" aria-label="Folder">
        <button type="button" className={here ? '' : 'is-on'} onClick={() => setHere('')}>All media</button>
        {crumbs.map((c) => <React.Fragment key={c}><span aria-hidden="true">/</span><button type="button" className={c === here ? 'is-on' : ''} onClick={() => setHere(c)}>{leaf(c)}</button></React.Fragment>)}
      </nav>

      {naming && (
        <form className="eotm-row" onSubmit={(e) => { e.preventDefault(); saveName() }}>
          <input className="eotm-input" autoFocus aria-label={naming.from == null ? 'New folder name' : `New name for ${leaf(naming.from)}`} maxLength={60}
            placeholder={naming.from == null ? 'Folder name' : leaf(naming.from)} value={naming.value}
            onChange={(e) => setNaming({ ...naming, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }} />
          <button type="submit" className="eotm-btn is-primary">{naming.from == null ? 'Make folder' : 'Rename'}</button>
          <button type="button" className="eotm-btn is-quiet" onClick={() => setNaming(null)}>Cancel</button>
        </form>
      )}

      {queue.length > 0 && (
        <ul className="eotm-media-queue">
          {queue.map((q) => (
            <li key={q.id} className={`is-${q.state}`}>
              <span>{q.name}</span>
              <span>{q.state === 'failed' ? q.error : q.state === 'done' ? `Done${q.size ? `, ${size(q.from)} → ${size(q.size)}` : ''}` : q.state === 'shrinking' ? 'Making it web-sized…' : q.state === 'uploading' ? 'Uploading…' : 'Waiting'}</span>
            </li>
          ))}
          {!busy && <li><button type="button" className="eotm-btn is-quiet" onClick={() => setQueue([])}>Clear</button></li>}
        </ul>
      )}

      {subfolders.length > 0 && (
        <ul className="eotm-media-folders">
          {subfolders.map((f) => (
            <li key={f}>
              <button type="button" className="eotm-media-folder" onClick={() => setHere(f)}>
                <span aria-hidden="true">📁</span> {leaf(f)} <span className="eotm-class-count">{counts[f] ?? 0}</span>
              </button>
              <button type="button" className="eotm-icon" aria-label={`Rename ${leaf(f)}`} title="Rename" onClick={() => setNaming({ from: f, value: leaf(f) })}>✎</button>
              {!counts[f] && <RemoveButton label={`Delete folder ${leaf(f)}`} onConfirm={() => run(() => store.media.removeFolder(f))} />}
            </li>
          ))}
        </ul>
      )}

      {picked.size > 0 && (
        <div className="eotm-row eotm-media-bulk">
          <strong>{picked.size} selected</strong>
          <MoveTo folders={lib.folders} here={here} onMove={(f) => move([...picked], f)} />
          <RemoveButton label="Delete selected" text="Delete" onConfirm={() => removeMany([...picked])} />
          <button type="button" className="eotm-btn is-quiet" onClick={() => setPicked(new Set())}>Clear selection</button>
        </div>
      )}

      {items.length ? (
        <ul className="eotm-media-grid">
          {items.map((i) => (
            <MediaItem key={i.id} item={i} folders={lib.folders} picked={picked.has(i.id)} onPick={() => toggle(i.id)}
              onRename={(name) => run(() => store.media.update(i.id, { name }))} onMove={(f) => move([i.id], f)}
              onRemove={() => removeMany([i.id])} notify={notify} />
          ))}
        </ul>
      ) : <p className="eotm-empty">{here ? 'Nothing in this folder yet. Drop photos here to add them.' : 'Nothing here yet. Drop photos here to add them.'}</p>}
    </div>
  )
}

function MoveTo({ folders, here, onMove }) {
  return (
    <select className="eotm-input eotm-media-move" value="" aria-label="Move to folder" onChange={(e) => { if (e.target.value !== '') onMove(e.target.value === '/' ? '' : e.target.value) }}>
      <option value="">Move to…</option>
      {here && <option value="/">All media (top)</option>}
      {folders.filter((f) => f !== here).map((f) => <option key={f} value={f}>{f.replaceAll('/', ' / ')}</option>)}
    </select>
  )
}

function MediaItem({ item, folders, picked, onPick, onRename, onMove, onRemove, notify }) {
  const [name, setName] = useState(item.name)
  useEffect(() => setName(item.name), [item.name])
  const video = item.contentType.startsWith('video/')
  const save = () => { const n = name.trim(); if (n && n !== item.name) onRename(n); else setName(item.name) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(item.src); notify('Address copied.') } catch { notify(item.src) }
  }
  return (
    <li className={`eotm-media-item${picked ? ' is-picked' : ''}`}>
      <button type="button" className="eotm-media-thumb" aria-pressed={picked} aria-label={`Select ${item.name}`} onClick={onPick}>
        {video ? <video src={item.src} muted preload="metadata" /> : <img src={item.src} alt="" loading="lazy" />}
        <span className="eotm-media-check" aria-hidden="true">{picked ? '✓' : ''}</span>
      </button>
      <input className="eotm-input eotm-media-name" aria-label="Name" value={name} maxLength={120}
        onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(item.name); e.currentTarget.blur() } }} />
      <span className="eotm-class-count">{[item.width && `${item.width}×${item.height}`, size(item.bytes)].filter(Boolean).join(' · ')}</span>
      <div className="eotm-row">
        <MoveTo folders={folders} here={item.folder} onMove={onMove} />
        <button type="button" className="eotm-icon" aria-label="Copy address" title="Copy address" onClick={copy}>⧉</button>
        <RemoveButton label={`Delete ${item.name}`} onConfirm={onRemove} />
      </div>
    </li>
  )
}
