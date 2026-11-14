import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkDocument, warnDocument, titleOf, setItemField, sectionParts, newBlock } from '../schema/schema.js'
import { ELEMENT_LABELS } from '../schema/elements.js'
import { previewPathFor } from './bridge.js'
import { FieldList, Elements, RemoveButton } from './Fields.jsx'
import ManageList from './Manage.jsx'
import Arrange from './Arrange.jsx'
import CustomTypes from './CustomTypes.jsx'
import Images from './Images.jsx'
import Media from './Media.jsx'
import ImportDesign from './ImportDesign.jsx'
import ClassTree from './ClassTree.jsx'
import { customName, fieldsAt } from '../schema/custom.js'
import { CLASS_TYPE, classesOf } from '../schema/classes.js'
import { createPortal } from 'react-dom'
import Info from './Info.jsx'

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
const STATUS_TEXT = { draft: 'Draft', published: 'Live', changed: 'Live, edited' }
const STATUS_TITLE = {
  draft: 'Saved, never published. Edits save by themselves; Publish makes it live.',
  published: 'Live: what is saved is what is published.',
  changed: 'Live, with saved edits not published yet. Discard goes back to what is live.',
}
// Whether Review changes covers a type (schema release.types; left out, all).
const inRelease = (schema, type) => !schema.release?.types || schema.release.types.includes(type)

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

// The panel docks to the right of the page on a desktop and on any screen
// held sideways (a phone or tablet in landscape), so the page stays in view
// beside it; upright, it is a sheet from the bottom.
export function useDocked(wide) {
  const q = '(orientation: landscape) and (min-width: 560px)'
  const [side, setSide] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setSide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide || side
}

