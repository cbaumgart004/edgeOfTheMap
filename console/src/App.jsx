import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkDocument, warnDocument, titleOf, setItemField } from '../schema/schema.js'
import { previewPathFor } from './bridge.js'
import { FieldList } from './Fields.jsx'
import Targets from './Targets.jsx'
import CustomTypes from './CustomTypes.jsx'
import { createPortal } from 'react-dom'

// The nth image of a rich text field set to `pct`% wide; its height follows.
function imageWidthIn(html, index, pct) {
  const box = document.createElement('div')
  box.innerHTML = html ?? ''
  const img = box.querySelectorAll('img')[index]
  if (!img) return html
  img.setAttribute('width', `${pct}%`)
  img.removeAttribute('height')
  return box.innerHTML
}

const SAVE_DELAY = 800 // ms after the last change (platform plan §3.4)
const STATUS_TEXT = { draft: 'Draft', published: 'Live', changed: 'Live, with unpublished changes' }

// ---------------------------------------------------------------- brand

function useBrandMode(brand) {
  const read = useCallback(() => {
    const src = brand.modeSource
    if (src) {
      const el = document.querySelector(src.selector)
      const v = el?.getAttribute(src.attribute)
      if (v && src.map?.[v]) return src.map[v]
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }, [brand])
  const [mode, setMode] = useState(read)
  useEffect(() => {
    const update = () => setMode(read())
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    const obs = new MutationObserver(update)
    if (brand.modeSource) obs.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: [brand.modeSource.attribute] })
    return () => { mq.removeEventListener('change', update); obs.disconnect() }
  }, [brand, read])
  return mode
}

function brandStyle(brand, mode) {
  const t = brand.modes?.[mode] ?? brand.modes?.light ?? {}
  return {
    '--eotm-bg': t.bg, '--eotm-surface': t.surface, '--eotm-ink': t.ink, '--eotm-muted': t.muted,
    '--eotm-line': t.line, '--eotm-accent': t.accent, '--eotm-accent-ink': t.accentInk,
    '--eotm-font': brand.fonts?.body, '--eotm-heading': brand.fonts?.heading, '--eotm-radius': brand.radius,
  }
}

// ---------------------------------------------------------------- sheet

