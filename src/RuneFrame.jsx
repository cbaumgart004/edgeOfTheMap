// RuneFrame.jsx
//
// An inscribed rune border for the mystic-mode cards.
//
// Only rendered in mystic mode, so the light face pays nothing for it — not
// in DOM, not in paint.
//
// Changing which runes appear is meant to be a one-line edit: swap
// FRAME_RUNES below, or pass a `runes` prop. Every glyph also carries the
// `.rune-frame-glyph` class so the whole border can be restyled — or hidden —
// from CSS without touching this file.
import React from 'react'
import Rune, { RUNE_NAMES } from './Rune.jsx'

/** The sequence repeated around the frame. Order matters; it cycles.
 *
 *  Taken from Rune's own glyph set rather than re-listing the names: the two
 *  lists were identical, and a name that Rune cannot draw renders nothing at
 *  all (`Rune` returns null for an unknown name) with no error to notice. */
export const FRAME_RUNES = RUNE_NAMES

/** Glyphs per edge. The sides get fewer because cards are taller than wide
 *  at most breakpoints and evenly-spaced sides would crowd. */
const TOP_COUNT = 7
const SIDE_COUNT = 4

const cycle = (runes, count, offset = 0) =>
  Array.from({ length: count }, (_, i) => runes[(i + offset) % runes.length])

function Edge({ side, runes, count, offset }) {
  return (
    <span className={`rune-frame-edge rune-frame-${side}`}>
      {cycle(runes, count, offset).map((name, i) => (
        <Rune key={`${side}-${i}`} name={name} className="rune-frame-glyph" />
      ))}
    </span>
  )
}

export default function RuneFrame({ runes = FRAME_RUNES }) {
  return (
    <span className="rune-frame" aria-hidden="true">
      <Edge side="top" runes={runes} count={TOP_COUNT} offset={0} />
      <Edge side="bottom" runes={runes} count={TOP_COUNT} offset={2} />
      <Edge side="left" runes={runes} count={SIDE_COUNT} offset={1} />
      <Edge side="right" runes={runes} count={SIDE_COUNT} offset={3} />
    </span>
  )
}
