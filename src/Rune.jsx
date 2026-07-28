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
import React from 'react'

const PATHS = {
  othala: [
    'M12 3 L19.5 11 L12 19 L4.5 11 Z',
    'M12 19 L6.5 28',
    'M12 19 L17.5 28',
  ],
  ansuz: ['M7 2 V30', 'M7 4.5 L17 11', 'M7 13 L17 19.5'],
  berkano: ['M7 2 V30', 'M7 3.5 L16.5 9 L7 14.5', 'M7 16.5 L16.5 22 L7 27.5'],
}

export default function Rune({ name, className = '' }) {
  const strokes = PATHS[name]
  if (!strokes) return null

  return (
    <svg
      className={`rune ${className}`}
      viewBox="0 0 24 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {strokes.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