// Phones: a bottom sheet with three heights. `bar` leaves the page usable with
// a one-line banner; `half` shows form and page together; `full` is for long
// forms. Desktop: the same panel docked right. Peek fades the panel so the
// owner can see the page under it without collapsing.
export function useWide() {
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

function Sheet({ size, setSize, peek, setPeek, header, children, style, wide }) {
  const drag = useRef(null)
  const onDown = (e) => {
    if (wide) return
    drag.current = { y: e.clientY, size }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onUp = (e) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    const order = ['bar', 'half', 'full']
    const i = order.indexOf(drag.current.size)
    drag.current = null
    if (Math.abs(dy) < 8) return setSize(size === 'bar' ? 'half' : size)
    setSize(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1) * (Math.abs(dy) > 220 ? 2 : 1)))])
  }
  return (
    <section className={`eotm-sheet is-${size}${wide ? ' is-wide' : ''}${peek ? ' is-peek' : ''}`} style={style} aria-label="Site editor">
      <div className="eotm-grip" onPointerDown={onDown} onPointerUp={onUp} aria-hidden="true"><span /></div>
      {header}
      {size !== 'bar' && <div className="eotm-scroll">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------- app

export default function App({ schema: shipped, store, bridge, auth, dashboard, onClose }) {
  // The schema the owner edits with; saving their own types (CustomTypes.jsx)
  // replaces it, and the page hears of it through the bridge.
  const [schema, setSchema] = useState(shipped)
  useEffect(() => { bridge.setSchema?.(schema) }, [bridge, schema])
  const mode = useBrandMode(schema.brand)
  const wide = useWide()
  const [size, setSize] = useState(wide ? 'full' : 'half')
  const [peek, setPeek] = useState(false)
  const [overlay, setOverlay] = useState(null) // where on-page handles render, outside the sheet
  const [user, setUser] = useState(undefined)
  const [view, setView] = useState({ name: 'home' })
  const [toast, setToast] = useState(null)
  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 4000) }, [])

  useEffect(() => { auth.current().then(setUser) }, [auth])
  useEffect(() => () => bridge.clear(), [bridge])

  const style = brandStyle(schema.brand, mode)
  const title = view.name === 'edit' ? view.title : view.name === 'list' ? schema.types[view.type].plural ?? schema.types[view.type].label
    : view.name === 'types' ? 'Types and names' : schema.brand.name

  const header = (
    <header className="eotm-head">
      {view.name !== 'home' && (
        <button type="button" className="eotm-icon" aria-label="Back" onClick={() => setView(view.name === 'edit' ? { name: 'list', type: view.type } : { name: 'home' })}>←</button>
      )}
      {view.name === 'home' && dashboard && (
        <a className="eotm-icon" href={dashboard} aria-label="Back to your dashboard" title="Back to your dashboard">←</a>
      )}
      {view.name === 'home' && schema.brand.logo && <img className="eotm-logo" src={schema.brand.logo} alt="" />}
      <button type="button" className="eotm-title" onClick={() => setSize(size === 'bar' ? 'half' : 'bar')} aria-expanded={size !== 'bar'}>
        <strong>{title}</strong>
        {view.saveState && <span className={`eotm-save is-${view.saveState}`}>{view.saveState === 'saving' ? 'Saving…' : view.saveState === 'saved' ? 'Saved' : view.saveState === 'error' ? 'Not saved' : ''}</span>}
      </button>
      <button type="button" className={`eotm-pill${peek ? ' is-on' : ''}`} aria-pressed={peek}
        title={peek ? 'Show the editor again' : 'Hide the editor to see the page under it'} onClick={() => setPeek((p) => !p)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
        </svg>
        {peek ? 'Edit' : 'Preview'}
      </button>
      {!wide && <button type="button" className="eotm-icon" aria-label={size === 'full' ? 'Shrink editor' : 'Expand editor'} onClick={() => setSize(size === 'full' ? 'half' : 'full')}>{size === 'full' ? '▾' : '▴'}</button>}
      <button type="button" className="eotm-icon" aria-label="Close editor" onClick={onClose}>✕</button>
    </header>
  )

  const ctxBase = { schema, store, bridge, notify, upload: (blob) => store.upload(blob), overlay, setPeek }

  // Click-to-edit (Targets.jsx): the page names a document by id or slug.
  const findDoc = async (type, key) => bridge.draft(type, key) ?? (await store.list(type)).find((d) => d.id === key || d.slug === key)
  const openTarget = async ({ type, key, item }) => {
    if (!schema.types[type]) return
    try {
      let doc = await findDoc(type, key)
      // A one-of-a-kind type (a home page, a theme) the owner has not started
      // yet: start it, filled with the schema's defaults (the page as shipped).
      if (!doc && schema.types[type].singleton) doc = await store.create({ type, data: {} })
      if (!doc) return notify('That part of the page is not in the editor yet.')
      setPeek(false)
      if (size === 'bar') setSize('half')
      setView({ name: 'edit', type, id: doc.id, title: titleOf(schema, doc), focus: item, focusAt: Date.now() })
    } catch (e) {
      notify(e.message)
    }
  }

  // Drag-to-size: the open editor takes the value at once (the page re-renders
  // from the draft); a document not open yet is opened and takes the latest
  // value when it loads.
  const editorApi = useRef(null)
  const pendingSize = useRef(null)
  const opening = useRef(null)
  const resizeTarget = async ({ type, key, item, field, value, imageIndex = null }) => {
    if (!schema.types[type]) return
    const api = editorApi.current
    if (api && (api.id === key || api.slug === key)) return api.setField(item, field, value, imageIndex)
    pendingSize.current = { key, item, field, value, imageIndex }
    if (opening.current === key) return
    opening.current = key
    await openTarget({ type, key, item })
    opening.current = null
  }

  let body
  if (user === undefined) body = <p className="eotm-empty">Loading…</p>
  else if (!user) body = <SignIn auth={auth} onSignedIn={setUser} />
  else if (view.name === 'home') body = <Home schema={schema} store={store} wide={wide} open={(type) => setView({ name: 'list', type })}
    onTypes={() => setView({ name: 'types' })} />
  else if (view.name === 'types') body = <CustomTypes schema={schema} store={store} notify={notify} onSaved={setSchema} />
  else if (view.name === 'list') body = (
    <DocList schema={schema} store={store} type={view.type} notify={notify}
      open={(doc) => setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc) })} />)
  else body = (
    <Editor key={view.id} schema={schema} store={store} bridge={bridge} id={view.id} ctxBase={ctxBase} notify={notify}
      onState={(patch) => setView((v) => ({ ...v, ...patch }))}
      onGone={() => setView({ name: 'list', type: view.type })}
      onOpen={(doc) => setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc) })}
      focus={view.focus} focusAt={view.focusAt} editorApi={editorApi} pendingSize={pendingSize} />)

  return (
    <div className="eotm-root" data-eotm-mode={mode} style={style}>
      <Sheet size={size} setSize={setSize} peek={peek} setPeek={setPeek} header={header} style={style} wide={wide}>
        {body}
        {user && <ToDeveloper schema={schema} store={store} notify={notify} refreshKey={view.saveState === 'saved' ? view.title : view.name} />}
      </Sheet>
      {toast && <div className="eotm-toast" role="status">{toast}</div>}
      <div ref={setOverlay} />
      {user && overlay && createPortal(<Targets onOpen={openTarget} onResize={resizeTarget} />, overlay)}
    </div>
  )
}