// The width the page is laid out at while editing, on a screen narrower than
// a desktop: "fit" (the device's own), "tablet" (1024) or "desktop" (1280).
// It rewrites the page's viewport tag, so the site's own media queries see that
// width and the browser scales the page to fit: a phone shows the desktop
// layout whole, and pinching zooms in as on any page. The editor's own panel is
// zoomed back up by the same factor so it stays readable. Turned sideways, a
// narrow screen takes Desktop unless the owner chose; upright, Fit. Closing the
// editor puts the tag back.
export const PAGE_WIDTHS = { fit: null, tablet: 1024, desktop: 1280 }
export function usePageWidth() {
  const meta = useRef(null)
  const original = useRef(null)
  const base = useRef(typeof innerWidth === 'number' ? innerWidth : 1280) // the device's own width, measured at Fit
  const [chosen, setChosen] = useState(null) // the owner's pick, this visit
  const [landscape, setLandscape] = useState(() => matchMedia('(orientation: landscape)').matches)
  useEffect(() => {
    const mq = matchMedia('(orientation: landscape)')
    const on = () => setLandscape(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const narrow = base.current < 1280
  const width = chosen ?? (narrow && landscape && matchMedia('(pointer: coarse)').matches ? 'desktop' : 'fit')
  const px = PAGE_WIDTHS[width]
  const scale = px && base.current < px ? base.current / px : 1
  useEffect(() => {
    meta.current ??= document.querySelector('meta[name="viewport"]')
    if (!meta.current) return undefined
    original.current ??= meta.current.getAttribute('content')
    if (!px || base.current >= px) {
      meta.current.setAttribute('content', original.current)
      const remeasure = () => { base.current = innerWidth }
      remeasure()
      addEventListener('resize', remeasure)
      return () => removeEventListener('resize', remeasure)
    }
    meta.current.setAttribute('content', `width=${px}, initial-scale=${Math.round(scale * 1000) / 1000}`)
    return undefined
  }, [px, scale])
  useEffect(() => () => { if (meta.current && original.current != null) meta.current.setAttribute('content', original.current) }, [])
  return { width, setWidth: setChosen, scale, narrow }
}

// The editor is a sidebar on the left, opened and folded by ☰ in the banner
// (or « in its own header), the way a shop's manager pages keep their menu.
// Open on a wide screen it takes its width from the page rather than lying
// over it: <html> gets eotm-side-docked and --eotm-side, and the page moves
// over by that much. On a phone it lies over the page and folds away when the
// page is wanted. Whether it is open is kept for this visit.
const SIDE_OPEN = 'eotm:side-open'
const readSideOpen = (wide) => {
  try { const v = sessionStorage.getItem(SIDE_OPEN); return v == null ? wide : v === '1' } catch { return wide }
}
// The banner's Edit box, kept for this visit: ticked, a click on the page picks
// what to arrange; unticked, the page works as visitors use it.
const EDITING = 'eotm:editing'
const readEditing = () => {
  try { return sessionStorage.getItem(EDITING) === '1' } catch { return false }
}

function Side({ open, peek, header, children, style, wide }) {
  const side = useRef(null)
  const reserve = wide && open
  useEffect(() => {
    if (!reserve || !side.current) return undefined
    const root = document.documentElement
    const fit = () => { if (side.current) root.style.setProperty('--eotm-side', `${Math.round(side.current.getBoundingClientRect().width)}px`) }
    fit()
    root.classList.add('eotm-side-docked')
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    watch?.observe(side.current)
    return () => {
      watch?.disconnect()
      root.classList.remove('eotm-side-docked')
      root.style.removeProperty('--eotm-side')
    }
  }, [reserve])
  // Folded, its contents stay mounted out of sight: the open document is what
  // takes Arrange's writes.
  return (
    <aside ref={side} className={`eotm-side${open ? ' is-open' : ''}${wide ? ' is-wide' : ''}${peek ? ' is-peek' : ''}`} style={style} aria-label="Site editor">
      {header}
      <div className="eotm-scroll">{children}</div>
    </aside>
  )
}

// The banner across the top while the editor is open. The page moves down by
// its height (html.eotm-managing, --eotm-banner), so nothing is hidden under it.
function Banner({ children }) {
  const bar = useRef(null)
  useEffect(() => {
    const root = document.documentElement
    const fit = () => { if (bar.current) root.style.setProperty('--eotm-banner', `${Math.round(bar.current.getBoundingClientRect().height)}px`) }
    fit()
    root.classList.add('eotm-managing')
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    if (bar.current) watch?.observe(bar.current)
    return () => {
      watch?.disconnect()
      root.classList.remove('eotm-managing')
      root.style.removeProperty('--eotm-banner')
    }
  }, [])
  return <div ref={bar} className="eotm-banner" role="region" aria-label="Edit Mode: Preview">{children}</div>
}

// ---------------------------------------------------------------- app

export default function App({ schema: shipped, store, bridge, auth, dashboard, onClose }) {
  // The schema the owner edits with; saving their own types (CustomTypes.jsx)
  // replaces it, and the page hears of it through the bridge.
  const [schema, setSchema] = useState(shipped)
  useEffect(() => { bridge.setSchema?.(schema) }, [bridge, schema])
  const mode = useBrandMode(schema.brand)
  const wide = useWide()
  const page = usePageWidth()
  const [peek, setPeek] = useState(false)
  const [sideOpen, setSideOpenState] = useState(() => readSideOpen(wide))
  const setSideOpen = useCallback((next) => setSideOpenState((o) => {
    const v = typeof next === 'function' ? next(o) : next
    try { sessionStorage.setItem(SIDE_OPEN, v ? '1' : '0') } catch { /* private mode */ }
    return v
  }), [])
  // The banner's Edit box. Unticked (View), the page works as visitors use it.
  // Ticked, a click picks a section or part, shows its handles to move and
  // size it, and its Edit icon opens it in the sidebar (Arrange.jsx). The
  // editor opens on View: owners first look at the page, then choose to change it.
  const [editing, setEditingState] = useState(readEditing)
  const setEditing = (on) => {
    setEditingState(on)
    setPeek(false)
    try { sessionStorage.setItem(EDITING, on ? '1' : '0') } catch { /* private mode */ }
  }
  const clickMode = editing ? 'arrange' : 'view'
  const [overlay, setOverlay] = useState(null) // where on-page handles render, outside the sheet
  const [user, setUser] = useState(undefined)
  const [view, setView] = useState({ name: 'home' })
  const [toast, setToast] = useState(null)
  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 4000) }, [])

  useEffect(() => { auth.current().then(setUser) }, [auth])
  // Ends the sign-in here and on the admin page, which then offers this site's
  // sign-in again; local mode has no admin page, so it shows the form instead.
  const signOut = async () => {
    await auth.signOut()
    // A site that keeps its own sign-in (Spirit Seeds' live address) cancels
    // this and ends the session there instead of on the admin page.
    if (!window.dispatchEvent(new CustomEvent('eotm:signout', { cancelable: true }))) return
    if (auth.redirect) auth.redirect({ signout: true })
    else setUser(null)
  }
  // Unpublished changes (To the Developer's count), and what closing does with them.
  const [unpublished, setUnpublished] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(0) // bumps after a publish, so the counts refresh
  // Every way out of the editor (✕, the dashboard links) asks Save, Discard
  // or Cancel while there are changes not yet live or not yet saved; `go` is
  // where it was going.
  const [leaving, setLeaving] = useState(null)
  const unsaved = view.saveState === 'pending' || view.saveState === 'saving'
  const going = useRef(false)
  // Leaving the page another way (reload, the address bar): the browser asks
  // first, in its own wording (a page cannot choose it).
  useEffect(() => {
    if (!unpublished && !unsaved) return undefined
    const warn = (e) => { if (going.current) return; e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [unpublished, unsaved])
  const leave = (go) => (unpublished || unsaved ? setLeaving({ go }) : go())
  const close = () => leave(onClose)
  const goTo = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return // a new tab leaves nothing
    e.preventDefault()
    const href = e.currentTarget.href
    leave(() => { going.current = true; location.assign(href) })
  }
  useEffect(() => () => bridge.clear(), [bridge])

  // The page laid out wider than the screen is scaled down; the editor is
  // zoomed back up so its text and buttons keep their size.
  const style = brandStyle(schema.brand, mode)
  const rootStyle = page.scale < 1 ? { ...style, zoom: 1 / page.scale } : style
  const title = view.name === 'edit' ? view.viewLabel ?? view.title : view.name === 'list' ? schema.types[view.type].plural ?? schema.types[view.type].label
    : view.name === 'types' ? 'Types and names' : view.name === 'templates' ? 'Section templates'
    : view.name === 'images' ? schema.images?.label ?? 'Images' : view.name === 'media' ? 'Media' : view.name === 'import' ? 'Import from Canva' : schema.brand.name
  // A Theme view (Daylight, Blacklight) shows the page in its own look while it is open.
  useEffect(() => { bridge.showMode?.(view.mode ?? null) }, [bridge, view.mode])

  const publishButton = (
    <button type="button" className="eotm-pill is-primary eotm-publish" onClick={() => setPublishing(true)}
      title={unpublished ? `${unpublished} change${unpublished === 1 ? '' : 's'} not live yet` : 'Everything is live'}>
      Review changes{unpublished ? ` (${unpublished})` : ''}
    </button>
  )
  const header = (
    <header className="eotm-head">
      {view.name !== 'home' && (
        <button type="button" className="eotm-icon" aria-label="Back" onClick={() => setView(view.name === 'edit' && view.back ? view.back : view.name === 'edit' ? { name: 'list', type: view.type } : { name: 'home' })}>←</button>
      )}
      {view.name === 'home' && dashboard && (
        <a className="eotm-icon" href={dashboard} onClick={goTo} aria-label="Back to your dashboard" title="Back to your dashboard">←</a>
      )}
      {view.name === 'home' && schema.brand.logo && <img className="eotm-logo" src={schema.brand.logo} alt="" />}
      <div className="eotm-title">
        <strong>{title}</strong>
        {view.saveState && <span className={`eotm-save is-${view.saveState}`}>{view.saveState === 'saving' ? 'Saving…' : view.saveState === 'saved' ? 'Saved' : view.saveState === 'error' ? 'Not saved' : ''}</span>}
      </div>
      {dashboard && (
        <a className="eotm-icon" href={`${dashboard.replace(/\/$/, '')}/?site=${encodeURIComponent(schema.site)}`} onClick={goTo}
          aria-label="Your account, pages and requests" title="Your account, pages and requests">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </a>
      )}
      <button type="button" className="eotm-icon" aria-label="Fold the editor menu" title="Fold the editor menu; ☰ in the banner opens it again" onClick={() => setSideOpen(false)}>«</button>
      {/* On a screen narrower than a desktop: the width the page is laid out
          at, so a phone or tablet can show and arrange the desktop layout. */}
      {page.narrow && (
        <label className="eotm-pagewidth" title="The width the page is laid out at while you edit. Pinch to zoom in on it.">
          <span>Page</span>
          <select className="eotm-input" value={page.width} onChange={(e) => page.setWidth(e.target.value)}>
            <option value="fit">This screen</option>
            <option value="tablet">Tablet (1024)</option>
            <option value="desktop">Desktop (1280)</option>
          </select>
        </label>
      )}
    </header>
  )
  // Across the top: what this is, the Edit box, Review changes and the way out.
  const banner = (
    <Banner>
      <button type="button" className="eotm-banner-menu" aria-expanded={sideOpen} aria-label={sideOpen ? 'Fold the editor menu' : 'Open the editor menu'}
        title={sideOpen ? 'Fold the editor menu' : 'Open the editor menu'} onClick={() => setSideOpen((o) => !o)}>☰</button>
      <strong className="eotm-banner-title" title="Your edits show here, in preview, until you publish them in Review changes.">{editing ? 'Edit Mode' : 'View Mode'}: Preview</strong>
      <label className="eotm-editbox" title="Ticked: tap anything on the page to pick it, drag to move it, size it with its handles, and open it with its Edit icon. Unticked: the page works as visitors see it.">
        <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
        <span>Edit</span>
      </label>
      <Info label="What the banner does">{[
        ['☰', 'Open or fold the editor menu on the left: every page, its sections and elements, and the rest of the site.'],
        ['Edit', 'Ticked, tap anything on the page to pick it, drag to move it and use its handles to size it; its Edit icon opens it in the menu. Unticked, the page works as visitors use it.'],
        ['Review changes', 'Your changes show on this page as you make them; Review changes lists each one, to publish to the live site or discard.'],
        ['✕', 'Close the editor. Nothing is lost: it saves as you go.'],
      ]}</Info>
      <span className="eotm-banner-gap" />
      {user && publishButton}
      <button type="button" className="eotm-icon" aria-label="Close editor" title="Close the editor" onClick={close}>✕</button>
    </Banner>
  )

  // "Save as template" on a section: kept in the site's own schema (custom
  // templates), offered when adding a section of that type.
  const saveTemplate = async (name, block) => {
    const custom = schema.custom ?? {}
    const { _id, ...rest } = block // eslint-disable-line no-unused-vars
    const templates = [...(custom.templates ?? []), { name, block: rest }]
    const { schema: next } = await store.saveCustom({ ...custom, templates })
    setSchema(next)
    notify(`Saved as the template \u201c${name}\u201d. It is offered when you add a section.`)
  }
  // "+ Add a field" on any element (Fields.jsx, AddField): kept in the site's
  // own schema (schema/custom.js, custom.fields), so every element of that
  // kind gains it at once and the site draws it.
  const saveAdded = async (at, list) => {
    const custom = schema.custom ?? {}
    const fields = { ...(custom.fields ?? {}), [at]: list }
    if (!list.length) delete fields[at]
    const { schema: next } = await store.saveCustom({ ...custom, fields })
    setSchema(next)
  }
  const addField = async (at, { label, kind }) => {
    const taken = new Set((fieldsAt(schema, at) ?? []).map((f) => f.name))
    const base = customName(label) || 'customField'
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}${n}`
    await saveAdded(at, [...(schema.custom?.fields?.[at] ?? []), { name, kind, label }])
    notify(`Added “${label}”. It is in every one of these now.`)
  }
  const removeField = async (at, name) => {
    await saveAdded(at, (schema.custom?.fields?.[at] ?? []).filter((f) => f.name !== name))
    notify('Field removed. What was typed in it is kept, in case it comes back.')
  }
  // "+ Add a class" in Classes: the owner's own class, kept with their types
  // (schema/classes.js); it gets a Style there and can be given to elements.
  // `base`: made from that class (New class from this), so it starts as its look.
  const addClass = async (label, madeFrom = null) => {
    const custom = schema.custom ?? {}
    const taken = new Set([...(schema.classes ?? []), ...(custom.classes ?? [])].map((c) => c.name))
    const base = customName(label).slice('custom'.length).replace(/^./, (c) => c.toLowerCase()) || 'class'
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}${n}`
    const { schema: next } = await store.saveCustom({ ...custom, classes: [...(custom.classes ?? []), madeFrom ? { name, label, base: madeFrom } : { name, label }] })
    setSchema(next)
    const from = madeFrom && classesOf(schema).find((c) => c.name === madeFrom)
    notify(from ? `Added “${label}”, made from ${from.label}: it looks the same until you change its style.` : `Added the class “${label}”. Give it a style here, then give it to any element.`)
    return name
  }
  // A design brought in from Canva (ImportDesign.jsx): its new classes added
  // to the site's own, each piece given its class, then the design written
  // into the section it was asked for from, and that section opened.
  const importDesign = async (target, { design, refs, newClasses }) => {
    const custom = schema.custom ?? {}
    const taken = new Set([...(schema.classes ?? []), ...(custom.classes ?? [])].map((c) => c.name))
    const byLabel = new Map([...(schema.classes ?? []), ...(custom.classes ?? [])].map((c) => [c.label.toLowerCase(), c.name]))
    const added = []
    for (const label of newClasses) {
      if (byLabel.has(label.toLowerCase())) continue
      const base = customName(label).slice('custom'.length).replace(/^./, (c) => c.toLowerCase()) || 'class'
      let name = base
      for (let n = 2; taken.has(name); n++) name = `${base}${n}`
      taken.add(name)
      byLabel.set(label.toLowerCase(), name)
      added.push({ name, label })
    }
    if (added.length) {
      const { schema: next } = await store.saveCustom({ ...custom, classes: [...(custom.classes ?? []), ...added] })
      setSchema(next)
    }
    const classOf = new Map(refs.map(([id, c]) => [id, c.ref ?? byLabel.get(c.label.toLowerCase())]))
    const element = { ...design, _elements: design._elements.map((el) => (classOf.get(el._id) ? { ...el, class: classOf.get(el._id) } : el)) }
    setView({ name: 'home' })
    await resizeTarget({ ...target, field: '_elements', value: (old) => [...(Array.isArray(old) ? old : []), element] })
  }
  // An element saved as a template (Fields.jsx Elements, Arrange): offered when
  // adding an element to any section.
  const saveElementTemplate = async (name, element) => {
    const custom = schema.custom ?? {}
    const { _id, ...rest } = element // eslint-disable-line no-unused-vars
    const { schema: next } = await store.saveCustom({ ...custom, elementTemplates: [...(custom.elementTemplates ?? []), { name, element: rest }] })
    setSchema(next)
    notify(`Saved “${name}”. It is offered when you add an element.`)
  }
  // Arrange saves the element on the page: found by its id in its document.
  const saveElementFromPage = async ({ type, key, id, name }) => {
    const doc = await findDoc(type, key)
    let found = null
    const walk = (v) => {
      if (found || !v || typeof v !== 'object') return
      if (Array.isArray(v)) return v.forEach(walk)
      if (Array.isArray(v._elements)) found = v._elements.find((e) => e?._id === id) ?? null
      Object.values(v).forEach(walk)
    }
    walk(doc?.data)
    if (!found) throw new Error('That is not an element of yours: only added elements can be saved as templates.')
    await saveElementTemplate(name, found)
  }
  // The editor token, for the site's own admin routes a type's manager calls (Manage.jsx, stock).
  const getToken = useCallback(async () => (await auth.getToken?.()) ?? null, [auth])
  // A document opened from the menu (or a class's Style from the page): the
  // sidebar opens on it, at the item and field named.
  const openDoc = (doc, item = null, field = null) => {
    setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc), focus: item, focusField: field, focusAt: Date.now(), back: { name: 'home' } })
    setSideOpen(true)
  }
  const ctxBase = { schema, store, bridge, notify, upload: (blob, meta) => store.upload(blob, meta), overlay, setPeek, saveTemplate, addField, removeField, addClass, saveElementTemplate }

  // The page layout document for an address (a type with a `layout` field and a
  // `path`, StoryShaped's pageLayout): Arrange's section-width handle writes it,
  // so a page with none yet gets one, named as the page titles itself.
  const layoutType = Object.entries(schema.types).find(([, t]) => t.fields?.some((f) => f.kind === 'layout') && t.fields.some((f) => f.name === 'path'))
  const layoutFor = layoutType ? async (path) => {
    const [type, t] = layoutType
    const field = t.fields.find((f) => f.kind === 'layout').name
    const found = (await store.list(type)).find((d) => (d.data?.path ?? '') === path)
    if (found) return { type, key: found.id, field }
    const title = path === '/' ? 'Home' : document.title.split('|')[0].trim() || path
    const doc = await store.create({ type, data: { title, path } })
    return { type, key: doc.id, field }
  } : null

  // Click-to-edit (Targets.jsx): the page names a document by id or slug.
  const findDoc = async (type, key) => bridge.draft(type, key) ?? (await store.list(type)).find((d) => d.id === key || d.slug === key)
  // Sections added from a page's placeholder this visit, by doc, type and place.
  const added = useRef(new Map())
  const openTarget = async ({ type, key, item, field = null, keepPane = false, add = null }) => {
    if (!schema.types[type]) return
    try {
      let doc = await findDoc(type, key)
      // A one-of-a-kind type (a home page, a theme) the owner has not started
      // yet: start it, filled with the schema's defaults (the page as shipped).
      if (!doc && schema.types[type].singleton) doc = await store.create({ type, data: {} })
      // A page of overrides the owner has not edited yet: start it, named as
      // the page names it (data-eotm-edit="<type>:<key>").
      if (!doc && schema.types[type].overrides) doc = await store.create({ type, slug: key, data: { page: key } })
      if (!doc) return notify('That part of the page is not in the editor yet.')
      // A section the page shows but the document lacks (data-eotm-add): added
      // where the page shows it, filled from the page's seed, and opened.
      // Never a second one: a placeholder stands in for a section the page
      // does not have, so when the document has one of that type anywhere (added
      // by an earlier tap, before the page redrew) a tap opens it instead of
      // adding another (Spirit Seeds' Home kept gaining slideshows).
      const list = schema.types[doc.type]?.fields?.find((f) => f.kind === 'blocks')?.name
      const there = add && list ? (doc.data?.[list] ?? []).find((b) => b._type === add.type) : null
      const addKey = add && `${doc.id}:${add.type}:${add.at}`
      if (add && (added.current.has(addKey) || there?._type === add.type)) {
        item = added.current.get(addKey) ?? there._id
        field = field ?? add.field
      } else if (add && schema.blocks?.[add.type]) {
        const block = { ...newBlock(schema, add.type), ...add.seed }
        added.current.set(addKey, block._id)
        item = block._id
        field = field ?? add.field
        const api = editorApi.current
        if (api && api.id === doc.id) api.addBlock(block, add.at)
        else queueWrite({ key: doc.id, item: block._id, field: '$add', add: block, at: add.at })
      }
      // Selecting on the page (Arrange, Edit) keeps the pane as it is, so it
      // does not cover what was just picked; the Edit button opens it.
      if (!keepPane) {
        setPeek(false)
        setSideOpen(true)
      }
      setView({ name: 'edit', type, id: doc.id, title: titleOf(schema, doc), focus: item, focusField: field, focusAt: Date.now(), onPage: true })
    } catch (e) {
      notify(e.message)
    }
  }

  // One view of a one-of-a-kind document (a Theme's Daylight or Blacklight):
  // its own fields, then the ones it shares with the other views, folded.
  const openView = async (type, v) => {
    try {
      const doc = (await store.list(type))[0] ?? (await store.create({ type, data: {} }))
      const views = schema.types[type].views
      const shared = v.fields.filter((f) => views.some((o) => o !== v && o.fields.includes(f)))
      setView({ name: 'edit', type, id: doc.id, title: titleOf(schema, doc), viewLabel: v.label, mode: v.mode ?? null,
        only: v.fields.filter((f) => !shared.includes(f)), shared, back: { name: 'home' } })
    } catch (e) {
      notify(e.message)
    }
  }

  // Drag-to-size: the open editor takes the value at once (the page re-renders
  // from the draft); a document not open yet is opened and takes the latest
  // value when it loads.
  const editorApi = useRef(null)
  // Writes waiting for their document to open: the last one per row and field,
  // so a new element and its place both land (Arrange writes both at once).
  const pendingSize = useRef([])
  const queueWrite = (w) => { pendingSize.current = [...pendingSize.current.filter((p) => !(p.key === w.key && p.item === w.item && p.field === w.field)), w] }
  const opening = useRef(null)
  // Typing on the page (Targets): the document takes each change without the
  // page being redrawn under the cursor; when the owner leaves the text, the
  // page is brought up to date. Opens the document first if it is not open.
  const textTarget = async ({ type, key, item, field, value, done }) => {
    if (!schema.types[type]) return
    const api = editorApi.current
    if (api && (api.id === key || api.slug === key)) {
      if (done) return api.flushPage()
      return api.setField(item, field, value, null, { quiet: true })
    }
    if (done) return
    queueWrite({ key, item, field, value, imageIndex: null })
    if (opening.current === key) return
    opening.current = key
    await openTarget({ type, key, item, keepPane: true })
    opening.current = null
  }
  const resizeTarget = async ({ type, key, item, field, value, imageIndex = null }) => {
    if (!schema.types[type]) return
    const api = editorApi.current
    if (api && (api.id === key || api.slug === key)) return api.setField(item, field, value, imageIndex)
    queueWrite({ key, item, field, value, imageIndex })
    if (opening.current === key) return
    opening.current = key
    await openTarget({ type, key, item, keepPane: true })
    opening.current = null
  }

  let body
  if (publishing) body = (
    <PublishDialog schema={schema} store={store} bridge={bridge} notify={notify} getToken={getToken} save={() => editorApi.current?.save?.()}
      onClose={() => setPublishing(false)} onChanged={() => setPublished((n) => n + 1)} />
  )
  else if (leaving) body = (
    <div className="eotm-warn" role="alertdialog" aria-label="Changes not yet live">
      <p>{unpublished ? `${unpublished} change${unpublished === 1 ? ' is' : 's are'} not live yet.` : 'A change is still being saved.'} Save keeps your changes for next time. Review changes lets you publish or discard each one. Discard all puts the whole site back to what is live.</p>
      <div className="eotm-row">
        {/* Save is the default: Enter on the open dialog saves. */}
        <button type="button" className="eotm-btn is-primary" autoFocus onClick={async () => {
          try { await editorApi.current?.save?.() } catch (e) { notify(e.message); return }
          leaving.go()
        }}>Save</button>
        {unpublished > 0 && <button type="button" className="eotm-btn" onClick={() => { setLeaving(null); setPublishing(true) }}>Review changes</button>}
        <DiscardButton label="Discard all" onConfirm={async () => {
          try { const r = await store.discardAll(); notify(r.kept.length ? `Discarded. ${r.kept.length} never-published draft${r.kept.length === 1 ? ' was' : 's were'} kept.` : 'Discarded.'); leaving.go() } catch (e) { notify(e.message); setLeaving(null) }
        }} />
        <button type="button" className="eotm-btn" onClick={() => setLeaving(null)}>Cancel</button>
      </div>
    </div>)
  else if (user === undefined) body = <p className="eotm-empty">Loading…</p>
  else if (!user) body = <SignIn auth={auth} onSignedIn={setUser} />
  else if (view.name === 'home') body = <Home schema={schema} store={store} notify={notify} ctxBase={ctxBase} getToken={getToken}
    openDoc={openDoc}
    addClass={addClass} onAddElement={async ({ element, ...t }) => {
      await resizeTarget({ ...t, field: '_elements', value: (old) => [...(Array.isArray(old) ? old : []), element] })
      // The pane opens at the new element: its row, and the Elements it is in.
      if (element?._id) setView((v) => (v.name === 'edit' ? { ...v, focus: element._id, focusField: null, focusAt: Date.now() } : v))
    }}
    onView={openView} onImages={() => setView({ name: 'images' })} onMedia={() => setView({ name: 'media' })} onTypes={() => setView({ name: 'types' })} onTemplates={() => setView({ name: 'templates' })} onTool={(path) => { bridge.navigate(path); if (!wide) setSideOpen(false) }} />
  else if (view.name === 'media') body = <Media store={store} notify={notify} />
  else if (view.name === 'images') body = (
    <Images schema={schema} store={store} bridge={bridge} notify={notify}
      open={(doc) => setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc), back: { name: 'images' } })} />)
  else if (view.name === 'import') body = (
    <ImportDesign schema={schema} upload={(blob) => store.upload(blob)} notify={notify}
      onCancel={() => setView(view.back ?? { name: 'home' })} apply={(made) => importDesign(view.target, made)} />
  )
  else if (view.name === 'types') body = <CustomTypes schema={schema} store={store} notify={notify} onSaved={setSchema} />
  else if (view.name === 'templates') body = <Templates schema={schema} store={store} notify={notify} onSaved={setSchema} />
  else if (view.name === 'list') body = (
    <DocList schema={schema} store={store} type={view.type} notify={notify}
      open={(doc, item) => setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc), focus: item ?? null, focusAt: Date.now() })} />)
  else body = (
    <Editor key={view.id} schema={schema} store={store} bridge={bridge} id={view.id} ctxBase={ctxBase} notify={notify}
      onState={(patch) => setView((v) => ({ ...v, ...patch }))}
      onGone={() => setView(view.back ?? { name: 'list', type: view.type })}
      only={view.only} shared={view.shared} onPage={view.onPage}
      onOpen={(doc) => setView({ name: 'edit', type: doc.type, id: doc.id, title: titleOf(schema, doc) })}
      onFocus={(item) => setView((v) => ({ ...v, focus: item, focusField: null, focusAt: Date.now() }))}
      focus={view.focus} focusField={view.focusField} focusAt={view.focusAt} editorApi={editorApi} pendingSize={pendingSize} />)

  return (
    <>
    <div className="eotm-root" data-eotm-mode={mode} style={rootStyle}>
      {banner}
      <Side open={sideOpen} peek={peek} header={header} style={style} wide={wide}>
        {body}
        {user && view.name === 'home' && !leaving && (
          <p className="eotm-who">
            Signed in as <strong>{user.email ?? 'the site owner'}</strong>
            <button type="button" className="eotm-btn is-quiet" onClick={signOut}>Sign out</button>
          </p>
        )}
        {user && <ToDeveloper schema={schema} store={store} notify={notify} onCount={setUnpublished} refreshKey={`${view.saveState === 'saved' ? view.title : view.name}:${published}:${publishing}`} />}
      </Side>
      {toast && <div className="eotm-toast" role="status">{toast}</div>}
    </div>
    {/* The on-page outlines and handles sit over the page in its own
        coordinates, so they are outside the editor's zoom (page width). */}
    <div className="eotm-root eotm-overlay" data-eotm-mode={mode} style={style}>
      <div ref={setOverlay} />
      {/* With Edit ticked, a click selects, with handles to move and size,
          and the selection's Edit icon opens it in the sidebar. */}
      {user && overlay && clickMode !== 'view' && createPortal(
        <Arrange key={clickMode} onChange={resizeTarget} uiScale={1 / page.scale} upload={(blob) => store.upload(blob)} notify={notify}
          templates={schema.custom?.elementTemplates ?? []} onSaveTemplate={saveElementFromPage} layoutFor={layoutFor}
          onSelect={(t) => openTarget({ ...t, keepPane: true })} onEdit={(t) => openTarget({ ...t, keepPane: false })} onText={textTarget}
          tools classes={classesOf(schema)} addClass={addClass}
          onClass={async (field) => { try { const [doc] = await store.list(CLASS_TYPE); openDoc(doc ?? (await store.create({ type: CLASS_TYPE, data: {} })), null, field) } catch (e) { notify(e.message) } }}
          onImport={(target) => { setView({ name: 'import', target, back: view }); setPeek(false); setSideOpen(true) }} />, overlay)}
    </div>
    </>
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
  { value: 'request', label: 'Request Changes', help: 'Sends your note to the developer. Nothing goes live; Review changes, at the top, does that.' },
]

