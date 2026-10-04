import React, { useEffect, useRef, useState } from 'react'
import { toUnits, toFree, setPart, setHeight, dragPart, pinchPart, restack, COLUMNS } from './arrange.js'

// Arrange mode (StoryShaped ADR-0010): the page's sections and their parts, on
// the page itself, with handles. In place of click-to-edit (Targets.jsx) while
// it is on, so a click selects instead of opening text to type.
//
//   A section (a marked element holding parts, data-eotm-part): switch it
//   between Flow and Free, choose how a phone shows it (stack, keep the
//   desktop layout scaled down, or its own) and, when Free, drag its height.
//   On a phone, what is arranged is the phone's own layout (phoneParts): the
//   desktop one is arranged on a wider screen, or with the page at Desktop
//   width (App's page width), and a prompt says so.
//   A part of a Free section: drag it to move; drag a corner to scale it (its
//   text too, as Canva does), a side to change only that side; pinch with two
//   fingers to scale; arrow keys nudge (Shift for 10 px); fade it, bring it
//   forward or send it back. Snap puts edges on the 12 columns and an 8 px step.
//
// Every change is an updater of the section's `_layout`, written through the
// editor like a drag-to-size (App's resizeTarget), so it saves, undoes and
// previews like any edit. Measurements are taken from the page as drawn, so a
// section a phone has zoomed down (ScaleBox) is arranged in the same units.

const SECTION = '[data-eotm-edit][data-eotm-item]'
const PART = '[data-eotm-part]'
const SNAP_KEY = 'eotm:snap'
const PROMPT_KEY = 'eotm:arrange-prompt'
const PHONE = '(max-width: 819.98px)'
// A tablet held upright: wider than a phone, narrower than a desktop.
const TABLET_UPRIGHT = '(min-width: 820px) and (max-width: 1279.98px) and (orientation: portrait)'
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const readSnap = () => { try { return localStorage.getItem(SNAP_KEY) !== 'free' } catch { return true } }
const targetOf = (el) => {
  const [type, ...rest] = (el.dataset.eotmEdit ?? '').split(':')
  return { type, key: rest.join(':'), item: el.dataset.eotmItem }
}
const partsOf = (section) => [...section.querySelectorAll(PART)].filter((p) => p.closest('[data-eotm-item]') === section)
const isSection = (el) => el && (el.hasAttribute('data-eotm-frame') || partsOf(el).length > 0)
// Whether this screen arranges the section's phone layout: on a phone, unless
// the section shows the desktop layout scaled down there (then it is that
// one, in the same units).
const phoneEdit = (section) => matchMedia(PHONE).matches && section?.dataset.eotmPhone !== 'scale'
const isFree = (section) => (phoneEdit(section) ? section?.dataset.eotmPhone === 'free' : section?.dataset.eotmFrame === 'free')
const isText = (part) => !part.querySelector('img, svg, video, picture, canvas')

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

// What to tell the owner about the screen they arrange on, once a visit each.
function promptFor() {
  if (matchMedia(PHONE).matches) return { key: 'phone', text: 'Edits on a phone change the phone view only. To arrange the desktop layout, turn your phone sideways or set the page to Desktop width.' }
  if (matchMedia(TABLET_UPRIGHT).matches) return { key: 'tablet', text: 'Turn to landscape to arrange the layout larger screens show.' }
  return null
}
const seen = (key) => { try { return sessionStorage.getItem(`${PROMPT_KEY}:${key}`) } catch { return false } }

// `uiScale`: how much the page is scaled down (App's page width); the toolbar,
// prompt and handles are drawn that much larger so they keep their size on
// screen. CSS zoom also scales an element's offsets, so its position is divided.
const ui = (k, top, left) => (k > 1 ? { zoom: k, top: top / k, left: left / k } : { top, left })