function SignIn({ auth, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  if (auth.redirect) return (
    <div className="eotm-signin">
      <p>Sign in to edit this site.</p>
      <button type="button" className="eotm-btn is-primary" onClick={() => auth.redirect()}>Sign in with Edge of the Map</button>
    </div>
  )
  return (
    <form className="eotm-signin" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      setError(null)
      try { onSignedIn(await auth.signIn(email, password)) } catch (err) { setError(err.message) } finally { setBusy(false) }
    }}>
      <p>Sign in to edit this site.</p>
      <label className="eotm-label" htmlFor="eotm-email">Email</label>
      <input id="eotm-email" className="eotm-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="eotm-label" htmlFor="eotm-password">Password</label>
      <input id="eotm-password" className="eotm-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="eotm-error" role="alert">{error}</p>}
      <button className="eotm-btn is-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

// "To the Developer", at the foot of the editor: whether the site has changes
// not yet live, and one place to push them and to ask Edge of the Map for
// anything the editor cannot do. Push to Production checks every pending
// document in the schema's release types first and publishes all of them or
// none (core/service.js, publishAll).
const DEV_ACTIONS = [
  { value: 'push', label: 'Push to Production', help: 'Checks every change, then makes them all live. Nothing goes live if a check fails.' },
  { value: 'push-request', label: 'Push and Request Changes', help: 'Makes your changes live, then sends your note to the developer.' },
  { value: 'request', label: 'Request Changes', help: 'Sends your note to the developer. Nothing goes live.' },
]

function ToDeveloper({ schema, store, notify, refreshKey }) {
  const [pending, setPending] = useState(null)
  const [action, setAction] = useState('push')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => store.pending?.().then((r) => setPending(r.pending)).catch(() => setPending(null)), [store])
  useEffect(() => { load() }, [load, refreshKey])

  const needsNote = action !== 'push'
  const count = pending?.length ?? 0
  const status = pending === null ? 'Checking…' : count ? `${count} change${count === 1 ? '' : 's'} not yet pushed to production` : 'Everything is live'
  const label = (d) => `${schema.types[d.type]?.label ?? d.type}: ${d.title}`

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (action === 'request') {
        await store.request({ body: note, page: location.pathname })
        notify('Sent to the developer. You will hear back by email.')
      } else {
        const r = await store.pushRelease({ request: needsNote ? note : '', page: location.pathname })
        setPending(r.pending)
        const n = r.published.length
        notify(r.failed.length ? `${n} pushed; ${r.failed.length} changed elsewhere meanwhile and stayed as drafts.`
          : `${n ? `Pushed ${n} change${n === 1 ? '' : 's'}. It is live now.` : 'Nothing to push; everything is live.'}${r.request ? ' Your note went to the developer.' : ''}`)
      }
      setNote('')
    } catch (err) {
      // A refused push names each change and what stopped it.
      if (err.pending) setPending(err.pending)
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="eotm-dev">
      <summary>
        <strong>To the Developer</strong>
        <span className={`eotm-chip ${count ? 'is-changed' : 'is-published'}`}>{status}</span>
      </summary>
      {count > 0 && (
        <ul className="eotm-dev-list">
          {pending.map((d) => (
            <li key={d.id}>
              <span>{label(d)}</span> <span className={`eotm-chip is-${d.status}`}>{STATUS_TEXT[d.status]}</span>
              {[...d.errors, ...d.warnings].map((m) => <p key={m} className="eotm-error">{m}</p>)}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send}>
        <fieldset className="eotm-dev-actions">
          <legend className="eotm-label">What would you like to do?</legend>
          {DEV_ACTIONS.map((a) => (
            <label key={a.value} className="eotm-dev-action">
              <input type="radio" name="eotm-dev-action" value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} />
              <span><strong>{a.label}</strong><small>{a.help}</small></span>
            </label>
          ))}
        </fieldset>
        {needsNote && (
          <>
            <label className="eotm-label" htmlFor="eotm-dev-note">What would you like changed? This page’s address ({location.pathname}) goes with it.</label>
            <textarea id="eotm-dev-note" className="eotm-input" rows={5} maxLength={3800} required value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        <button className="eotm-btn is-primary" disabled={busy || (needsNote && !note.trim()) || (action === 'push' && !count)}>
          {busy ? 'Working…' : DEV_ACTIONS.find((a) => a.value === action).label}
        </button>
      </form>
    </details>
  )
}

// More than this many types on a phone become a dropdown instead of cards.
const CARD_LIMIT = 6

function Home({ schema, store, wide, open, onTypes }) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    for (const type of Object.keys(schema.types)) store.list(type).then((docs) => setCounts((c) => ({ ...c, [type]: docs.length }))).catch(() => {})
  }, [schema, store])
  // A type listed under another (menuUnder) is reached through that one's list.
  const types = Object.entries(schema.types).filter(([, t]) => !t.menuUnder)
  const under = (name) => Object.entries(schema.types).filter(([, t]) => t.menuUnder === name).map(([n]) => n)
  const countOf = (name) => [name, ...under(name)].reduce((n, t) => (counts[t] == null || n == null ? null : n + counts[t]), 0)
  const extra = (
    <>
      <li>
        <button type="button" className="eotm-card is-request" onClick={onTypes}>
          <strong>Types and names</strong>
          <span>Design your own, rename the rest</span>
        </button>
      </li>
    </>
  )
  if (!wide && types.length > CARD_LIMIT) {
    return (
      <div className="eotm-types-picker">
        <label className="eotm-label" htmlFor="eotm-type-pick">What would you like to edit?</label>
        <select id="eotm-type-pick" className="eotm-input" value="" onChange={(e) => e.target.value && open(e.target.value)}>
          <option value="">Choose…</option>
          {types.map(([name, t]) => <option key={name} value={name}>{t.plural ?? t.label}{countOf(name) != null ? ` (${countOf(name)})` : ''}</option>)}
        </select>
        <ul className="eotm-types">{extra}</ul>
      </div>
    )
  }
  return (
    <ul className="eotm-types">
      {types.map(([name, t]) => (
        <li key={name}>
          <button type="button" className="eotm-card" onClick={() => open(name)}>
            <strong>{t.plural ?? t.label}</strong>
            <span>{countOf(name) ?? '…'}</span>
          </button>
        </li>
      ))}
      {extra}
    </ul>
  )
}

function DocList({ schema, store, type, open, notify, nested = false }) {
  const t = schema.types[type]
  const children = nested ? [] : Object.entries(schema.types).filter(([, c]) => c.menuUnder === type).map(([n]) => n)
  const [docs, setDocs] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { store.list(type).then(setDocs).catch((e) => notify(e.message)) }, [store, type, notify])
  const shown = useMemo(() => (docs ?? []).filter((d) => titleOf(schema, d).toLowerCase().includes(q.toLowerCase())), [docs, q, schema])
  const create = async () => {
    try { open(await store.create({ type, data: {} })) } catch (e) { notify(e.message) }
  }
  const duplicate = async (d) => {
    try { open(await store.duplicate(d.id)) } catch (e) { notify(e.message) }
  }
  return (
    <div className="eotm-list">
      {nested && <h3 className="eotm-list-head">{t.plural ?? t.label}</h3>}
      <div className="eotm-row">
        <input className="eotm-input" type="search" placeholder={`Search ${(t.plural ?? t.label).toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {!(t.singleton && docs?.length) && <button type="button" className="eotm-btn is-primary" onClick={create}>New {t.label.toLowerCase()}</button>}
      </div>
      {docs === null ? <p className="eotm-empty">Loading…</p> : shown.length === 0 ? <p className="eotm-empty">Nothing here yet.</p> : (
        <ul>
          {shown.map((d) => (
            <li key={d.id} className="eotm-doc">
              <button type="button" className="eotm-doc-open" onClick={() => open(d)}>
                <strong>{titleOf(schema, d)}</strong>
                <span className={`eotm-chip is-${d.status}`}>{STATUS_TEXT[d.status]}</span>
              </button>
              <button type="button" className="eotm-icon" aria-label={`Duplicate ${titleOf(schema, d)}`} onClick={() => duplicate(d)}>⧉</button>
            </li>
          ))}
        </ul>
      )}
      {children.map((c) => <DocList key={c} schema={schema} store={store} type={c} open={open} notify={notify} nested />)}
    </div>
  )
}

function Editor({ schema, store, bridge, id, ctxBase, notify, onState, onGone, onOpen, focus, focusAt, editorApi, pendingSize }) {
  const [doc, setDoc] = useState(null)
  const [conflict, setConflict] = useState(null)
  const [serverErrors, setServerErrors] = useState([])
  const pending = useRef(null)
  const timer = useRef(null)
  const saving = useRef(false)
  const docRef = useRef(null)
  docRef.current = doc

  useEffect(() => {
    store.get(id).then((d) => {
      setDoc(d)
      bridge.push(d)
      const path = previewPathFor(schema.types[d.type], d)
      if (path) bridge.navigate(path)
    }).catch((e) => { notify(e.message); onGone() })
    return () => { clearTimeout(timer.current); bridge.drop(docRef.current?.type, id) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    if (saving.current || !pending.current) return
    saving.current = true
    const { data, slug, base } = pending.current
    pending.current = null
    onState({ saveState: 'saving' })
    try {
      const saved = await store.save(id, { baseVersion: base, data, slug })
      setServerErrors([])
      // Keep typing that happened during the request; only take the new version.
      setDoc((cur) => ({ ...saved, data: pending.current ? cur.data : saved.data }))
      if (pending.current) pending.current.base = saved.version
      onState({ saveState: 'saved', title: titleOf(schema, saved) })
    } catch (e) {
      if (e.status === 409) { setConflict(e.current); onState({ saveState: 'error' }) }
      else { if (e.errors) setServerErrors(e.errors); onState({ saveState: 'error' }); notify(e.message) }
    } finally {
      saving.current = false
      if (pending.current) flush()
    }
  }, [id, store, schema, onState, notify])

  // Against docRef, not the render's `doc`: a drag on the page calls this many
  // times between renders, and each call must build on the one before.
  const change = (data) => {
    const cur = docRef.current
    const next = { ...cur, data }
    docRef.current = next
    setDoc(next)
    bridge.push(next) // the page re-renders now; the save follows
    pending.current = { data, slug: undefined, base: pending.current?.base ?? cur.version }
    onState({ saveState: 'pending', title: titleOf(schema, next) })
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  // Drag-to-size on the page (App's resizeTarget) writes through here; a drag
  // that opened this document hands over its latest value once it has loaded.
  const loaded = !!doc
  useEffect(() => {
    if (!loaded) return undefined
    const setField = (item, field, value, imageIndex = null) => {
      const cur = docRef.current
      // An image inside rich text keeps its size in the HTML, as width="n%".
      const write = imageIndex == null ? value : (html) => imageWidthIn(html, imageIndex, value)
      const data = setItemField(cur.data, item, field, write)
      if (data !== cur.data) change(data)
    }
    const d = docRef.current
    editorApi.current = { id: d.id, slug: d.slug, setField }
    const p = pendingSize.current
    if (p && (p.key === d.id || p.key === d.slug)) { pendingSize.current = null; setField(p.item, p.field, p.value, p.imageIndex) }
    return () => { if (editorApi.current?.id === d.id) editorApi.current = null }
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, okMsg) => {
    clearTimeout(timer.current)
    await flush()
    try {
      const d = await fn(docRef.current)
      if (d?.deleted) { bridge.drop(docRef.current.type, id); notify(okMsg); return onGone() }
      setDoc(d); bridge.push(d); setServerErrors([]); notify(okMsg)
    } catch (e) {
      if (e.status === 409) setConflict(e.current)
      else { if (e.errors) setServerErrors(e.errors); notify(e.message) }
    }
  }

  if (!doc) return <p className="eotm-empty">Loading…</p>
  const type = schema.types[doc.type]
  const draftErrors = checkDocument(schema, doc.type, doc.data, { draft: true })
  const ctx = { ...ctxBase, docId: doc.id, docType: doc.type, docData: doc.data, focus, focusAt, errors: [...draftErrors, ...serverErrors] }

  return (
    <div className="eotm-editor">
      {conflict && (
        <div className="eotm-conflict" role="alert">
          <p>This {type.label.toLowerCase()} was changed somewhere else while you were editing.</p>
          <div className="eotm-row">
            <button type="button" className="eotm-btn" onClick={() => { setDoc(conflict); bridge.push(conflict); pending.current = null; setConflict(null) }}>Use their version</button>
            <button type="button" className="eotm-btn is-primary" onClick={() => { pending.current = { data: doc.data, base: conflict.version }; setConflict(null); flush() }}>Keep mine</button>
          </div>
        </div>
      )}
      <div className="eotm-status">
        <span className={`eotm-chip is-${doc.status}`}>{STATUS_TEXT[doc.status]}</span>
        <div className="eotm-row">
          {doc.status !== 'published' && <PublishButton warnings={warnDocument(schema, doc.type, doc.data)} onPublish={() => act((d) => store.publish(id, d.version), 'Published. It is live now.')} />}
          {doc.status !== 'draft' && <button type="button" className="eotm-btn is-quiet" onClick={() => act((d) => store.unpublish(id, d.version), 'Taken off the site.')}>Unpublish</button>}
        </div>
      </div>
      <FieldList fields={type.fields} value={doc.data} onChange={change} ctx={ctx} />
      <div className="eotm-danger">
        <button type="button" className="eotm-btn is-quiet" onClick={async () => { try { onOpen(await store.duplicate(id)) } catch (e) { notify(e.message) } }}>Duplicate</button>
        <DeleteButton label={type.label} onConfirm={() => act((d) => store.remove(id, d.version), 'Deleted.')} />
      </div>
    </div>
  )
}

// Publish, or, when the document has something worth a second look (a Listing
// with no blacklight photo), say what and ask first. Never a browser confirm().
function PublishButton({ warnings, onPublish }) {
  const [asking, setAsking] = useState(false)
  if (!asking || !warnings.length) {
    return <button type="button" className="eotm-btn is-primary" onClick={() => (warnings.length ? setAsking(true) : onPublish())}>Publish</button>
  }
  return (
    <div className="eotm-warn" role="alertdialog" aria-label="Publish anyway?">
      {warnings.map((w) => <p key={w}>{w}</p>)}
      <div className="eotm-row">
        <button type="button" className="eotm-btn" onClick={() => setAsking(false)}>Keep editing</button>
        <button type="button" className="eotm-btn is-primary" onClick={() => { setAsking(false); onPublish() }}>Publish anyway</button>
      </div>
    </div>
  )
}

// Two taps instead of a browser confirm(), which blocks the page.
function DeleteButton({ label, onConfirm }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) } }, [armed])
  return (
    <button type="button" className={`eotm-btn ${armed ? 'is-danger' : 'is-quiet'}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? `Tap again to delete this ${label.toLowerCase()}` : 'Delete'}
    </button>
  )
}