function ToDeveloper({ schema, store, notify, refreshKey, onCount }) {
  const [pending, setPending] = useState(null)
  const [action, setAction] = useState('request')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => store.pending?.().then((r) => setPending(r.pending)).catch(() => setPending(null)), [store])
  useEffect(() => { onCount?.(pending?.length ?? 0) }, [pending, onCount])
  useEffect(() => { load() }, [load, refreshKey])

  const needsNote = action !== 'push'
  const count = pending?.length ?? 0
  const status = pending === null ? 'Checking…' : count ? `${count} change${count === 1 ? '' : 's'} not live yet: Review changes, at the top` : 'Everything is live'
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

// The Pages outline at the top of the menu: each kind of page (a type built
// from sections), each page, its sections, and each section's elements. A name
// opens that page at that part; Show more reveals its class, kind and id.
function OutlineNode({ label, meta, onOpen, children }) {
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState(false)
  const kids = React.Children.toArray(children).filter(Boolean)
  return (
    <li className="eotm-outline-node">
      <div className="eotm-outline-row">
        {kids.length > 0
          ? <button type="button" className="eotm-outline-twist" aria-expanded={open} aria-label={open ? `Fold ${label}` : `Unfold ${label}`} onClick={() => setOpen((o) => !o)}>{open ? '▾' : '▸'}</button>
          : <span className="eotm-outline-twist" aria-hidden="true" />}
        <button type="button" className="eotm-outline-name" onClick={onOpen}>{label}</button>
        {meta?.length > 0 && <button type="button" className="eotm-outline-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? 'Show less' : 'Show more'}</button>}
      </div>
      {more && (
        <dl className="eotm-outline-meta">
          {meta.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd><code>{v}</code></dd></React.Fragment>)}
        </dl>
      )}
      {open && kids.length > 0 && <ul className="eotm-outline">{kids}</ul>}
    </li>
  )
}

