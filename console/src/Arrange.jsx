import React, { useEffect, useRef, useState } from 'react'
import { toUnits, toFree, setPart, setHeight, dragPart, pinchPart, restack, COLUMNS } from './arrange.js'
import { newId } from '../schema/schema.js'
import { canCarry } from '../schema/classes.js'
import { newElement, copyElement } from '../schema/elements.js'
import { prepareImage } from './images.js'
import { TEXT, startTyping } from './Targets.jsx'

// Arrange mode (StoryShaped ADR-0010), drawn as Canva and Wix draw a
// selection: a tap picks what is under it (a card, the picture or button in
// it, a part of a section, a section), outlined solid. Nothing else is written
// on the page: names, classes and fields are the editor pane's.
//
//   Handles: three, small: the right side (width), the bottom (height) and the
//   bottom-right corner (both). A section's are its height and its width.
//   The panel beside the selection, never over the editor pane or off screen:
//     Layers (the stack icon): up brings the pick forward, to what is on it
//       (a card's picture and button); down goes back, to what holds it. While
//       open, everything on the same layer is outlined dotted and a tap picks
//       among them; tapping again where several overlap goes to the next.
//     Controls: cards. A part: opacity, front and back, snap or free placing,
//       and More (fit, duplicate, template, class). A section: Flow or Free,
//       how a phone shows it, add a part, placing.
//     Edit: open it in the editor (text starts typing where it stands).
//
// Every change is an updater of the section's `_layout`, written through the
// editor like a drag-to-size (App's resizeTarget), so it saves, undoes and
// previews like any edit. Measurements are taken from the page as drawn, so a
// section a phone has zoomed down (ScaleBox) is arranged in the same units.

// Anything marked as showing a document, a section of a page or a whole
// document (a site's button bar, its header): what holds parts is arranged.
const SECTION = '[data-eotm-edit]'
const PART = '[data-eotm-part]'
const SNAP_KEY = 'eotm:snap'
const PROMPT_KEY = 'eotm:arrange-prompt'
const PHONE = '(max-width: 819.98px)'
// A tablet held upright: wider than a phone, narrower than a desktop.
const TABLET_UPRIGHT = '(min-width: 820px) and (max-width: 1279.98px) and (orientation: portrait)'
// The three handles: the right side, the bottom, and the corner for both.
const HANDLES = ['e', 's', 'se']

const readSnap = () => { try { return localStorage.getItem(SNAP_KEY) !== 'free' } catch { return true } }
// A section the page shows but the document does not have yet:
//   data-eotm-add="<block type>"  data-eotm-at="<index>"  data-eotm-seed='<json>'
// Selecting it adds that section there, filled from the seed (Editor addBlock).
const addOf = (el) => {
  if (!el.dataset.eotmAdd) return {}
  let seed = {}
  try { seed = JSON.parse(el.dataset.eotmSeed || '{}') } catch { /* no seed */ }
  return { add: { type: el.dataset.eotmAdd, at: Number(el.dataset.eotmAt ?? 0), seed, field: el.dataset.eotmField || null } }
}
const targetOf = (el) => {
  const [type, ...rest] = (el.dataset.eotmEdit ?? '').split(':')
  return { type, key: rest.join(':'), item: el.dataset.eotmItem || null, ...addOf(el) }
}
// The section a part belongs to. A part that is a section itself (a design,
// which arranges its own pieces) is a part of the section around it.
const ownerOf = (p) => (p.matches(SECTION) ? p.parentElement?.closest(SECTION) : p.closest(SECTION))
const partsOf = (section) => [...section.querySelectorAll(PART)].filter((p) => ownerOf(p) === section)
const isSection = (el) => el && (el.hasAttribute('data-eotm-frame') || partsOf(el).length > 0)
// Whether this screen arranges the section's phone layout: on a phone, unless
// the section shows the desktop layout scaled down there (then it is that
// one, in the same units).
const phoneEdit = (section) => matchMedia(PHONE).matches && section?.dataset.eotmPhone !== 'scale'
const isFree = (section) => (phoneEdit(section) ? section?.dataset.eotmPhone === 'free' : section?.dataset.eotmFrame === 'free')
// Where the arrangement is kept: _layout, or _layout_<key> for one of several
// regions of one document (data-eotm-frame-key: a site's header, its button bar).
const layoutField = (section) => (section.dataset.eotmFrameKey ? `_layout_${section.dataset.eotmFrameKey}` : '_layout')
const isText = (part) => !part.querySelector('img, svg, video, picture, canvas')

// The page block holding a section (data-eotm-block inside data-eotm-layout):
// how many of 12 columns it takes is the page's layout document, not the section.
const blockOf = (section) => {
  const b = section.closest('[data-eotm-block]')
  return b?.parentElement?.hasAttribute('data-eotm-layout') ? b : null
}
// A layout value with one block's width changed: the saved order, then any
// block the page has that it does not name (as Layout.jsx resolves it).
const spanIn = (old, keys, key, span) => {
  const list = (Array.isArray(old) ? old : []).filter((b) => keys.includes(b?.key))
  for (const k of keys) if (!list.some((b) => b.key === k)) list.push({ key: k, span: 12 })
  return list.map((b) => (b.key === key ? { ...b, span } : b))
}
const MIN_SPAN = 3

