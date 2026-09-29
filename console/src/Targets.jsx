import React, { useEffect, useRef, useState } from 'react'

// Click-to-edit and drag-to-size on the page itself. A site marks what the
// owner can edit:
//
//   data-eotm-edit="<type>:<id or slug>"   the document an element shows
//   data-eotm-item="<_id>"                 optional: the section or row within it
//   data-eotm-label="Services"             optional: named on the button
//
// and, on that element or inside it, what can be sized by dragging an edge:
//
//   data-eotm-size="<field>"               a number field of that item, in % of
//                                          the element's parent width
//   data-eotm-min / data-eotm-max          its limits (default 10 / 100)
//   data-eotm-edge="left"                  drag the left edge (an image on the right)
//   data-eotm-centered                     centred: an edge moves half as far
//   data-eotm-richtext="<field>"           a rich text field: each image in it
//                                          gets a handle, stored as width="n%"
//
// Sizes snap to twelfths of the parent (the layout's 12 columns) or move
// freely in 1% steps; the owner's choice is kept in this browser.
//
// Pointing at (or tapping) a marked element outlines it and shows an Edit
// button and its size handles. The page's own links keep working: only the
// console's buttons and handles take the pointer.

const MARK = '[data-eotm-edit]'
const SIZE = '[data-eotm-size]'
const SNAP_KEY = 'eotm:snap'
const readSnap = () => { try { return localStorage.getItem(SNAP_KEY) !== 'free' } catch { return true } }

function targetOf(el) {
  const [type, ...rest] = (el.dataset.eotmEdit ?? '').split(':')
  return { type, key: rest.join(':'), item: el.dataset.eotmItem || null }
}

// The item a sizer belongs to: its own nearest marked element.
function itemOf(node) {
  const owner = node.closest(MARK)
  return owner ? targetOf(owner) : null
}

// Everything inside a marked element that can be dragged to a new width.
function sizersIn(el) {
  const out = []
  for (const s of [el, ...el.querySelectorAll(SIZE)]) {
    if (!s.matches(SIZE) || !s.parentElement) continue
    out.push({
      node: s, parent: s.parentElement, field: s.dataset.eotmSize, imageIndex: null,
      label: s.dataset.eotmLabel ?? s.dataset.eotmSize,
      min: Number(s.dataset.eotmMin ?? 10), max: Number(s.dataset.eotmMax ?? 100),
      left: s.dataset.eotmEdge === 'left', centered: s.hasAttribute('data-eotm-centered'),
    })
  }
  for (const box of [el, ...el.querySelectorAll('[data-eotm-richtext]')]) {
    if (!box.matches('[data-eotm-richtext]')) continue
    box.querySelectorAll('img').forEach((img, i) => out.push({
      node: img, parent: box, field: box.dataset.eotmRichtext, imageIndex: i, label: 'photo',
      min: 10, max: 100, left: false, centered: false,
    }))
  }
  return out
}

export default function Targets({ onOpen, onResize }) {
  const [el, setEl] = useState(null)
  const [, setFrame] = useState(0)
  const [drag, setDrag] = useState(null) // { node, value, parent }
  const [snap, setSnap] = useState(readSnap)
  const dragging = useRef(false)

  useEffect(() => {
    const find = (e) => {
      if (dragging.current) return
      const t = e.target
      if (!(t instanceof Element) || t.closest('.eotm-root')) return
      const hit = t.closest(MARK)
      if (hit) setEl(hit)
    }
    document.addEventListener('pointerover', find, true)
    document.addEventListener('pointerdown', find, true)
    return () => {
      document.removeEventListener('pointerover', find, true)
      document.removeEventListener('pointerdown', find, true)
    }
  }, [])

  // Redraw every frame while something is outlined, so the boxes follow
  // scrolling, resizing and the page re-rendering under a drag.
  useEffect(() => {
    if (!el) return undefined
    let frame = 0
    const tick = () => {
      if (!el.isConnected) { setEl(null); return }
      setFrame((n) => n + 1)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [el])

  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.bottom < 0 || rect.top > innerHeight) return null
  const label = el.dataset.eotmLabel
  const top = Math.max(rect.top, 8) + 8
  const sizers = sizersIn(el)

  const toggleSnap = () => setSnap((on) => {
    try { localStorage.setItem(SNAP_KEY, on ? 'free' : 'snap') } catch { /* kept for this visit only */ }
    return !on
  })

  const startDrag = (sizer) => (e) => {
    const target = itemOf(sizer.node)
    if (!target) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragging.current = true
    const dir = (sizer.left ? -1 : 1) * (sizer.centered ? 2 : 1)
    const startX = e.clientX
    const startW = sizer.node.getBoundingClientRect().width
    const parentW = sizer.parent.getBoundingClientRect().width || 1
    let last = null
    const move = (ev) => {
      const raw = ((startW + (ev.clientX - startX) * dir) / parentW) * 100
      const stepped = snap ? Math.round(raw / (100 / 12)) * (100 / 12) : raw
      const value = Math.round(Math.min(sizer.max, Math.max(sizer.min, stepped)))
      if (value === last) return
      last = value
      setDrag({ node: sizer.node, value, parent: sizer.parent })
      onResize({ ...target, field: sizer.field, value, imageIndex: sizer.imageIndex })
    }
    const end = () => {
      dragging.current = false
      setDrag(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // While snapping, the twelve columns being snapped to.
  const grid = drag && snap ? drag.parent.getBoundingClientRect() : null

  return (
    <div className="eotm-target">
      {grid && (
        <div className="eotm-target-grid" style={{ top: grid.top, left: grid.left, width: grid.width, height: grid.height }}>
          {Array.from({ length: 11 }, (_, i) => <span key={i} style={{ left: `${((i + 1) * 100) / 12}%` }} />)}
        </div>
      )}
      <div className="eotm-target-box" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      <div className="eotm-target-bar" style={{ top, left: Math.max(rect.left, 0) + 8 }}>
        <button type="button" className="eotm-target-edit" onClick={() => onOpen(targetOf(el))}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {label ? `Edit ${label}` : 'Edit'}
        </button>
        {sizers.length > 0 && (
          <button type="button" className={`eotm-target-snap${snap ? ' is-on' : ''}`} aria-pressed={snap} onClick={toggleSnap}
            title={snap ? 'Sizes snap to a 12-column grid. Click for free sizing.' : 'Free sizing in 1% steps. Click to snap to a 12-column grid.'}>
            {snap ? 'Snap' : 'Free'}
          </button>
        )}
      </div>
      {sizers.map((s) => {
        const r = s.node.getBoundingClientRect()
        const x = s.left ? r.left : r.right
        const y = Math.min(Math.max(r.top + r.height / 2, 60), innerHeight - 60)
        const active = drag?.node === s.node
        return (
          <React.Fragment key={`${s.field}:${s.imageIndex ?? ''}:${s.node.dataset.eotmItem ?? ''}`}>
            {s.node !== el && <div className="eotm-target-box is-sizer" style={{ top: r.top, left: r.left, width: r.width, height: r.height }} />}
            <button type="button" className={`eotm-target-size${active ? ' is-active' : ''}`} style={{ top: y, left: x }}
              aria-label={`Drag to resize ${s.label}`} title="Drag to resize" onPointerDown={startDrag(s)}>
              {active && <span className="eotm-target-value">{drag.value}%</span>}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