function PagesOutline({ schema, store, openDoc }) {
  const kinds = Object.entries(schema.types).filter(([, t]) => t.fields?.some((f) => f.kind === 'blocks'))
  const [docs, setDocs] = useState({})
  useEffect(() => {
    for (const [type] of kinds) store.list(type).then((list) => setDocs((d) => ({ ...d, [type]: list }))).catch(() => {})
  }, [schema, store])
  if (!kinds.length) return <p className="eotm-help">This site has no pages built from sections.</p>
  const elementsOf = (doc, block) => (Array.isArray(block._elements) ? block._elements : []).filter((el) => el?._id).map((el) => (
    <OutlineNode key={el._id} label={el.text || el.label || el.alt || ELEMENT_LABELS[el.kind] || 'Element'}
      meta={[['Kind', ELEMENT_LABELS[el.kind] ?? el.kind ?? 'element'], ...(el.class ? [['Class', el.class]] : []), ...(el.tag ? [['Tag', el.tag]] : []), ['Id', el._id]]}
      onOpen={() => openDoc(doc, el._id)} />
  ))
  const blocksOf = (doc) => {
    const lists = (schema.types[doc.type]?.fields ?? []).filter((f) => f.kind === 'blocks')
    return lists.flatMap((f) => (doc.data?.[f.name] ?? []).filter((b) => b?._id).map((b) => (
      <OutlineNode key={b._id} label={labelOf(schema, b)}
        meta={[['Section', schema.blocks?.[b._type]?.label ?? b._type], ['Type', b._type], ...(b.class ? [['Class', b.class]] : []), ['Id', b._id]]}
        onOpen={() => openDoc(doc, b._id)}>
        {elementsOf(doc, b)}
      </OutlineNode>
    )))
  }
  return (
    <ul className="eotm-outline is-root">
      {kinds.map(([type, t]) => (
        <OutlineNode key={type} label={t.plural ?? t.label ?? type} meta={[['Type', type]]}
          onOpen={() => { const [first] = docs[type] ?? []; if (first) openDoc(first) }}>
          {(docs[type] ?? []).map((doc) => (
            <OutlineNode key={doc.id} label={titleOf(schema, doc)} meta={[['Type', doc.type], ...(doc.slug ? [['Slug', doc.slug]] : []), ...(doc.data?.path ? [['Path', doc.data.path]] : []), ['Id', doc.id]]}
              onOpen={() => openDoc(doc)}>
              {blocksOf(doc)}
            </OutlineNode>
          ))}
        </OutlineNode>
      ))}
    </ul>
  )
}

// More than this many types on a phone become a dropdown instead of cards.
const HOME_OPEN = 'eotm:home-open'

// Where a type sits on the home menu: with the content, or under Design (its
// look: themes, layouts, settings, menus). The schema can say (`group`).
export const isDesign = (name, t) => (t.group ? t.group === 'design' : /theme|layout|setting|menu/i.test(name))