// What turns a Flow section Free, measured as it is drawn now: an updater that
// leaves a layout already Free alone. Every handle and nudge goes through it,
// so any section can be arranged without switching it to Free first.
function freer(section) {
  if (isFree(section)) return (old) => old
  const phone = phoneEdit(section)
  const s = section.getBoundingClientRect()
  const measured = {}
  for (const p of partsOf(section)) {
    const n = p.dataset.eotmPart
    const r = rectOf(p)
    if (!measured[n] && (r.width || r.height)) measured[n] = toUnits(r, s)
  }
  const height = (s.height * 100) / (s.width || 1)
  return (old) => ((phone ? old?.phone === 'free' : old?.mode === 'free') ? old : toFree(old, measured, height, { phone }))
}

// A part's box. A group (data-eotm-group) is no box of its own while it
// flows, so it is the box around what it holds.
function rectOf(el) {
  const r = el.getBoundingClientRect()
  if (r.width || r.height || !el.children.length) return r
  let box = null
  for (const c of el.children) {
    const b = rectOf(c)
    if (!b.width && !b.height) continue
    box = box ? { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), right: Math.max(box.right, b.right), bottom: Math.max(box.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
  }
  return box ? { ...box, width: box.right - box.left, height: box.bottom - box.top } : r
}

// A part's position as drawn now, with what it keeps of its own (set height,
// text size) read from the variables the site set from its `_layout`.
function partNow(part, section) {
  const s = section.getBoundingClientRect()
  const u = toUnits(rectOf(part), s)
  const v = (k) => part.style.getPropertyValue(k)
  const q = phoneEdit(section) ? 'q' : '' // the phone layout's variables are --q*
  const p = { x: u.x, y: u.y, w: u.w, drawnH: u.h }
  if (v(`--${q}ph`)) p.h = parseFloat(v(`--${q}ph`))
  if (v(`--${q}fs`)) p.fs = parseFloat(v(`--${q}fs`))
  return p
}

// One of the site's own parts as an element with its content: a photo, a
// button (its text and link), or text (a heading stays a heading).
function elementFromPart(part, id) {
  const img = part.querySelector('img')
  if (img) return newElement('image', id, { image: { src: img.getAttribute('src'), alt: img.getAttribute('alt') ?? '' } })
  const link = part.matches('a, button') ? part : part.querySelector('a, button')
  const text = (part.innerText ?? part.textContent ?? '').trim()
  if (link && text.length <= 60) return newElement('button', id, { label: text, url: link.getAttribute?.('href') || '/' })
  const tag = part.matches('h1, h2') || part.querySelector('h1, h2') ? 'h2' : part.matches('h3, h4') || part.querySelector('h3, h4') ? 'h3' : 'p'
  return newElement('text', id, { text, tag })
}

// Layers: what can be picked, one inside another. The marked sections and
// parts, a card (data-eotm-holds, a place that holds objects) and the pieces
// of a card (its picture, its lines of text, its button), which the site does
// not mark as parts. A plain holder (a page's layout cell, a whole page around
// its sections) is no layer of its own.
const MARK = `${SECTION}, ${PART}`
const HOLDS = '[data-eotm-holds]'
const LEAF = 'img, video, [data-eotm-text], [data-eotm-richtext], .btn'
const NODE = `${MARK}, ${HOLDS}, ${LEAF}`
const layerSkip = (n) => !n.matches(PART) && !isSection(n) && !!n.querySelector(MARK)
const isNode = (n) => {
  if (!n || n.closest('.eotm-root')) return false
  if (n.matches(MARK)) return !layerSkip(n)
  if (n.matches(HOLDS)) return true
  return !!n.parentElement?.closest(`${MARK}, ${HOLDS}`)?.matches(HOLDS)
}
const layerUp = (n) => {
  let p = n?.parentElement?.closest(NODE)
  while (p && !isNode(p)) p = p.parentElement?.closest(NODE)
  return p ?? null
}
const layerKids = (n) => [...(n ?? document.body).querySelectorAll(NODE)]
  .filter((k) => isNode(k) && layerUp(k) === (n ?? null) && rectOf(k).width > 0)
// What is under the point pressed, innermost first.
const chainAt = (t) => {
  const out = []
  for (let p = t?.closest?.(NODE); p; p = p.parentElement?.closest(NODE)) if (isNode(p)) out.push(p)
  return out
}
// The section a pick belongs to, and the part of it the pick is (moved and sized).
const sectionAround = (n) => { let s = n?.closest(SECTION); while (s && !isSection(s)) s = s.parentElement?.closest(SECTION); return s ?? null }
const selFor = (n) => {
  if (n.matches(PART) && ownerOf(n) && isSection(ownerOf(n))) return { node: n, section: ownerOf(n), part: n }
  if (isSection(n)) return { node: n, section: n, part: null }
  return { node: n, section: sectionAround(n), part: null }
}
const inside = (r, x, y) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height

// What to tell the owner about the screen they arrange on, once a visit each.
function promptFor() {
  if (matchMedia(PHONE).matches) return { key: 'phone', text: 'Edits on a phone change the phone view only. To arrange the desktop layout, turn your phone sideways or set the page to Desktop width.' }
  if (matchMedia(TABLET_UPRIGHT).matches) return { key: 'tablet', text: 'Turn to landscape to arrange the layout larger screens show.' }
  return null
}
const seen = (key) => { try { return sessionStorage.getItem(`${PROMPT_KEY}:${key}`) } catch { return false } }

// `uiScale`: how much the page is scaled down (App's page width); the panel,
// prompt and handles are drawn that much larger so they keep their size on
// screen. CSS zoom also scales an element's offsets, so its position is divided.
const ui = (k, top, left) => (k > 1 ? { zoom: k, top: top / k, left: left / k } : { top, left })

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
)
const ICONS = {
  layers: ['M12 3 2 8l10 5 10-5-10-5Z', 'm2 13 10 5 10-5', 'm2 17.5 10 5 10-5'],
  controls: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  up: ['M12 19V5', 'm5 12 7-7 7 7'],
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
  front: ['M8 8h12v12H8Z', 'M4 16V4h12'],
  back: ['M4 4h12v12H4Z', 'M20 8v12H8'],
}

