// The arithmetic of Arrange mode (Arrange.jsx), kept apart so it can be tested
// without a page. A Free section's `_layout` (StoryShaped ADR-0010, SCHEMA.md
// "Free sections") holds each part as { x, y, w, h?, z?, opacity?, fs? }: x and
// w are % of the section's width, and y, h and the section's height are % of
// its width too, so one unit is the same distance across and down.

export const COLUMNS = 12
export const ROW_PX = 8 // the vertical snap step, in screen pixels
const round = (v) => Math.round(v * 100) / 100

// A box in screen pixels as a part position inside `section` (both rects).
export function toUnits(box, section) {
  const k = 100 / (section.width || 1)
  return { x: round((box.left - section.left) * k), y: round((box.top - section.top) * k), w: round(box.width * k), h: round(box.height * k) }
}

// A part position as a box in screen pixels inside `section`.
export function toPixels(p, section) {
  const k = (section.width || 1) / 100
  return { left: section.left + p.x * k, top: section.top + p.y * k, width: p.w * k, height: p.h != null ? p.h * k : null }
}

// Snapping: x and w to the 12 columns, y and h to an 8 px step at the
// section's current width.
export function snapX(v) { return round(Math.round(v / (100 / COLUMNS)) * (100 / COLUMNS)) }
export function snapY(v, sectionWidth) {
  const step = (ROW_PX * 100) / (sectionWidth || 1)
  return round(Math.round(v / step) * step)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const LIMITS = { x: [-50, 150], y: [0, 1000], w: [1, 200], h: [1, 1000], fs: [10, 500] }
export function clampPart(p) {
  const out = { ...p }
  for (const k of ['x', 'y', 'w', 'h', 'fs']) if (out[k] != null) out[k] = round(clamp(out[k], ...LIMITS[k]))
  return out
}

// Where a layout keeps the desktop arrangement or the phone's own (`phone`:
// arranging on a phone, StoryShaped ADR-0010).
const keys = (phone) => (phone ? { parts: 'phoneParts', height: 'phoneHeight' } : { parts: 'parts', height: 'height' })

// The section switching to Free: every part where it is now drawn, unless the
// section was Free before and kept the part's place; its height as it stands.
// `measured` is { name: { x, y, w, h } } from the page. On a phone it is the
// phone's own arrangement that starts, from the parts as the phone stacks them.
export function toFree(old, measured, height, { phone = false } = {}) {
  const k = keys(phone)
  const parts = {}
  for (const [name, m] of Object.entries(measured)) {
    const kept = old?.[k.parts]?.[name]
    // Height is measured but not kept: a part without one grows to fit, so
    // text never gets cut off by a box drawn for different words.
    parts[name] = kept ?? clampPart({ x: m.x, y: m.y, w: m.w })
  }
  return {
    ...old, ...(phone ? { phone: 'free' } : { mode: 'free' }),
    [k.height]: old?.[k.height] ?? round(clamp(height, 1, 1000)), [k.parts]: { ...old?.[k.parts], ...parts },
  }
}

// One part changed: the rest of the layout as it was.
export function setPart(old, name, patch, { phone = false } = {}) {
  const k = keys(phone).parts
  const cur = old?.[k]?.[name] ?? {}
  const next = clampPart({ ...cur, ...patch })
  for (const key of Object.keys(next)) if (next[key] == null) delete next[key]
  return { ...old, [k]: { ...old?.[k], [name]: next } }
}

// The section's height, desktop or phone.
export const setHeight = (old, h, { phone = false } = {}) => ({ ...old, [keys(phone).height]: round(clamp(h, 1, 1000)) })

// A drag from `start` (a part position) by (dx, dy) screen pixels on a section
// `width` px wide, by handle: 'move', or a side or corner ('n', 'e', 'se'...).
// Corners scale: the width (and a set height) by the same factor, and for
// text its size too, as Canva does; a side changes only that side.
export function dragPart(start, handle, dx, dy, { width, snap = false, text = false, ratio = null } = {}) {
  const ux = (dx * 100) / (width || 1)
  const uy = (dy * 100) / (width || 1)
  const p = { ...start }
  if (handle === 'move') {
    p.x = start.x + ux
    p.y = start.y + uy
    if (snap) { p.x = snapX(p.x); p.y = snapY(p.y, width) }
    return clampPart(p)
  }
  const west = handle.includes('w')
  const north = handle.includes('n')
  const corner = handle.length === 2
  if (corner) {
    const grow = west ? -ux : ux
    let w = Math.max(1, start.w + grow)
    if (snap) w = Math.max(100 / COLUMNS, snapX(w))
    const f = w / start.w
    p.w = w
    if (west) p.x = start.x + start.w - w
    if (start.h != null) {
      p.h = start.h * f
      if (north) p.y = start.y + start.h - p.h
    } else if (north && ratio) {
      p.y = start.y + start.w * ratio - w * ratio // a box with no set height keeps its bottom
    }
    if (text) p.fs = (start.fs ?? 100) * f
    return clampPart(p)
  }
  if (handle === 'e' || handle === 'w') {
    let w = start.w + (west ? -ux : ux)
    if (snap) w = snapX(w)
    w = Math.max(1, w)
    p.w = w
    if (west) p.x = start.x + start.w - w
    return clampPart(p)
  }
  // n or s: a set height (a part with none starts from its drawn height).
  const h0 = start.h ?? start.drawnH ?? 10
  let h = h0 + (north ? -uy : uy)
  if (snap) h = snapY(h, width)
  h = Math.max(1, h)
  p.h = h
  if (north) p.y = start.y + h0 - h
  delete p.drawnH
  return clampPart(p)
}

// Two fingers on a part: the distance between them, now over at the start,
// scales it like a corner drag, about its centre.
export function pinchPart(start, factor, { text = false } = {}) {
  const f = clamp(factor, 0.1, 10)
  const w = start.w * f
  const p = { ...start, w, x: start.x + (start.w - w) / 2 }
  if (start.h != null) { p.h = start.h * f; p.y = start.y + (start.h - p.h) / 2 }
  if (text) p.fs = (start.fs ?? 100) * f
  return clampPart(p)
}

// Layering: to the front or back of the section's other parts.
export function restack(old, name, toFront, { phone = false } = {}) {
  const zs = Object.entries(old?.[keys(phone).parts] ?? {}).filter(([n]) => n !== name).map(([, p]) => p.z ?? 0)
  const z = toFront ? Math.min(100, Math.max(0, ...zs) + 1) : Math.max(0, Math.min(0, ...zs) - 1)
  return setPart(old, name, { z }, { phone })
}