function Home({ schema, store, notify, openDoc, onView, onImages, onMedia, onTypes, onTemplates, onTool, addClass, onAddElement, ctxBase, getToken }) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    for (const type of Object.keys(schema.types)) store.list(type).then((docs) => setCounts((c) => ({ ...c, [type]: docs.length }))).catch(() => {})
  }, [schema, store])
  // Every heading folds open and shut, and is kept so for next time.
  const [unfolded, setUnfolded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HOME_OPEN) ?? '[]')) } catch { return new Set() }
  })
  const toggle = (id, isOpen) => setUnfolded((s) => {
    if (s.has(id) === isOpen) return s
    const n = new Set(s)
    if (isOpen) n.add(id); else n.delete(id)
    try { localStorage.setItem(HOME_OPEN, JSON.stringify([...n])) } catch { /* private mode */ }
    return n
  })
  const fold = (id, label, count, body, help = null) => (
    <details key={id} className="eotm-fold eotm-home-fold" open={unfolded.has(id)} onToggle={(e) => toggle(id, e.currentTarget.open)}>
      <summary><span className="eotm-fold-label">{label}</span>{count != null && <span className="eotm-class-count">{count}</span>}{help && <Info label={`What ${label} is`}>{help}</Info>}</summary>
      {unfolded.has(id) && body}
    </details>
  )
  // A type listed under another (menuUnder) is reached through that one's list.
  // The type Images keeps (schema `images`) is reached through Images.
  const types = Object.entries(schema.types).filter(([n, t]) => !t.menuUnder && n !== schema.images?.type)
  const under = (name) => Object.entries(schema.types).filter(([, t]) => t.menuUnder === name).map(([n]) => n)
  const countOf = (name) => [name, ...under(name)].reduce((n, t) => (counts[t] == null || n == null ? null : n + counts[t]), 0)
  // The site's own admin pages the schema names (`tools`, e.g. StoryShaped's
  // Inventory): hidden from visitors, reached from here. Opening one shows it
  // on the page; on a phone the sheet drops to its banner so the page is seen.
  const tools = (schema.tools ?? []).map((t) => (
    <li key={t.path}>
      <button type="button" className="eotm-card is-tool" onClick={() => onTool(t.path)}>
        <strong>{t.label}</strong>
        <span>{t.help ?? t.path}</span>
      </button>
    </li>
  ))
  const templates = schema.custom?.templates ?? []
  const sectionKinds = Object.entries(schema.blocks ?? {})
  // What a heading holds: a type in views (a Theme's Daylight and Blacklight)
  // a card per view; a one-of-a-kind document its settings by name, each
  // opening there; Classes the class outline; any other type its list.
  const section = ([name, t]) => {
    if (t.views) return (
      <ul key={name} className="eotm-types">{t.views.map((v) => (
        <li key={`${name}:${v.label}`}>
          <button type="button" className="eotm-card" onClick={() => onView(name, v)}>
            <strong>{v.label}</strong>
            <span>{v.help ?? t.label}</span>
          </button>
        </li>
      ))}</ul>
    )
    const label = t.plural ?? t.label
    if (name === CLASS_TYPE) {
      const n = (t.fields ?? []).length
      return fold(name, label, `${n} class${n === 1 ? '' : 'es'}`, (
        <ClassTree schema={schema} store={store} addClass={addClass} onAdd={onAddElement}
          openStyle={async (field) => {
            try { const [doc] = await store.list(name); openDoc(doc ?? (await store.create({ type: name, data: {} })), null, field) } catch (e) { notify(e.message) }
          }} />
      ), t.help ?? 'A class is a shared look: every object with that class is drawn the same way. Style changes the look everywhere at once; + adds an object with that class to a section.')
    }
    if (t.singleton) {
      const n = (t.fields ?? []).length
      return fold(name, label, `${n} setting${n === 1 ? '' : 's'}`, <Settings schema={schema} store={store} type={name} openDoc={openDoc} notify={notify} />,
        t.help ?? `There is one ${label}, used across the site. Tap a setting to change it.`)
    }
    const n = countOf(name)
    if (t.manage) return fold(name, label, n == null ? '…' : String(n), <ManageList schema={schema} store={store} type={name} notify={notify} ctxBase={ctxBase} getToken={getToken} open={(doc) => openDoc(doc)} />,
        t.help ?? `Every one of your ${label.toLowerCase()}, by ${(t.manage.groupBy ?? []).map((g) => (t.fields.find((f) => f.name === g)?.label ?? g).toLowerCase()).join(', then ') || 'name'}. ✎ edits the most-changed fields on each card; tick several to edit them together.`)
    return fold(name, label, n == null ? '…' : String(n), <DocList schema={schema} store={store} type={name} notify={notify} open={(doc, item) => openDoc(doc, item)} />,
        t.help ?? `Every one of your ${label.toLowerCase()}. Open one to change it, or add a new one.`)
  }
  const design = types.filter(([n, t]) => isDesign(n, t))
  const content = types.filter(([n, t]) => !isDesign(n, t))
  const images = schema.images && (
    <li key="images">
      <button type="button" className="eotm-card" onClick={onImages}>
        <strong>{schema.images.label ?? 'Images'}</strong>
        <span>{schema.images.summary ?? 'Photo pairs'}</span>
      </button>
    </li>
  )
  const media = store.media && (
    <li key="media">
      <button type="button" className="eotm-card" onClick={onMedia}>
        <strong>Media</strong>
        <span>Every photo and clip uploaded, in folders</span>
      </button>
    </li>
  )
  return (
    <>
      {fold('outline', 'Site outline', null, <PagesOutline schema={schema} store={store} openDoc={openDoc} />,
        'Every page, then its sections, then the elements in each. Tap a name to open it; Show more gives its class, kind and id.')}
      {content.map(section)}
      {(media || images || tools.length > 0) && <ul className="eotm-types">{media}{images}{tools}</ul>}
      <h3 className="eotm-menu-head">Design</h3>
      {design.map(section)}
      {/* Section templates: the kinds of section the site's schema builds pages
          from, and copies of sections saved to reuse. */}
      {fold('templates', 'Section templates', String(sectionKinds.length + templates.length), (
        <>
          <p className="eotm-help">Each kind of section a page is built from. Add one with a page&rsquo;s + Add a section; save a finished one with ☆ Save as template to reuse it.</p>
          <ul className="eotm-plain">{sectionKinds.map(([k, b]) => <li key={k}>{b.label ?? k} <span className="eotm-class-count">{(b.fields ?? []).length} fields</span></li>)}</ul>
          <button type="button" className="eotm-btn" onClick={onTemplates}>{templates.length ? `Your ${templates.length} saved template${templates.length === 1 ? '' : 's'}` : 'Your saved templates (none yet)'}</button>
        </>
      ), 'The kinds of section a page is built from, and sections you saved to reuse.')}
      {/* Types and names: every type in the schema by the name the console
          gives it; renaming them or designing new ones is there. */}
      {fold('types', 'Types and names', `${Object.keys(schema.types).length} types`, (
        <>
          <p className="eotm-help">What each kind of content is called here. Rename any of them to your own words, or design a new kind of section or list.</p>
          <ul className="eotm-plain">{Object.entries(schema.types).map(([k, t]) => <li key={k}>{t.plural ?? t.label} <span className="eotm-class-count">{(t.fields ?? []).length} fields</span></li>)}</ul>
          <button type="button" className="eotm-btn is-primary" onClick={onTypes}>Rename or design your own</button>
        </>
      ), 'What each kind of content is called in this editor, and where you design new kinds of section or list.')}
    </>
  )
}