function Btn({ icon, label, on, onClick, disabled }) {
  return <button type="button" className={`eotm-arrange-icon${on ? ' is-on' : ''}`} aria-label={label} title={label} aria-pressed={on ?? undefined} disabled={disabled} onClick={onClick}><Icon d={ICONS[icon]} /></button>
}
function Seg({ label, value, options, onPick }) {
  return (
    <div className="eotm-seg eotm-arrange-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onPick(v)}>{l}</button>)}
    </div>
  )
}

export default function Arrange({ onChange, uiScale = 1, upload, notify = () => {}, templates = [], onSaveTemplate, layoutFor = null, onSelect, onEdit = null, onText = null, onImport = null, tools = true, classes = [], addClass = null }) {
  // Which of the panel's buttons is open: 'layers', 'controls' or none.
  const [open, setOpen] = useState(null)
  const [classing, setClassing] = useState(false)
  // A press on what is already picked with Layers open: a tap there (no drag)
  // goes to the next thing on the layer under the finger.
  const press = useRef(null)
  const [sel, setSel] = useState(null) // { node, section, part }
  const [, setFrame] = useState(0)
  const [snap, setSnap] = useState(readSnap)
  const [drag, setDrag] = useState(null) // { kind } while dragging
  // What Arrange does, across the top until closed or something is picked;
  // once a visit. A phone or upright tablet adds what its screen arranges.
  const [intro, setIntro] = useState(() => tools && !seen('intro'))
  const [note, setNote] = useState(promptFor)
  // The screen can turn or the page change width while arranging.
  useEffect(() => {
    const on = () => setNote(promptFor())
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  const closeIntro = () => {
    try { sessionStorage.setItem(`${PROMPT_KEY}:intro`, '1') } catch { /* shown again next time */ }
    setIntro(false)
  }
  const latest = useRef({})
  latest.current = { sel, snap, onChange, onSelect, onText, tools, open }

  // A change written at once (not once a frame): an element and its place.
  const writeNow = (section, field, fn) => latest.current.onChange({ ...targetOf(section), field, value: fn })
  // The element just added or copied, selected when the page has drawn it.
  const pick = useRef(null)
  const [naming, setNaming] = useState(false)
  const barRef = useRef(null)

  // Write an updater of the section's _layout, at most once a frame.
  const queued = useRef(null)
  const write = (section, fn) => {
    const first = !queued.current
    queued.current = { section, fn }
    if (!first) return
    requestAnimationFrame(() => {
      const q = queued.current
      queued.current = null
      latest.current.onChange({ ...targetOf(q.section), field: layoutField(q.section), value: q.fn })
    })
  }

  // A part dragged by its body, a handle or two fingers. A Flow section turns
  // Free on the first real movement, so a plain click only selects.
  const startDrag = (section, part, handle, e) => {
    const name = part.dataset.eotmPart
    const start = partNow(part, section)
    const width = section.getBoundingClientRect().width
    const text = isText(part)
    const ratio = start.drawnH && start.w ? start.drawnH / start.w : null
    const phone = phoneEdit(section)
    const free = freer(section)
    const pointers = new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]])
    let pinch = null
    let moved = handle !== 'move'
    if (moved) setDrag({ kind: handle })
    const move = (ev) => {
      if (!pointers.has(ev.pointerId)) return
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return
      if (!moved) { moved = true; setDrag({ kind: handle }) }
      let next
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        pinch ??= d
        next = pinchPart(start, d / (pinch || 1), { text })
      } else {
        const p = pointers.get(e.pointerId) ?? [...pointers.values()][0]
        next = dragPart(start, handle, p.x - e.clientX, p.y - e.clientY, { width, snap: latest.current.snap, text, ratio })
      }
      const { drawnH, ...patch } = next // eslint-disable-line no-unused-vars
      write(section, (old) => setPart(free(old), name, patch, { phone }))
    }
    const down = (ev) => { if (pointers.size < 2) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }) }
    const end = (ev) => {
      pointers.delete(ev.pointerId)
      if (pointers.size) return
      if (moved) press.current = null
      setDrag(null)
      removeEventListener('pointerdown', down, true)
      removeEventListener('pointermove', move, true)
      removeEventListener('pointerup', end, true)
      removeEventListener('pointercancel', end, true)
    }
    addEventListener('pointerdown', down, true)
    addEventListener('pointermove', move, true)
    addEventListener('pointerup', end, true)
    addEventListener('pointercancel', end, true)
  }

  // What a pick opens in the pane: its document, the row it is in (a card's
  // id, a button's own row) and the field it shows.
  // `from`: what was pressed, when it is inside the pick (a button in a bar of them).
  const targetFor = (n, from = null) => {
    const marked = n.closest(SECTION)
    if (!marked) return null
    const at = from && n.contains(from) ? from : n
    const row = at.closest('[data-eotm-in]')
    const card = at.closest(HOLDS)
    const f = at.closest('[data-eotm-field], [data-eotm-text], [data-eotm-richtext]')
    const item = (row && marked.contains(row) ? row.dataset.eotmIn : null) ?? (card && marked.contains(card) ? card.dataset.eotmHolds : null)
    const field = f && marked.contains(f) ? (f.dataset.eotmField ?? f.dataset.eotmText ?? f.dataset.eotmRichtext ?? null) : null
    return { ...targetOf(marked), ...(item ? { item } : {}), field }
  }
  const choose = (n, from = null) => {
    if (!n) return
    closeIntro()
    setSel(selFor(n))
    const t = targetFor(n, from)
    if (t) latest.current.onSelect?.(t)
  }

  // The page: a press picks what is under it (and on a part starts moving it);
  // clicks are the editor's while arranging, so links do not navigate.
  useEffect(() => {
    document.documentElement.classList.add('eotm-arranging')
    const onPage = (t) => t instanceof Element && !t.closest('.eotm-root')
    const typing = (t) => t instanceof Element && t.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')
    const down = (e) => {
      if (!onPage(e.target) || typing(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return
      const cur = latest.current.sel
      // A second finger on the picked part is a pinch, handled by its drag.
      if (cur?.part && e.target.closest(PART) === cur.part && document.querySelector('.eotm-arrange.is-dragging')) return
      const chain = chainAt(e.target)
      if (!chain.length) { if (cur) setSel(null); return }
      e.preventDefault()
      e.stopPropagation()
      let n = chain[0]
      press.current = null
      // Layers open: the press picks among what is on the picked one's layer,
      // the topmost under the finger first.
      if (latest.current.open === 'layers' && cur?.node?.isConnected) {
        const stack = document.elementsFromPoint(e.clientX, e.clientY)
        const at = (k) => stack.findIndex((el) => k.contains(el))
        const hits = layerKids(layerUp(cur.node)).filter((k) => inside(rectOf(k), e.clientX, e.clientY) && at(k) >= 0).sort((a, b) => at(a) - at(b))
        if (hits.length) {
          n = hits.includes(cur.node) ? cur.node : hits[0]
          if (n === cur.node && hits.length > 1) press.current = { hits, n, x: e.clientX, y: e.clientY }
        }
      }
      if (n !== cur?.node) choose(n, e.target)
      const s = selFor(n)
      if (s.part && latest.current.tools) startDrag(s.section, s.part, 'move', e)
    }
    const click = (e) => {
      if (!onPage(e.target) || typing(e.target) || !chainAt(e.target).length) return
      e.preventDefault()
      e.stopPropagation()
      const p = press.current
      press.current = null
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) choose(p.hits[(p.hits.indexOf(p.n) + 1) % p.hits.length])
    }
    const key = (e) => {
      const { sel: s } = latest.current
      if (!s) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') { setSel(null); setOpen(null); return }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!step || !s.part || !latest.current.tools) return
      e.preventDefault()
      const px = e.shiftKey ? 10 : 1
      const start = partNow(s.part, s.section)
      const width = s.section.getBoundingClientRect().width
      const { drawnH, ...next } = dragPart(start, 'move', step[0] * px, step[1] * px, { width, snap: false }) // eslint-disable-line no-unused-vars
      const free = freer(s.section)
      write(s.section, (old) => setPart(free(old), s.part.dataset.eotmPart, next, { phone: phoneEdit(s.section) }))
    }
    // A double-click on text types it where it stands, its field open in the
    // pane (Targets' startTyping).
    const dbl = (e) => {
      const typed = latest.current.onText
      const node = typed && onPage(e.target) ? e.target.closest(TEXT) : null
      if (!node || node.isContentEditable) return
      e.preventDefault()
      e.stopPropagation()
      setSel(null)
      startTyping(node, typed)
      const owner = node.closest(SECTION)
      if (owner) latest.current.onSelect?.({ ...targetOf(owner), item: node.dataset.eotmIn || owner.dataset.eotmItem || null, field: node.hasAttribute('data-eotm-text') ? node.dataset.eotmText : node.dataset.eotmRichtext })
    }
    addEventListener('pointerdown', down, true)
    addEventListener('click', click, true)
    addEventListener('dblclick', dbl, true)
    addEventListener('keydown', key)
    return () => {
      document.documentElement.classList.remove('eotm-arranging')
      removeEventListener('pointerdown', down, true)
      removeEventListener('click', click, true)
      removeEventListener('dblclick', dbl, true)
      removeEventListener('keydown', key)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the page: scrolling, resizing, and the page redrawing from each
  // write. A pick the page re-rendered is found again by its name.
  useEffect(() => {
    if (!sel) return undefined
    let frame = 0
    const tick = () => {
      setSel((s) => {
        if (!s) return s
        let section = s.section
        if (section && !section.isConnected) {
          const again = section.dataset.eotmItem ? `[data-eotm-item="${section.dataset.eotmItem}"]` : `[data-eotm-edit="${section.dataset.eotmEdit}"]:not([data-eotm-item])`
          section = document.querySelector(again)
        }
        let part = s.part && section && (s.part.isConnected ? s.part : partsOf(section).find((p) => p.dataset.eotmPart === s.part.dataset.eotmPart))
        if (section && pick.current && pick.current.section.dataset.eotmItem === section.dataset.eotmItem) {
          const fresh = partsOf(section).find((p) => p.dataset.eotmPart === pick.current.name)
          if (fresh) { pick.current = null; part = fresh }
        }
        let node = part || (s.node.isConnected ? s.node : null)
        if (!node && s.node.dataset.eotmHolds) node = document.querySelector(`[data-eotm-holds="${CSS.escape(s.node.dataset.eotmHolds)}"]`)
        if (!node && s.node === s.section) node = section
        if (!node) return null
        return node === s.node && section === s.section && (part ?? null) === s.part ? s : { node, section, part: part ?? null }
      })
      setFrame((n) => n + 1)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [!!sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // The page says what moves: the move cursor over parts while arranging
  // (console.css), the picked part dragged rather than scrolled by a finger,
  // and the drag's own cursor while one runs.
  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('eotm-arrange-tools', !!tools)
    return () => html.classList.remove('eotm-arrange-tools')
  }, [tools])
  useEffect(() => {
    const p = sel?.part
    if (!p) return undefined
    p.setAttribute('data-eotm-picked', '')
    return () => p.removeAttribute('data-eotm-picked')
  }, [sel?.part])
  useEffect(() => {
    const html = document.documentElement
    if (drag) html.dataset.eotmDragging = drag.kind
    else delete html.dataset.eotmDragging
    return () => { delete html.dataset.eotmDragging }
  }, [drag?.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setClassing(false); setNaming(false); setOpen((o) => (o === 'controls' ? null : o)) }, [sel?.node]) // eslint-disable-line react-hooks/exhaustive-deps
  const setSnapTo = (on) => {
    try { localStorage.setItem(SNAP_KEY, on ? 'snap' : 'free') } catch { /* kept for this visit only */ }
    setSnap(on)
  }
  // Centered on the page beside a pane docked on the right, not under it.
  const introLeft = () => {
    const pane = document.querySelector('.eotm-sheet.is-wide:not(.is-bar)')
    return (pane ? Math.min(innerWidth, pane.getBoundingClientRect().left) : innerWidth) / 2
  }
  const tap = matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click'
  const banner = intro && tools && (
    <div className="eotm-arrange-prompt" role="status" style={{ ...ui(uiScale, 12, introLeft()), maxWidth: Math.min(560, introLeft() * 2 - 24) / uiScale }}>
      <p><b>Mode: Arrange.</b> {tap} anything to drag or resize it. Change layers up or down with <Icon d={ICONS.layers} />. For more controls, {tap.toLowerCase()} <Icon d={ICONS.controls} />. For detailed editing, {tap.toLowerCase()} <Icon d={ICONS.edit} /> Edit.</p>
      {note && <p>{note.text}</p>}
      <button type="button" className="eotm-arrange-prompt-x" aria-label="Close" onClick={closeIntro}>✕</button>
    </div>
  )
  if (!sel) return <div className="eotm-target eotm-arrange">{banner}</div>

  const { node: here, section, part } = sel
  const box = rectOf(here)
  const s = section?.getBoundingClientRect()
  const free = section ? isFree(section) : false
  const phone = section ? phoneEdit(section) : false
  const desktopFree = section?.dataset.eotmFrame === 'free'
  const phoneMode = section?.dataset.eotmPhone ?? 'stack'
  const name = part?.dataset.eotmPart
  const isSec = !!section && here === section
  // Where the page shows: left of a pane docked on the right, above one docked at the bottom.
  const sheet = document.querySelector('.eotm-sheet.is-wide:not(.is-bar)')
  const room = sheet ? Math.min(innerWidth, sheet.getBoundingClientRect().left) : innerWidth
  const floor = sheet ? innerHeight : Math.min(innerHeight, document.querySelector('.eotm-sheet:not(.is-wide)')?.getBoundingClientRect().top ?? innerHeight)
  // Not drawn over the editor pane: what is under it is hidden, not outlined through it.
  const clip = `inset(0px ${Math.max(0, innerWidth - room)}px ${Math.max(0, innerHeight - floor)}px 0px)`

  // The panel: beside the pick, right of it when there is room before the
  // pane, else left of it, else inside the screen's edge; level with its top,
  // kept whole on screen. Its open card opens on the side away from the pick.
  const barW = (barRef.current?.offsetWidth ?? 48) * uiScale
  const barH = (barRef.current?.offsetHeight ?? 132) * uiScale
  const rightOk = box.left + box.width + 10 + barW <= room - 8
  const leftOk = box.left - 10 - barW >= 8
  const side = rightOk || !leftOk ? 'right' : 'left'
  const barLeft = rightOk ? box.left + box.width + 10 : leftOk ? box.left - 10 - barW : Math.max(8, room - barW - 8)
  const barTop = Math.max(8, Math.min(box.top, floor - barH - 8))
  const maxH = Math.max(120, (floor - 16) / uiScale)

  const opacity = part ? Math.round((parseFloat(part.style.getPropertyValue(phone ? '--qo' : '--o')) || 1) * 100) : 100
  const setPhone = (v) => write(section, (old) => ({ ...old, phone: v }))
  const toFreeNow = () => write(section, freer(section))

  // Layers: forward is what is on the pick (inside it), back is what holds it.
  const fwd = open === 'layers' ? layerKids(here) : []
  const back = layerUp(here)
  const onLayer = open === 'layers' && !drag ? layerKids(back).filter((n) => n !== here).slice(0, 60) : []

  // The part's class, for "Same for every": the first whose selector it is drawn with.
  const matches = (el, q) => { try { return !!el && (el.matches(q) || !!el.firstElementChild?.matches(q)) } catch { return false } }
  const cls = part ? classes.find((c) => c.base && matches(part, c.selector)) ?? classes.find((c) => matches(part, c.selector)) ?? null : null
  const saveForClass = () => {
    const n = partNow(part, section)
    const vals = { w: n.w, h: n.h ?? null, fs: n.fs ?? null, opacity: opacity === 100 ? null : opacity }
    let count = 0
    for (const sec of document.querySelectorAll(SECTION)) {
      if (sec.closest('.eotm-root') || !isFree(sec)) continue
      const others = partsOf(sec).filter((p) => p !== part && matches(p, cls.selector)).map((p) => p.dataset.eotmPart)
      if (!others.length) continue
      count += others.length
      const ph = phoneEdit(sec)
      writeNow(sec, layoutField(sec), (old) => others.reduce((o, id) => setPart(o, id, vals, { phone: ph }), old))
    }
    notify(count ? `Copied to ${count} more ${cls.label.toLowerCase()} on this page.` : `No other ${cls.label.toLowerCase()} in a Free section on this page.`)
  }
  const saveAsClass = async (label) => {
    try {
      const made = await addClass(label, canCarry(cls) ? cls.name : null)
      if (!made) return
      writeNow(section, '_elements', (old) => (Array.isArray(old) ? old.map((e) => (e?._id === name ? { ...e, class: made } : e)) : old))
      setClassing(false)
    } catch (err) { notify(err.message) }
  }

  // Elements: a section, a row or a whole document holds them; a region of a
  // document (its header, its button bar, data-eotm-frame-key) does not.
  const holdsElements = !!section && !section.dataset.eotmFrameKey
  // Where a new element goes in a Free section: across the middle, in view.
  const spot = () => {
    const mid = Math.min(Math.max(innerHeight / 2, s.top), s.top + s.height) - s.top
    return { x: 30, y: Math.max(0, Math.round(((mid * 100) / (s.width || 1)) * 100) / 100), w: 40 }
  }
  const addElement = (el, at = spot()) => {
    writeNow(section, '_elements', (old) => [...(Array.isArray(old) ? old : []), el])
    if (free) writeNow(section, layoutField(section), (old) => setPart(old, el._id, at, { phone }))
    pick.current = { section, name: el._id }
  }
  const addPhoto = async (file) => {
    if (!file || !upload) return
    try {
      const { blob, width, height } = await prepareImage(file)
      const src = await upload(blob)
      addElement(newElement('image', newId(), { image: { src, width, height, alt: '' } }))
    } catch (e) { notify(e.message) }
  }
  const duplicate = () => {
    const id = newId()
    const at = (() => { const n = partNow(part, section); return { x: n.x + 3, y: n.y + 3, w: n.w, ...(n.h != null ? { h: n.h } : {}), ...(n.fs != null ? { fs: n.fs } : {}) } })()
    if (part.hasAttribute('data-eotm-element')) {
      writeNow(section, '_elements', (old) => {
        const list = Array.isArray(old) ? old : []
        const src = list.find((e) => e?._id === name)
        return src ? [...list, copyElement(src, id)] : list
      })
      if (free) writeNow(section, layoutField(section), (old) => setPart(old, id, at, { phone }))
      pick.current = { section, name: id }
    } else {
      addElement(elementFromPart(part, id), at)
    }
  }

  const heightDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const startY = e.clientY
    const startH = (s.height * 100) / (s.width || 1)
    const freeIt = freer(section)
    setDrag({ kind: 'height' })
    const move = (ev) => {
      const h = Math.max(1, Math.min(1000, startH + ((ev.clientY - startY) * 100) / (s.width || 1)))
      write(section, (old) => setHeight(freeIt(old), h, { phone }))
    }
    const end = () => {
      setDrag(null)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  // The section's width: its block's columns of 12 in the page's layout
  // document (found or started by layoutFor), written as the edge moves.
  const block = isSec && layoutFor ? blockOf(section) : null
  const grid = block?.parentElement
  const sizable = grid && getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length >= COLUMNS
  const widthDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const colW = grid.getBoundingClientRect().width / COLUMNS
    const w0 = block.getBoundingClientRect().width
    const x0 = e.clientX
    const keys = [...grid.querySelectorAll(':scope > [data-eotm-block]')].map((b) => b.dataset.eotmBlock)
    const key = block.dataset.eotmBlock
    const ready = layoutFor(location.pathname).catch((err) => { notify(err.message); return null })
    let last = Number(block.dataset.eotmSpan) || COLUMNS
    setDrag({ kind: 'width' })
    const move = (ev) => {
      const span = Math.max(MIN_SPAN, Math.min(COLUMNS, Math.round((w0 + ev.clientX - x0) / colW)))
      if (span === last) return
      last = span
      ready.then((t) => t && onChange({ type: t.type, key: t.key, item: null, field: t.field, value: (old) => spanIn(old, keys, key, span) }))
    }
    const end = () => {
      setDrag(null)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  // Edit: open the pick in the pane; text types where it stands.
  const edit = () => {
    const t = targetFor(here)
    const text = here.matches(TEXT) ? here : here.querySelectorAll(TEXT).length === 1 ? here.querySelector(TEXT) : null
    if (text && onText && !text.isContentEditable) {
      setSel(null)
      setOpen(null)
      startTyping(text, onText)
      const owner = text.closest(SECTION)
      if (owner) (onEdit ?? onSelect)?.({ ...targetOf(owner), item: text.dataset.eotmIn || owner.dataset.eotmItem || null, field: text.dataset.eotmText ?? text.dataset.eotmRichtext })
      return
    }
    if (t) (onEdit ?? onSelect)?.(t)
  }
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const placing = (
    <section className="eotm-arrange-card"><h4>Placing</h4>
      <Seg label="Placing" value={snap ? 'snap' : 'free'} options={[['free', 'Free form'], ['snap', 'Snap to grid']]} onPick={(v) => setSnapTo(v === 'snap')} />
    </section>
  )

  const handles = !tools || drag?.kind === 'width' || drag?.kind === 'height' ? null : part ? HANDLES.map((h) => {
    const x = h.includes('e') ? box.left + box.width : box.left + box.width / 2
    const y = h.includes('s') ? box.top + box.height : box.top + box.height / 2
    return <button key={h} type="button" className={`eotm-arrange-handle is-${h}`} style={ui(uiScale, y, x)} aria-label={{ e: 'Drag to change the width', s: 'Drag to change the height', se: 'Drag to change both' }[h]}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag(section, part, h, e) }} />
  }) : isSec ? (
    <>
      <button type="button" className="eotm-arrange-handle is-s" style={ui(uiScale, s.top + s.height, s.left + s.width / 2)} aria-label="Drag to change the section’s height" onPointerDown={heightDrag} />
      {block && sizable && <button type="button" className="eotm-arrange-handle is-e" style={ui(uiScale, Math.max(box.top, 0) + Math.min(box.height, innerHeight - Math.max(box.top, 0)) / 2, Math.min(block.getBoundingClientRect().right, room - 12))}
        aria-label="Drag to change the section’s width" onPointerDown={widthDrag} />}
    </>
  ) : null

  return (
    <div className={`eotm-target eotm-arrange${drag ? ' is-dragging' : ''}`} style={{ clipPath: clip }}>
      {banner}
      {drag && snap && s && (
        <div className="eotm-target-grid" style={{ top: s.top, left: s.left, width: s.width, height: s.height }}>
          {Array.from({ length: COLUMNS - 1 }, (_, i) => <span key={i} style={{ left: `${((i + 1) * 100) / COLUMNS}%` }} />)}
        </div>
      )}
      {onLayer.map((n, i) => { const r = rectOf(n); return <div key={i} className="eotm-arrange-ghost" style={{ top: r.top, left: r.left, width: r.width, height: r.height }} /> })}
      <div className="eotm-arrange-sel" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      {handles}
      {!drag && (
        <div ref={barRef} className={`eotm-arrange-panel is-${side}`} style={{ ...ui(uiScale, barTop, barLeft), maxHeight: maxH }}>
          <div className="eotm-arrange-icons">
            <Btn icon="layers" label="Layers" on={open === 'layers'} onClick={() => toggle('layers')} />
            {tools && (part || isSec) && <Btn icon="controls" label="Controls" on={open === 'controls'} onClick={() => toggle('controls')} />}
            <Btn icon="edit" label="Edit" onClick={edit} />
          </div>
          {open === 'layers' && (
            <div className="eotm-arrange-icons is-fly">
              <Btn icon="up" label="Layer up: what is on this" disabled={!fwd.length} onClick={() => choose(fwd[0])} />
              <Btn icon="down" label="Layer down: what holds this" disabled={!back} onClick={() => choose(back)} />
            </div>
          )}
          {open === 'controls' && tools && (
            <div className="eotm-arrange-fly" style={{ maxHeight: maxH }}>
              {part ? (
                <>
                  <section className="eotm-arrange-card"><h4>Opacity</h4>
                    <label className="eotm-arrange-range"><input type="range" min="10" max="100" step="5" value={opacity} aria-label="Opacity"
                      onChange={(e) => write(section, (old) => setPart(old, name, { opacity: Number(e.target.value) === 100 ? null : Number(e.target.value) }, { phone }))} /><span>{opacity}%</span></label>
                  </section>
                  <section className="eotm-arrange-card"><h4>Order</h4>
                    <div className="eotm-arrange-row">
                      <Btn icon="front" label="Bring to front" onClick={() => write(section, (old) => restack(old, name, true, { phone }))} />
                      <Btn icon="back" label="Send to back" onClick={() => write(section, (old) => restack(old, name, false, { phone }))} />
                    </div>
                  </section>
                  {placing}
                  <section className="eotm-arrange-card"><h4>More</h4>
                    <div className="eotm-arrange-row">
                      <button type="button" className="eotm-target-snap" onClick={() => write(section, (old) => setPart(old, name, { h: null, fs: null }, { phone }))}>Fit</button>
                      {holdsElements && <button type="button" className="eotm-target-snap" onClick={duplicate}>Duplicate</button>}
                      {holdsElements && part.hasAttribute('data-eotm-element') && onSaveTemplate && !naming && <button type="button" className="eotm-target-snap" onClick={() => setNaming(true)}>Save as template</button>}
                      {cls && <button type="button" className="eotm-target-snap" onClick={saveForClass}>Same for every {cls.label.toLowerCase()}</button>}
                      {addClass && part.hasAttribute('data-eotm-element') && !classing && <button type="button" className="eotm-target-snap" onClick={() => setClassing(true)}>New class…</button>}
                    </div>
                    {naming && (
                      <form className="eotm-arrange-name" onSubmit={async (e) => {
                        e.preventDefault()
                        const tplName = e.currentTarget.elements.name.value.trim()
                        if (!tplName) return
                        try { await onSaveTemplate({ ...targetOf(section), id: name, name: tplName }); setNaming(false) } catch (err) { notify(err.message) }
                      }}>
                        <input name="name" className="eotm-input" placeholder="Template name" maxLength={60} autoFocus aria-label="Template name" />
                        <button className="eotm-target-snap">Save</button>
                      </form>
                    )}
                    {classing && (
                      <form className="eotm-arrange-name" onSubmit={(e) => { e.preventDefault(); const v = e.currentTarget.elements.cls.value.trim(); if (v) saveAsClass(v) }}>
                        <input name="cls" className="eotm-input" placeholder="Class name" maxLength={40} autoFocus aria-label="New class name" />
                        <button className="eotm-target-snap">Make</button>
                      </form>
                    )}
                  </section>
                </>
              ) : (
                <>
                  {phone ? (
                    <section className="eotm-arrange-card"><h4>On a phone</h4>
                      <Seg label="On a phone" value={phoneMode} onPick={(v) => (v === 'free' ? phoneMode !== 'free' && toFreeNow() : setPhone(v))}
                        options={[['stack', 'Stack'], ...(desktopFree ? [['scale', 'Keep desktop']] : []), ['free', 'Free']]} />
                    </section>
                  ) : (
                    <>
                      <section className="eotm-arrange-card"><h4>Layout</h4>
                        <Seg label="Layout" value={free ? 'free' : 'flow'} options={[['flow', 'Flow'], ['free', 'Free']]}
                          onPick={(v) => (v === 'free' ? !free && toFreeNow() : free && write(section, (old) => ({ ...old, mode: 'flow' })))} />
                      </section>
                      <section className="eotm-arrange-card"><h4>On a phone</h4>
                        <Seg label="On a phone" value={phoneMode} onPick={(v) => v !== 'free' && setPhone(v)}
                          options={[['stack', 'Stack'], ...(free ? [['scale', 'Keep layout']] : []), ...(phoneMode === 'free' ? [['free', 'Own']] : [])]} />
                      </section>
                    </>
                  )}
                  {holdsElements && (
                    <section className="eotm-arrange-card"><h4>Add</h4>
                      <div className="eotm-arrange-row">
                        <button type="button" className="eotm-target-snap" onClick={() => addElement(newElement('text', newId()))}>Text</button>
                        {upload && (
                          <label className="eotm-target-snap">Photo
                            <input type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files[0]); e.target.value = '' }} />
                          </label>
                        )}
                        <button type="button" className="eotm-target-snap" onClick={() => addElement(newElement('button', newId()))}>Button</button>
                        <button type="button" className="eotm-target-snap" onClick={() => addElement(newElement('box', newId()))}>Box</button>
                        {onImport && !section.matches('[data-eotm-element="design"]') && (
                          <button type="button" className="eotm-target-snap" onClick={() => onImport(targetOf(section))}>Canva PDF</button>
                        )}
                        {templates.length > 0 && (
                          <select className="eotm-target-snap" value="" aria-label="Add from a template"
                            onChange={(e) => { const t = templates[Number(e.target.value)]; if (t) addElement(copyElement(t.element, newId())) }}>
                            <option value="">Template…</option>
                            {templates.map((t, i) => <option key={`${t.name}:${i}`} value={i}>{t.name}</option>)}
                          </select>
                        )}
                      </div>
                    </section>
                  )}
                  {placing}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
