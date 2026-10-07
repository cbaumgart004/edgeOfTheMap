import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The `layout` field (SCHEMA.md): the order and width of the blocks a page marks
// with data-eotm-block inside its data-eotm-layout container. The page owns the
// blocks and renders them; the value only orders them and sets how many of 12
// columns each takes. Two ways to change it: the list here, which works on any
// screen, and "Arrange on the page", which draws move and resize handles over
// the blocks themselves.

const WIDTHS = [[12, 'Full width'], [9, 'Three quarters'], [8, 'Two thirds'], [6, 'Half'], [4, 'One third'], [3, 'One quarter']]
const MIN_SPAN = 3

const container = () => document.querySelector('[data-eotm-layout]')
const blockEl = (root, key) => [...(root?.children ?? [])].find((el) => el.dataset.eotmBlock === key)

// The page's blocks, in the order it renders them, kept current as the site
// re-renders or the owner moves to another page with the editor open.
function usePageBlocks() {
  const read = () => [...(container()?.querySelectorAll(':scope > [data-eotm-block]') ?? [])].map((el) => ({
    key: el.dataset.eotmBlock,
    label: el.dataset.eotmLabel || el.dataset.eotmBlock,
    span: Number(el.dataset.eotmSpan) || 12,
  }))
  const [blocks, setBlocks] = useState(read)
  useEffect(() => {
    const sig = (list) => list.map((b) => `${b.key}:${b.span}`).join()
    let last = sig(blocks)
    const observer = new MutationObserver(() => {
      const next = read()
      if (sig(next) !== last) { last = sig(next); setBlocks(next) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-eotm-span', 'data-eotm-block'] })
    return () => observer.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return blocks
}

// The saved order, then any block the page has that the value does not name.
// Names the page no longer has drop out on the next change.
function resolve(value, blocks) {
  const byKey = new Map(blocks.map((b) => [b.key, b]))
  const out = (value ?? []).filter((v) => byKey.has(v.key)).map((v) => ({ ...byKey.get(v.key), span: v.span }))
  for (const b of blocks) if (!out.some((o) => o.key === b.key)) out.push(b)
  return out
}

const moved = (items, from, to) => {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function Layout({ id, value, onChange, ctx }) {
  const blocks = usePageBlocks()
  const [arranging, setArranging] = useState(false)
  const items = resolve(value, blocks)
  const write = (next) => onChange(next.map(({ key, span }) => ({ key, span })))

  if (!items.length) return <p id={id} className="eotm-help">This page has no blocks to arrange. Go to the page this layout is for; the editor stays open.</p>
  return (
    <div id={id} className="eotm-layout">
      <button type="button" className="eotm-btn is-primary" onClick={() => setArranging(true)}>Arrange on the page</button>
      <ol>
        {items.map((b, i) => (
          <li key={b.key} className="eotm-layout-row">
            <span className="eotm-layout-name">{b.label}</span>
            <button type="button" className="eotm-icon" aria-label={`Move ${b.label} up`} disabled={i === 0} onClick={() => write(moved(items, i, i - 1))}>↑</button>
            <button type="button" className="eotm-icon" aria-label={`Move ${b.label} down`} disabled={i === items.length - 1} onClick={() => write(moved(items, i, i + 1))}>↓</button>
            <select className="eotm-input" aria-label={`Width of ${b.label}`} value={b.span}
              onChange={(e) => write(items.map((x) => (x.key === b.key ? { ...x, span: Number(e.target.value) } : x)))}>
              {!WIDTHS.some(([n]) => n === b.span) && <option value={b.span}>{b.span} of 12 columns</option>}
              {WIDTHS.map(([n, label]) => <option key={n} value={n}>{label}</option>)}
            </select>
          </li>
        ))}
      </ol>
      {arranging && ctx.overlay && createPortal(
        <Arrange items={items} write={write} setPeek={ctx.setPeek} onDone={() => setArranging(false)} />, ctx.overlay)}
    </div>
  )
}

// Where a dragged block lands: beside the block nearest the pointer, before or
// after it by which half the pointer is in (left/right when that block shares
// its row, top/bottom when it spans the page).
function dropTarget(x, y, rects, rootWidth, from) {
  let best = -1
  let bestD = Infinity
  rects.forEach((r, i) => {
    if (!r) return
    const dx = Math.max(r.left - x, 0, x - r.right)
    const dy = Math.max(r.top - y, 0, y - r.bottom)
    if (dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = i }
  })
  if (best < 0) return null
  const r = rects[best]
  const beside = r.width < rootWidth * 0.9
  const before = beside ? x < r.left + r.width / 2 : y < r.top + r.height / 2
  const at = before ? best : best + 1
  return { to: at > from ? at - 1 : at, rect: r, before, beside }
}

function Arrange({ items, write, setPeek, onDone }) {
  const [, setFrame] = useState(0)
  const [drag, setDrag] = useState(null) // { key, mode, x0, y0, x, y, w0, span0 }
  const pointer = useRef(null)

  // The page stays visible and usable under the handles while arranging.
  useEffect(() => {
    setPeek?.(true)
    return () => setPeek?.(false)
  }, [setPeek])

  // Boxes follow their blocks through scrolling, reflow and live re-renders; a
  // drag near the top or bottom of the screen scrolls the page.
  useEffect(() => {
    let raf
    const loop = () => {
      const p = pointer.current
      if (p) {
        if (p.y < 60) scrollBy(0, -12)
        else if (p.y > innerHeight - 60) scrollBy(0, 12)
      }
      setFrame((n) => (n + 1) % 1e6)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const root = container()
  if (!root) return null
  const rootRect = root.getBoundingClientRect()
  const rects = items.map((b) => blockEl(root, b.key)?.getBoundingClientRect() ?? null)
  // A page that stacks its blocks on a narrow screen shows no widths to change.
  const columns = getComputedStyle(root).gridTemplateColumns.split(' ').filter(Boolean).length
  const sizable = columns >= 12
  const colWidth = rootRect.width / 12

  const start = (e, b, mode) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const i = items.indexOf(b)
    setDrag({ key: b.key, mode, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, w0: rects[i]?.width ?? 0, span0: b.span })
    if (mode === 'move') pointer.current = { y: e.clientY }
  }
  const move = (e) => {
    if (!drag) return
    if (drag.mode === 'move') {
      pointer.current = { y: e.clientY }
      setDrag({ ...drag, x: e.clientX, y: e.clientY })
      return
    }
    // Resizing writes as it goes, so the page reflows under the pointer.
    const span = Math.max(MIN_SPAN, Math.min(12, Math.round((drag.w0 + e.clientX - drag.x0) / colWidth)))
    if (span !== items.find((b) => b.key === drag.key)?.span) write(items.map((b) => (b.key === drag.key ? { ...b, span } : b)))
  }
  const end = () => {
    if (drag?.mode === 'move') {
      const from = items.findIndex((b) => b.key === drag.key)
      const t = dropTarget(drag.x, drag.y, rects.map((r, i) => (i === from ? null : r)), rootRect.width, from)
      if (t && t.to !== from) write(moved(items, from, t.to))
    }
    pointer.current = null
    setDrag(null)
  }

  const from = drag?.mode === 'move' ? items.findIndex((b) => b.key === drag.key) : -1
  const target = from >= 0 ? dropTarget(drag.x, drag.y, rects.map((r, i) => (i === from ? null : r)), rootRect.width, from) : null

  return (
    <div className="eotm-arrange">
      <div className="eotm-layout-bar" role="status">
        <span>{sizable ? 'Drag ⠿ to move a block, its edge to resize.' : 'Drag ⠿ to move a block. Widths apply on wider screens.'}</span>
        <button type="button" className="eotm-btn is-primary" onClick={onDone}>Done</button>
      </div>
      {items.map((b, i) => {
        const r = rects[i]
        if (!r) return null
        const dragging = drag?.key === b.key
        const shift = dragging && drag.mode === 'move' ? `translate(${drag.x - drag.x0}px, ${drag.y - drag.y0}px)` : undefined
        return (
          <div key={b.key} className={`eotm-box${dragging ? ' is-dragging' : ''}`}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height, transform: shift }}>
            <span className="eotm-box-move" onPointerDown={(e) => start(e, b, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              role="button" aria-label={`Move ${b.label}`}>⠿ {b.label}</span>
            {sizable && <span className="eotm-box-span">{b.span} / 12</span>}
            {sizable && (
              <span className="eotm-box-size" onPointerDown={(e) => start(e, b, 'size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
                role="button" aria-label={`Resize ${b.label}`}>⟷</span>
            )}
          </div>
        )
      })}
      {target && (
        <div className="eotm-drop" style={target.beside
          ? { left: (target.before ? target.rect.left : target.rect.right) - 3, top: target.rect.top, width: 6, height: target.rect.height }
          : { left: target.rect.left, top: (target.before ? target.rect.top : target.rect.bottom) - 3, width: target.rect.width, height: 6 }} />
      )}
    </div>
  )
}