// A one-of-a-kind document's settings by name on the home list (Site
// settings: Site title, Tagline, Logo …), each opening the editor at itself.
function Settings({ schema, store, type, openDoc, notify }) {
  const [doc, setDoc] = useState(undefined)
  useEffect(() => { store.list(type).then((d) => setDoc(d[0] ?? null)).catch((e) => { notify(e.message); setDoc(null) }) }, [store, type, notify])
  const fields = schema.types[type]?.fields ?? []
  const shown = (v) => (v == null || v === '' ? '' : typeof v === 'string' ? v.replace(/<[^>]*>/g, '').slice(0, 40)
    : typeof v === 'boolean' ? (v ? 'On' : 'Off') : Array.isArray(v) ? String(v.length) : typeof v === 'object' ? 'Set' : String(v))
  const go = async (field) => {
    try { openDoc(doc ?? (await store.create({ type, data: {} })), null, field) } catch (e) { notify(e.message) }
  }
  if (doc === undefined) return <p className="eotm-empty">Loading…</p>
  return (
    <ul className="eotm-sections">
      {fields.map((f) => (
        <li key={f.name}>
          <button type="button" className="eotm-section-open" onClick={() => go(f.name)}>
            <span>{f.label ?? f.name}</span>
            <span className="eotm-class-count">{shown(doc?.data?.[f.name]) || 'Not set'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// The owner's saved section templates, apart from the pages they are used on:
// rename or remove one. Adding a section offers them (Fields.jsx, Repeater).
function Templates({ schema, store, notify, onSaved }) {
  const custom = schema.custom ?? {}
  const list = custom.templates ?? []
  const [renaming, setRenaming] = useState(null)
  const save = async (templates, msg) => {
    try { const { schema: next } = await store.saveCustom({ ...custom, templates }); onSaved(next); notify(msg) } catch (e) { notify(e.message) }
  }
  if (!list.length) return <p className="eotm-empty">No templates yet. On a page, open a section and choose ☆ Save as template.</p>
  return (
    <ul className="eotm-list eotm-templates">
      {list.map((t, i) => (
        <li key={`${t.name}:${i}`} className="eotm-doc">
          <span className="eotm-doc-open">
            <strong>{t.name}</strong>
            <span className="eotm-chip">{schema.blocks[t.block?._type]?.label ?? t.block?._type}</span>
          </span>
          {renaming === i ? (
            <form className="eotm-row" onSubmit={(e) => {
              e.preventDefault()
              const name = e.currentTarget.elements.name.value.trim()
              setRenaming(null)
              if (name && name !== t.name) save(list.map((x, j) => (j === i ? { ...x, name } : x)), 'Renamed.')
            }}>
              <input name="name" className="eotm-input" defaultValue={t.name} maxLength={60} autoFocus aria-label="Template name" />
              <button className="eotm-btn is-primary">Rename</button>
            </form>
          ) : <button type="button" className="eotm-icon" aria-label={`Rename ${t.name}`} onClick={() => setRenaming(i)}>✎</button>}
          <RemoveButton label={`Remove ${t.name}`} onConfirm={() => save(list.filter((_, j) => j !== i), 'Removed. Sections already on pages are kept.')} />
        </li>
      ))}
    </ul>
  )
}

function DocList({ schema, store, type, open, notify, nested = false }) {
  const t = schema.types[type]
  const children = nested ? [] : Object.entries(schema.types).filter(([, c]) => c.menuUnder === type).map(([n]) => n)
  const [docs, setDocs] = useState(null)
  const [q, setQ] = useState('')
  const [unfolded, setUnfolded] = useState(() => new Set())
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
      <div className="eotm-row">
        <input className="eotm-input" type="search" placeholder={`Search ${(t.plural ?? t.label).toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {!(t.singleton && docs?.length) && <button type="button" className="eotm-btn is-primary" onClick={create}>New {t.label.toLowerCase()}</button>}
      </div>
      {docs === null ? <p className="eotm-empty">Loading…</p> : shown.length === 0 ? <p className="eotm-empty">Nothing here yet.</p> : (
        <ul>
          {shown.map((d) => {
            // Page › Section: a document made of sections lists them under it,
            // each marked when it is not live yet; a tap opens it there.
            const sections = sectionsOf(schema, d)
            const changed = sections.filter((s) => s.state).length
            return (
              <li key={d.id} className="eotm-doc-wrap">
                <div className="eotm-doc">
                  {sections.length > 0 && (
                    <button type="button" className="eotm-icon eotm-fold-btn" aria-expanded={unfolded.has(d.id)} aria-label={`Sections of ${titleOf(schema, d)}`}
                      onClick={() => setUnfolded((s) => { const n = new Set(s); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}>{unfolded.has(d.id) ? '▾' : '▸'}</button>
                  )}
                  <button type="button" className="eotm-doc-open" onClick={() => open(d)}>
                    <strong>{titleOf(schema, d)}</strong>
                    <span className={`eotm-chip is-${d.status}`}>{STATUS_TEXT[d.status]}{changed && d.status === 'changed' ? ` · ${changed}` : ''}</span>
                  </button>
                  <button type="button" className="eotm-icon" aria-label={`Duplicate ${titleOf(schema, d)}`} title="Make a copy" onClick={() => duplicate(d)}>⧉</button>
                </div>
                {unfolded.has(d.id) && (
                  <ul className="eotm-sections">
                    {sections.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="eotm-section-open" onClick={() => open(d, s.id)}>
                          <span>{s.label}</span>
                          {s.state && <span className={`eotm-badge is-${s.state}`}>{BADGE_TEXT[s.state]}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {children.map((c) => (
        <details key={c} className="eotm-fold">
          <summary>{schema.types[c].plural ?? schema.types[c].label}</summary>
          <DocList schema={schema} store={store} type={c} open={open} notify={notify} nested />
        </details>
      ))}
    </div>
  )
}

function Editor({ schema, store, bridge, id, ctxBase, notify, onState, onGone, onOpen, onFocus, focus, focusField, focusAt, editorApi, pendingSize, only, shared, onPage = false }) {
  const [doc, setDoc] = useState(null)
  const [conflict, setConflict] = useState(null)
  const [serverErrors, setServerErrors] = useState([])
  const pending = useRef(null)
  const timer = useRef(null)
  const saving = useRef(false)
  const docRef = useRef(null)
  docRef.current = doc
  // Undo: earlier versions of the data, newest last. Typing within a moment
  // of the last change joins it, so one Undo takes back a word, not a letter.
  const history = useRef([])
  const lastChange = useRef(0)
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    store.get(id).then((d) => {
      setDoc(d)
      bridge.push(d)
      // Opened from a click on the page: the page already shows it, and sending
      // the site to its preview address (/home for Home) would remount the page
      // under the pointer.
      const path = previewPathFor(schema.types[d.type], d)
      if (path && !onPage) bridge.navigate(path)
    }).catch((e) => { notify(e.message); onGone() })
    // Leaving a document with changes not yet live keeps its draft on the page,
    // so the page still shows what the owner did after the pane moves on (to
    // the page layout a width handle writes, or the next section clicked).
    return () => {
      clearTimeout(timer.current)
      const d = docRef.current
      if (!d || JSON.stringify(d.data) === JSON.stringify(d.publishedData)) bridge.drop(d?.type, id)
    }
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
  // `quiet`: the change came from typing on the page itself, which already
  // shows it; the page is told once the owner leaves the text (flushPage).
  const change = (data, { quiet = false, undoing = false } = {}) => {
    const cur = docRef.current
    if (!undoing) {
      if (Date.now() - lastChange.current > 700) history.current.push(cur.data)
      if (history.current.length > 100) history.current.shift()
      lastChange.current = Date.now()
    }
    setCanUndo(history.current.length > 0)
    const next = { ...cur, data }
    docRef.current = next
    setDoc(next)
    if (!quiet) bridge.push(next) // the page re-renders now; the save follows
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
    const setField = (item, field, value, imageIndex = null, { quiet = false } = {}) => {
      const cur = docRef.current
      // An image inside rich text keeps its size in the HTML, as width="n%".
      const write = imageIndex == null ? value : (html) => imageWidthIn(html, imageIndex, value)
      let data = setItemField(cur.data, item, field, write)
      // A type of overrides (schema `overrides`: Edge of the Map's pages) has a
      // row per element only once it is edited: the first edit starts the row,
      // named by the element's id.
      const list = schema.types[cur.type]?.overrides
      if (data === cur.data && item && list && !(cur.data?.[list] ?? []).some((r) => r?._id === item)) {
        data = setItemField({ ...cur.data, [list]: [...(cur.data?.[list] ?? []), { _id: item }] }, item, field, write)
      }
      if (data !== cur.data) change(data, { quiet })
    }
    // A new section at `at` in the document's sections (openTarget's add).
    const addBlock = (block, at) => {
      const cur = docRef.current
      const list = schema.types[cur.type]?.fields?.find((f) => f.kind === 'blocks')?.name
      if (!list) return
      const rows = cur.data?.[list] ?? []
      if (rows.some((b) => b._id === block._id)) return
      const i = Math.max(0, Math.min(rows.length, at))
      change({ ...cur.data, [list]: [...rows.slice(0, i), block, ...rows.slice(i)] })
      // Picked again once it is in the list, so its row opens even when the
      // list was drawn before it arrived (a document opened for it).
      onState({ focus: block._id, focusAt: Date.now() })
    }
    // After typing on the page: let the page catch up with the document.
    const flushPage = () => bridge.push(docRef.current)
    const d = docRef.current
    editorApi.current = { id: d.id, slug: d.slug, setField, addBlock, flushPage, save: flush }
    const mine = pendingSize.current.filter((p) => p.key === d.id || p.key === d.slug)
    pendingSize.current = pendingSize.current.filter((p) => !mine.includes(p))
    for (const p of mine) {
      if (p.add) addBlock(p.add, p.at)
      else setField(p.item, p.field, p.value, p.imageIndex)
    }
    return () => { if (editorApi.current?.id === d.id) editorApi.current = null }
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // A click on the page names a field: bring it into view in the pane and mark
  // it for a moment, once the section holding it has opened. Nothing in the
  // pane takes focus, so typing on the page carries on.
  useEffect(() => {
    if (!loaded || !focusField) return undefined
    const t = setTimeout(() => {
      const root = document.querySelector('.eotm-root')
      const scope = (focus && root?.querySelector(`[data-eotm-item="${focus}"]`)) || root
      const hit = scope?.querySelector(`[data-eotm-field="${focusField}"]`)
      if (!hit) return
      // A folded group holding it unfolds.
      for (let d = hit.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true
      hit.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      hit.classList.add('is-picked')
      setTimeout(() => hit.classList.remove('is-picked'), 1600)
    }, 160)
    return () => clearTimeout(t)
  }, [loaded, focusField, focusAt]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const undo = () => {
    const prev = history.current.pop()
    if (prev === undefined) return
    change(prev, { undoing: true })
  }
  const saveNow = async () => {
    clearTimeout(timer.current)
    await flush()
  }
  // Ctrl/Cmd+Z outside a text box (where the browser's own undo applies).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const t = e.target
      if (t instanceof Element && (t.closest('input, textarea, select, [contenteditable="true"]'))) return
      e.preventDefault()
      undo()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return <p className="eotm-empty">Loading…</p>
  const type = schema.types[doc.type]
  const draftErrors = checkDocument(schema, doc.type, doc.data, { draft: true })
  // What is live of each section and row, by _id, for the "not live" badges.
  const live = doc.status === 'changed' ? liveById(doc.publishedData) : null
  const stateOf = (item) => (!live || !item?._id ? null : !live.has(item._id) ? 'new' : live.get(item._id) !== JSON.stringify(item) ? 'changed' : null)
  const ctx = { ...ctxBase, docId: doc.id, docType: doc.type, docData: doc.data, focus, focusAt, errors: [...draftErrors, ...serverErrors],
    stateOf, saveNow, onPick: onFocus }
  const trail = trailTo(schema, doc.data, focus)

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
        <span className={`eotm-chip is-${doc.status}`} title={STATUS_TITLE[doc.status]}>{STATUS_TEXT[doc.status]}</span>
        <div className="eotm-row">
          <button type="button" className="eotm-btn is-quiet" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" className="eotm-btn is-quiet" onClick={saveNow} title="Save now (it also saves by itself as you go)">Save</button>
          {/* A type outside release.types is not in Review changes, so it publishes here. */}
          {!inRelease(schema, doc.type) && doc.status !== 'published' && (
            <button type="button" className="eotm-btn is-primary" disabled={draftErrors.length > 0}
              title={draftErrors.length ? 'Fix what is named here first' : `Publish this ${type.label.toLowerCase()}`}
              onClick={() => act((d) => store.publish(id, d.version), `${type.label} published.`)}>Publish</button>
          )}
          {doc.status === 'changed' && <DiscardButton onConfirm={() => act((d) => store.discard(id, d.version), 'Back to what is live.')} />}
          {doc.status !== 'draft' && <button type="button" className="eotm-btn is-quiet" onClick={() => act((d) => store.unpublish(id, d.version), 'Taken off the site.')}>Unpublish</button>}
        </div>
      </div>
      {/* Page › Section › Object: where the pane is, each step a way back up.
          Each shows its kind (small) over its own words, so "Content section"
          is not read as part of the title. */}
      {trail.length > 0 && (
        <nav className="eotm-trail" aria-label="Where you are">
          <button type="button" className="eotm-crumb is-root" onClick={() => onFocus(null)} title={`Back up to the whole ${type.label.toLowerCase()}`}>
            <small>↑ {type.label}</small><span>{titleOf(schema, doc)}</span>
          </button>
          {trail.map((t, i) => (
            <React.Fragment key={t.id}>
              <span className="eotm-crumb-sep" aria-hidden="true">›</span>
              {i === trail.length - 1
                ? <span className="eotm-crumb is-here" aria-current="location"><small>{t.kind}</small><strong>{t.name || 'No title yet'}</strong></span>
                : <button type="button" className="eotm-crumb" onClick={() => onFocus(t.id)} title={`Back up to this ${t.kind.toLowerCase()}`}><small>{t.kind}</small><span>{t.name || 'No title yet'}</span></button>}
            </React.Fragment>
          ))}
          <Info label="What this trail is">{[
            ['Steps', 'Where you are, from the page down. Tap any step to go back up to it; what is below it folds away.'],
            ['Small word', 'What kind of thing it is: the template a section was made from (Content section), or an element (Button).'],
            ['Large words', 'Its own title or first words.'],
          ]}</Info>
        </nav>
      )}
      {only ? (
        <>
          {/* The view's own fields are what it is for, so a folded group opens. */}
          <FieldList fields={type.fields.filter((f) => only.includes(f.name) || f.added).map((f) => (f.collapsible ? { ...f, open: true } : f))} value={doc.data} onChange={change} ctx={ctx} at={`types.${doc.type}`} />
          {shared?.length > 0 && (
            <details className="eotm-group is-fold">
              <summary>Shared by every {type.label.toLowerCase()}</summary>
              <FieldList fields={type.fields.filter((f) => shared.includes(f.name))} value={doc.data} onChange={change} ctx={ctx} />
            </details>
          )}
        </>
      ) : type.fields.some((f) => f.kind === 'blocks') ? (
        <>
          {/* A page: its own settings folded above, so its sections come first. */}
          <details className="eotm-group is-fold eotm-doc-settings" open={!focus && !type.fields.some((f) => f.kind === 'blocks' && doc.data?.[f.name]?.length)}>
            <summary>{type.label} settings<Info label={`What ${type.label.toLowerCase()} settings are`}>{`This ${type.label.toLowerCase()}'s title, and how it shows in the site's menu.`}</Info></summary>
            <FieldList fields={type.fields.filter((f) => f.kind !== 'blocks')} value={doc.data} onChange={change} ctx={ctx} at={`types.${doc.type}`} />
          </details>
          <FieldList fields={type.fields.filter((f) => f.kind === 'blocks')} value={doc.data} onChange={change} ctx={ctx} at={`types.${doc.type}`} />
        </>
      ) : type.sections?.length ? (
        // A long settings form: each heading folds its fields, all closed, so
        // the list is one screen of headings (schema `sections`; data stays flat).
        [...type.sections, { label: 'More', fields: type.fields.map((f) => f.name).filter((n) => !type.sections.some((x) => x.fields.includes(n))) }]
          .filter((x) => x.fields.length)
          .map((x) => (
            <details key={x.label} className="eotm-group is-fold eotm-section-fold">
              <summary>{x.label}</summary>
              <FieldList fields={type.fields.filter((f) => x.fields.includes(f.name))} value={doc.data} onChange={change} ctx={ctx} at={`types.${doc.type}`} />
            </details>
          ))
      ) : <FieldList fields={type.fields} value={doc.data} onChange={change} ctx={ctx} at={`types.${doc.type}`} />}
      {/* The document's own elements (a library entry's), added in Arrange. */}
      {!only && doc.data?._elements?.length > 0 && (
        <Elements value={doc.data._elements} onChange={(els) => change({ ...doc.data, _elements: els })} ctx={ctx} path="_elements" />
      )}
      {doc.type === CLASS_TYPE && ctxBase.addClass && <AddClass onAdd={ctxBase.addClass} notify={notify} />}
      <div className="eotm-danger">
        <button type="button" className="eotm-btn is-quiet" onClick={async () => { try { onOpen(await store.duplicate(id)) } catch (e) { notify(e.message) } }}>Duplicate</button>
        <DeleteButton label={type.label} onConfirm={() => act((d) => store.remove(id, d.version), 'Deleted.')} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- nesting

const BADGE_TEXT = { new: 'New, not live', changed: 'Not live' }

// Every object with an _id in a document's live copy, as JSON, by _id.
function liveById(data) {
  const out = new Map()
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach(walk)
    if (v._id) out.set(v._id, JSON.stringify(v))
    Object.values(v).forEach(walk)
  }
  walk(data)
  return out
}

// What to call a section or a row of one: its own title, else its kind.
export function labelOf(schema, obj) {
  const own = obj.title || obj.heading || obj.label || obj.name || obj.text
  const kind = schema.blocks?.[obj._type]?.label
  if (own && kind) return `${kind}: ${own}`
  return own || kind || 'Item'
}

// What an item is and its own words, apart: a section's template and title,
// an element's kind and text.
function partsOfItem(schema, v) {
  if (schema.blocks?.[v._type]) return sectionParts(schema, v)
  if (ELEMENT_LABELS[v.kind]) return { kind: ELEMENT_LABELS[v.kind], name: v.text || v.label || v.image?.alt || '' }
  return { kind: 'Item', name: v.title || v.heading || v.label || v.name || v.text || '' }
}

// The sections of a document (its `blocks` fields), each with whether it is
// live: 'new', 'changed' or null.
function sectionsOf(schema, doc) {
  const fields = schema.types[doc.type]?.fields ?? []
  const live = doc.status === 'changed' ? liveById(doc.publishedData) : null
  const out = []
  for (const f of fields) {
    if (f.kind !== 'blocks') continue
    for (const b of doc.data?.[f.name] ?? []) {
      if (!b?._id) continue
      const state = !live ? null : !live.has(b._id) ? 'new' : live.get(b._id) !== JSON.stringify(b) ? 'changed' : null
      out.push({ id: b._id, label: labelOf(schema, b), state })
    }
  }
  return out
}

// The objects from the document down to the one with `id`: [{ id, label }].
function trailTo(schema, data, id) {
  if (!id) return []
  const path = []
  const walk = (v) => {
    if (!v || typeof v !== 'object') return false
    if (Array.isArray(v)) return v.some(walk)
    const mine = v._id ? { id: v._id, label: labelOf(schema, v), ...partsOfItem(schema, v) } : null
    if (mine) path.push(mine)
    if (v._id === id) return true
    if (Object.values(v).some(walk)) return true
    if (mine) path.pop()
    return false
  }
  return walk(data) ? path : []
}

// A class of the owner's own, named in their words.
function AddClass({ onAdd, notify }) {
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="eotm-group eotm-add-field" onSubmit={async (e) => {
      e.preventDefault()
      if (!label.trim()) return
      setBusy(true)
      try { await onAdd(label.trim()); setLabel('') } catch (err) { notify(err.message) } finally { setBusy(false) }
    }}>
      <p className="eotm-help">Add a class of your own: a look you can give to any element, and change in one place.</p>
      <div className="eotm-row">
        <input className="eotm-input" aria-label="Class name" placeholder="Class name, e.g. Gold call-out" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <button className="eotm-btn is-primary" disabled={busy || !label.trim()}>{busy ? 'Adding…' : 'Add class'}</button>
      </div>
    </form>
  )
}

// Review changes: every change not yet live, grouped by the page it shows on
// (collapsed until opened), each document's changed fields listed under it.
// Approving is reviewing, not publishing: a tick per change, Approve all for a
// document (a listing's card) and Approve all on this page. Ticks are kept in
// this browser against the document's version, so a later edit asks again.
// Publish puts a document live; Publish approved puts every fully approved
// one live. A listing posted on a Marketplace (schema release.push) offers it
// there too, ticked where it is posted, and sends through the site's push
// gate once live. A draft with a problem cannot publish and says why; a
// never-published draft cannot be discarded. The page is updated after each
// action (bridge.push). Visitors get a publish once the public API's 30 s
// cache refreshes.
const REVIEWED = 'eotm:reviewed'
const readReviewed = () => { try { return new Set(JSON.parse(localStorage.getItem(REVIEWED) ?? '[]')) } catch { return new Set() } }
const keepReviewed = (set) => { try { localStorage.setItem(REVIEWED, JSON.stringify([...set].slice(-2000))) } catch { /* private mode: kept for this dialog */ } }
const changeKey = (d, name) => `${d.id}@${d.version}:${name}`
const changesOf = (d) => (d.changes?.length ? d.changes : [{ name: '*', label: d.status === 'draft' ? 'New' : 'Changed' }])

function PublishDialog({ schema, store, bridge, notify, save, onClose, onChanged, getToken }) {
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(null) // the id being acted on, or 'all'
  const [armed, setArmed] = useState(null) // a Discard waiting for its second tap
  const [reviewed, setReviewed] = useState(readReviewed)
  const [markets, setMarkets] = useState({}) // doc id -> Marketplace keys to send to
  const reload = () => store.pending().then((r) => setPending(r.pending))
  useEffect(() => {
    let active = true
    Promise.resolve(save?.()).catch(() => {}).then(() => store.pending()).then((r) => active && setPending(r.pending)).catch((e) => { notify(e.message); onClose() })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(null), 4000); return () => clearTimeout(t) } }, [armed])
  const isHeld = (d) => d.errors.length > 0 || d.warnings.length > 0
  const isApproved = (d) => changesOf(d).every((c) => reviewed.has(changeKey(d, c.name)))
  const mark = (pairs, on) => setReviewed((prev) => {
    const next = new Set(prev)
    for (const [d, name] of pairs) {
      if (on) next.add(changeKey(d, name))
      else next.delete(changeKey(d, name))
    }
    keepReviewed(next)
    return next
  })
  const allOf = (docs) => docs.flatMap((d) => changesOf(d).map((c) => [d, c.name]))
  const chosen = (d) => markets[d.id] ?? d.markets ?? []
  const toggleMarket = (d, key) => setMarkets((m) => ({ ...m, [d.id]: chosen(d).includes(key) ? chosen(d).filter((k) => k !== key) : [...chosen(d), key] }))
  const groups = []
  for (const d of pending ?? []) {
    const name = d.page ?? schema.types[d.type]?.label ?? d.type
    let g = groups.find((x) => x.name === name)
    if (!g) { g = { name, docs: [] }; groups.push(g) }
    g.docs.push(d)
  }
  const ready = (pending ?? []).filter((d) => !isHeld(d) && isApproved(d))
  const changed = (pending ?? []).filter((d) => d.status === 'changed')
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`
  const run = async (key, fn) => {
    setBusy(key)
    setArmed(null)
    try { await fn() } catch (e) { notify(e.message) }
    await reload().catch((e) => notify(e.message))
    onChanged()
    setBusy(null)
  }
  // Sends a published listing to the Marketplaces ticked for it. The site's
  // push gate decides; its refusal (sync off, no link yet) is shown as said.
  const sendOn = async (d) => {
    const push = schema.types[d.type]?.release?.push
    const only = chosen(d)
    if (!push?.url || !only.length) return ''
    const names = only.map((k) => push.targets.find((t) => t.key === k)?.label ?? k).join(' and ')
    try {
      const token = await getToken?.()
      const res = await fetch(push.url.replace('{id}', encodeURIComponent(d.id)), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ only, confirm: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return ` Not sent to ${names}: ${body.error ?? `the site answered ${res.status}`}.`
      return ` Sent to ${names}.`
    } catch (e) {
      return ` Not sent to ${names}: ${e.message}.`
    }
  }
  const publishOne = (d) => run(d.id, async () => {
    bridge.push(await store.publish(d.id, d.version))
    notify(`Published ${d.title}; visitors see it within about a minute.${await sendOn(d)}`)
  })
  const discardOne = (d) => run(d.id, async () => {
    bridge.push(await store.discard(d.id, d.version))
    notify(`${d.title} is back to what is live.`)
  })
  const publishApproved = () => run('all', async () => {
    const done = []
    const sent = []
    for (const d of ready) {
      try {
        bridge.push(await store.publish(d.id, d.version))
        done.push(d)
        const said = await sendOn(d)
        if (said) sent.push(said.trim())
      } catch (e) { notify(`${d.title}: ${e.message}`) }
    }
    notify([`Published ${plural(done.length, 'change', 'changes')}; visitors see ${done.length === 1 ? 'it' : 'them'} within about a minute.`, ...sent].join(' '))
  })
  const discardAll = () => run('all', async () => {
    const r = await store.discardAll()
    for (const p of r.discarded ?? []) store.get(p.id).then((d) => bridge.push(d)).catch(() => {})
    notify(r.kept?.length ? `Discarded. ${plural(r.kept.length, 'never-published draft was', 'never-published drafts were')} kept.` : 'Discarded. The site is back to what is live.')
  })
  const tapDiscard = (key, go) => (armed === key ? go() : setArmed(key))
  const tick = (d, c) => {
    const on = reviewed.has(changeKey(d, c.name))
    return (
      <label key={c.name} className="eotm-review-change">
        <input type="checkbox" checked={on} onChange={() => mark([[d, c.name]], !on)} />
        <span>{c.label}</span>
        <span className={`eotm-chip ${on ? 'is-published' : 'is-changed'}`}>{on ? 'Approved' : 'To review'}</span>
      </label>
    )
  }
  const row = (d) => {
    const push = schema.types[d.type]?.release?.push
    const approved = isApproved(d)
    return (
      <li key={d.id} className="eotm-review-row">
        <div>
          <span>{d.title}</span> <span className={`eotm-chip is-${d.status}`}>{d.status === 'draft' ? 'New' : 'Changed'}</span>
          <div className="eotm-review-changes">{changesOf(d).map((c) => tick(d, c))}</div>
          {push && d.markets?.length > 0 && (
            <div className="eotm-review-markets">
              <span>When published, also send to</span>
              {push.targets.filter((t) => d.markets.includes(t.key)).map((t) => (
                <label key={t.key}><input type="checkbox" checked={chosen(d).includes(t.key)} onChange={() => toggleMarket(d, t.key)} /> {t.label}</label>
              ))}
            </div>
          )}
          {[...d.errors, ...d.warnings].map((m) => <p key={m} className="eotm-error">{m}</p>)}
        </div>
        <div className="eotm-row">
          <button type="button" className="eotm-btn" disabled={!!busy} onClick={() => mark(allOf([d]), !approved)}>{approved ? 'Unapprove' : 'Approve all'}</button>
          <button type="button" className="eotm-btn is-primary" disabled={!!busy || isHeld(d) || !approved} onClick={() => publishOne(d)}
            title={isHeld(d) ? 'Fix what is named here first' : !approved ? 'Approve each change first' : 'Put this change on the live site'}>{busy === d.id ? 'Working…' : 'Publish'}</button>
          {d.status === 'changed' && (
            <button type="button" className={`eotm-btn ${armed === d.id ? 'is-danger' : ''}`} disabled={!!busy} onClick={() => tapDiscard(d.id, () => discardOne(d))}
              title="Put this back to what is live">{armed === d.id ? 'Tap again to discard' : 'Discard'}</button>
          )}
        </div>
      </li>
    )
  }
  return (
    <div className="eotm-warn eotm-publish-dialog" role="alertdialog" aria-label="Review changes">
      <h2 className="eotm-review-title">Review changes</h2>
      {pending === null ? <p>Checking what has changed…</p> : !pending.length ? <p>Everything is live. There is nothing to review.</p> : (
        <>
          <p>{plural(pending.length, 'change is', 'changes are')} not live yet. Your edits show on this page; visitors see them only once published. Approve each change, then publish.</p>
          <div className="eotm-dev-list">
            {groups.map((g) => {
              const done = g.docs.filter(isApproved).length
              return (
                <details key={g.name} className="eotm-review-group">
                  <summary>
                    <span>{g.name}</span>
                    <span className="eotm-review-count">{done} of {g.docs.length} approved</span>
                  </summary>
                  <button type="button" className="eotm-btn is-quiet" disabled={!!busy} onClick={() => mark(allOf(g.docs), done < g.docs.length)}>
                    {done < g.docs.length ? 'Approve all on this page' : 'Unapprove all on this page'}
                  </button>
                  <ul>{g.docs.map(row)}</ul>
                </details>
              )
            })}
          </div>
        </>
      )}
      <div className="eotm-row">
        {ready.length > 0 && <button type="button" className="eotm-btn is-primary" disabled={!!busy} onClick={publishApproved}>{busy === 'all' ? 'Working…' : `Publish approved (${ready.length})`}</button>}
        {changed.length > 1 && (
          <button type="button" className={`eotm-btn ${armed === 'all' ? 'is-danger' : ''}`} disabled={!!busy} onClick={() => tapDiscard('all', discardAll)}>
            {armed === 'all' ? 'Tap again to discard all' : `Discard all ${changed.length}`}
          </button>
        )}
        <button type="button" className="eotm-btn" disabled={!!busy} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// Throw away the unpublished edits; two taps, like Delete.
function DiscardButton({ onConfirm, label = 'Discard changes' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) } }, [armed])
  return (
    <button type="button" className={`eotm-btn ${armed ? 'is-danger' : 'is-quiet'}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Tap again to discard your changes' : label}
    </button>
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
