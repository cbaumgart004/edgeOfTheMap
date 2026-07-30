// Rune.jsx
//
// Elder Futhark glyphs drawn as SVG rather than Unicode runic codepoints —
// U+16A0–U+16FF has patchy font coverage and falls back to tofu on machines
// without a runic face. Drawing them keeps the strokes on-brand and lets
// mystic mode animate them.
//
// Each path's rune is chosen for meaning, not just shape:
//   Othala  (ᛟ) — homestead, inherited estate, the domain one keeps
//   Ansuz   (ᚨ) — the god-rune of speech, breath, the spoken word
//   Berkano (ᛒ) — the birch; growth, and literally wood
//   Raido   (ᚱ) — riding, the journey; used for the control that carries
//                 you between the site's two worlds
import React from 'react'

// Named GLYPHS, not PATHS: App.jsx's `PATHS` is the three-crafts table, and two
// unrelated tables under one name in one codebase is a reader's tripwire.
const GLYPHS = {
  othala: [
    'M12 3 L19.5 11 L12 19 L4.5 11 Z',
    'M12 19 L6.5 28',
    'M12 19 L17.5 28',
  ],
  ansuz: ['M7 2 V30', 'M7 4.5 L17 11', 'M7 13 L17 19.5'],
  berkano: ['M7 2 V30', 'M7 3.5 L16.5 9 L7 14.5', 'M7 16.5 L16.5 22 L7 27.5'],
  raido: ['M7 2 V30', 'M7 3.5 L16.5 9 L7 14.5', 'M7.5 14.5 L16.5 27.5'],
}

/** Every glyph this component can draw. Consumed by RuneFrame so the frame
 *  cycles the real glyph set instead of duplicating the list. */
export const RUNE_NAMES = Object.keys(GLYPHS)

/** The brand's stroke identity, shared with Bindrune so the footer mark and the
 *  card icons cannot drift apart in weight or cap style. `.rune-frame-glyph`
 *  overrides stroke-width from CSS, so this stays a default, not a lock. */
export const GLYPH_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  focusable: 'false',
}

export default function Rune({ name, className = '' }) {
  const strokes = GLYPHS[name]
  if (!strokes) return null

  return (
    <svg
      className={`rune ${className}`}
      viewBox="0 0 24 32"
      {...GLYPH_STROKE}
      aria-hidden="true"
    >
      {strokes.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