export default function Arrange({ onChange, uiScale = 1 }) {
  const [sel, setSel] = useState(null) // { section, part }
  const [, setFrame] = useState(0)
  const [snap, setSnap] = useState(readSnap)
  const [drag, setDrag] = useState(null) // { kind } while dragging
  const [prompt, setPrompt] = useState(() => { const p = promptFor(); return p && !seen(p.key) ? p : null })
  // The screen can turn or the page change width while arranging.
  useEffect(() => {
    const on = () => { const p = promptFor(); setPrompt(p && !seen(p.key) ? p : null) }
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  const latest = useRef({})
  latest.current = { sel, snap, onChange }

  // Write an updater of the section's _layout, at most once a frame.
  const queued = useRef(null)
  const write = (section, fn) => {
    const first = !queued.current
    queued.current = { section, fn }
    if (!first) return
    requestAnimationFrame(() => {
      const q = queued.current
      queued.current = null
      latest.current.onChange({ ...targetOf(q.section), field: '_layout', value: q.fn })
    })
  }

  // A part dragged by its body, a handle or two fingers.
  const startDrag = (section, part, handle, e) => {
    const name = part.dataset.eotmPart
    const start = partNow(part, section)
    const width = section.getBoundingClientRect().width
    const text = isText(part)
    const ratio = start.drawnH && start.w ? start.drawnH / start.w : null
    const phone = phoneEdit(section)
    const pointers = new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]])
    let pinch = null
    setDrag({ kind: handle })
    const move = (ev) => {
      if (!pointers.has(ev.pointerId)) return
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
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
      write(section, (old) => setPart(old, name, patch, { phone }))
    }
    const down = (ev) => { if (pointers.size < 2) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }) }
    const end = (ev) => {
      pointers.delete(ev.pointerId)
      if (pointers.size) return
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

  // The page: a press selects (and on a Free section's part starts moving it);
  // clicks are the editor's while arranging, so links do not navigate.
  useEffect(() => {
    document.documentElement.classList.add('eotm-arranging')
    const onPage = (t) => t instanceof Element && !t.closest('.eotm-root')
    const down = (e) => {
      if (!onPage(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return
      let section = e.target.closest(SECTION)
      while (section && !isSection(section)) section = section.parentElement?.closest(SECTION)
      const cur = latest.current.sel
      if (!section) { if (cur) setSel(null); return }
      // A second finger on the selected part is a pinch, handled by its drag.
      if (cur?.part && e.target.closest(PART) === cur.part && document.querySelector('.eotm-arrange.is-dragging')) return
      e.preventDefault()
      e.stopPropagation()
      const part = isFree(section) ? e.target.closest(PART) : null
      const own = part && part.closest('[data-eotm-item]') === section ? part : null
      setSel({ section, part: own })
      if (own) startDrag(section, own, 'move', e)
    }
    const click = (e) => {
      if (!onPage(e.target) || !e.target.closest(SECTION)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const key = (e) => {
      const { sel: s } = latest.current
      if (!s) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') { setSel(s.part ? { section: s.section, part: null } : null); return }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!step || !s.part) return
      e.preventDefault()
      const px = e.shiftKey ? 10 : 1
      const start = partNow(s.part, s.section)
      const width = s.section.getBoundingClientRect().width
      const { drawnH, ...next } = dragPart(start, 'move', step[0] * px, step[1] * px, { width, snap: false }) // eslint-disable-line no-unused-vars
      write(s.section, (old) => setPart(old, s.part.dataset.eotmPart, next, { phone: phoneEdit(s.section) }))
    }
    addEventListener('pointerdown', down, true)
    addEventListener('click', click, true)
    addEventListener('keydown', key)
    return () => {
      document.documentElement.classList.remove('eotm-arranging')
      removeEventListener('pointerdown', down, true)
      removeEventListener('click', click, true)
      removeEventListener('keydown', key)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the page: scrolling, resizing, and the page redrawing from each
  // write. A selected part the page re-rendered is found again by its name.
  useEffect(() => {
    if (!sel) return undefined
    let frame = 0
    const tick = () => {
      setSel((s) => {
        if (!s) return s
        const section = s.section.isConnected ? s.section : document.querySelector(`[data-eotm-item="${s.section.dataset.eotmItem}"]`)
        if (!section) return null
        const part = s.part && (s.part.isConnected ? s.part : partsOf(section).find((p) => p.dataset.eotmPart === s.part.dataset.eotmPart))
        return section === s.section && (part ?? null) === s.part ? s : { section, part: part ?? null }
      })
      setFrame((n) => n + 1)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [!!sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSnap = () => setSnap((on) => {
    try { localStorage.setItem(SNAP_KEY, on ? 'free' : 'snap') } catch { /* kept for this visit only */ }
    return !on
  })
  const dismissPrompt = () => {
    try { sessionStorage.setItem(`${PROMPT_KEY}:${prompt.key}`, '1') } catch { /* asked again next time */ }
    setPrompt(null)
  }

  const banner = prompt && (
    <div className="eotm-arrange-prompt" role="status" style={uiScale > 1 ? { zoom: uiScale } : undefined}>
      <span>{prompt.text}</span>
      <button type="button" className="eotm-target-snap" onClick={dismissPrompt}>OK</button>
    </div>
  )
  if (!sel) return <div className="eotm-target eotm-arrange">{banner}<p className="eotm-arrange-hint">Arrange: tap a section to choose it.</p></div>

  const { section, part } = sel
  const s = section.getBoundingClientRect()
  const free = isFree(section)
  const phone = phoneEdit(section)
  const desktopFree = section.dataset.eotmFrame === 'free'
  const phoneMode = section.dataset.eotmPhone ?? 'stack'
  const box = part ? rectOf(part) : s
  const name = part?.dataset.eotmPart
  const barTop = Math.min(Math.max(box.top - 52, 8), innerHeight - 60)
  const barLeft = Math.min(Math.max(box.left, 8), innerWidth - 320)

  const toFreeNow = () => {
    const measured = {}
    for (const p of partsOf(section)) {
      const n = p.dataset.eotmPart
      const r = rectOf(p)
      if (!measured[n] && (r.width || r.height)) measured[n] = toUnits(r, s)
    }
    write(section, (old) => toFree(old, measured, (s.height * 100) / (s.width || 1), { phone }))
  }
  const opacity = part ? Math.round((parseFloat(part.style.getPropertyValue(phone ? '--qo' : '--o')) || 1) * 100) : 100
  const setPhone = (v) => write(section, (old) => ({ ...old, phone: v }))

  const heightDrag = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const startY = e.clientY
    const startH = (s.height * 100) / (s.width || 1)
    setDrag({ kind: 'height' })
    const move = (ev) => {
      const h = Math.max(1, Math.min(1000, startH + ((ev.clientY - startY) * 100) / (s.width || 1)))
      write(section, (old) => setHeight(old, h, { phone }))
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

  return (
    <div className={`eotm-target eotm-arrange${drag ? ' is-dragging' : ''}`}>
      {banner}
      {drag && snap && free && (
        <div className="eotm-target-grid" style={{ top: s.top, left: s.left, width: s.width, height: s.height }}>
          {Array.from({ length: COLUMNS - 1 }, (_, i) => <span key={i} style={{ left: `${((i + 1) * 100) / COLUMNS}%` }} />)}
        </div>
      )}
      {/* The section, and when a part is chosen, the other parts dimly. */}
      <div className={`eotm-target-box${part ? ' is-sizer' : ''}`} style={{ top: s.top, left: s.left, width: s.width, height: s.height }} />
      {part && partsOf(section).filter((p) => p !== part).map((p, i) => {
        const r = rectOf(p)
        return <div key={i} className="eotm-arrange-ghost" style={{ top: r.top, left: r.left, width: r.width, height: r.height }} />
      })}
      {part && (
        <>
          <div className="eotm-target-box eotm-arrange-sel" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
          {HANDLES.map((h) => {
            const x = h.includes('w') ? box.left : h.includes('e') ? box.left + box.width : box.left + box.width / 2
            const y = h.includes('n') ? box.top : h.includes('s') ? box.top + box.height : box.top + box.height / 2
            return (
              <button key={h} type="button" className={`eotm-arrange-handle is-${h}`} style={ui(uiScale, y, x)}
                aria-label={`Drag to resize from the ${h} ${h.length === 2 ? 'corner' : 'side'}`}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag(section, part, h, e) }} />
            )
          })}
        </>
      )}
      {!part && free && (
        <button type="button" className="eotm-arrange-handle is-height" style={ui(uiScale, s.top + s.height, s.left + s.width / 2)}
          aria-label="Drag to change the section’s height" title="Section height" onPointerDown={heightDrag} />
      )}
      <div className="eotm-arrange-bar" style={ui(uiScale, barTop, barLeft)}>
        {part ? (
          <>
            <label className="eotm-arrange-range">Fade
              <input type="range" min="10" max="100" step="5" value={opacity}
                onChange={(e) => write(section, (old) => setPart(old, name, { opacity: Number(e.target.value) === 100 ? null : Number(e.target.value) }, { phone }))} />
            </label>
            <button type="button" className="eotm-target-snap" onClick={() => write(section, (old) => restack(old, name, true, { phone }))} title="Bring to front">Front</button>
            <button type="button" className="eotm-target-snap" onClick={() => write(section, (old) => restack(old, name, false, { phone }))} title="Send to back">Back</button>
            <button type="button" className="eotm-target-snap" onClick={() => write(section, (old) => setPart(old, name, { h: null, fs: null }, { phone }))}
              title="Let it take its text’s own size and height again">Fit</button>
            <button type="button" className="eotm-target-snap" onClick={() => setSel({ section, part: null })}>Section</button>
          </>
        ) : phone ? (
          // On a phone: how the phone shows this section. Free is the phone's
          // own arrangement, started from the stack as it is drawn now.
          <div className="eotm-seg eotm-arrange-seg" role="radiogroup" aria-label="On a phone">
            <button type="button" role="radio" aria-checked={phoneMode === 'stack'} className={phoneMode === 'stack' ? 'is-on' : ''}
              title="Its parts stack in one column" onClick={() => setPhone('stack')}>Stack</button>
            {desktopFree && (
              <button type="button" role="radio" aria-checked={false} title="Show the desktop layout, scaled down whole"
                onClick={() => setPhone('scale')}>Keep desktop</button>
            )}
            <button type="button" role="radio" aria-checked={phoneMode === 'free'} className={phoneMode === 'free' ? 'is-on' : ''}
              title="Arrange it freely, for phones only" onClick={() => phoneMode !== 'free' && toFreeNow()}>Free</button>
          </div>
        ) : (
          <>
            <div className="eotm-seg eotm-arrange-seg" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" aria-checked={!free} className={!free ? 'is-on' : ''}
                onClick={() => free && write(section, (old) => ({ ...old, mode: 'flow' }))}>Flow</button>
              <button type="button" role="radio" aria-checked={free} className={free ? 'is-on' : ''} onClick={() => !free && toFreeNow()}>Free</button>
            </div>
            <div className="eotm-seg eotm-arrange-seg" role="radiogroup" aria-label="On a phone">
              <button type="button" role="radio" aria-checked={phoneMode === 'stack'} className={phoneMode === 'stack' ? 'is-on' : ''}
                title="On a phone, its parts stack in one column" onClick={() => setPhone('stack')}>Phone: stack</button>
              {free && (
                <button type="button" role="radio" aria-checked={phoneMode === 'scale'} className={phoneMode === 'scale' ? 'is-on' : ''}
                  title="On a phone, keep this layout, scaled down whole" onClick={() => setPhone('scale')}>Keep layout</button>
              )}
              {phoneMode === 'free' && (
                <button type="button" role="radio" aria-checked className="is-on" title="Arranged on a phone, for phones only">Phone: own</button>
              )}
            </div>
          </>
        )}
        {free && (
          <button type="button" className={`eotm-target-snap${snap ? ' is-on' : ''}`} aria-pressed={snap} onClick={toggleSnap}
            title={snap ? 'Snaps to 12 columns and an 8 px step. Click to place freely.' : 'Placing freely. Click to snap to 12 columns and an 8 px step.'}>
            {snap ? 'Snap' : 'Free-hand'}
          </button>
        )}
        {!part && free && <span className="eotm-target-hint">{phone ? 'Phone layout: drag a part to move it' : 'Drag a part to move it'}</span>}
      </div>
    </div>
  )
}
