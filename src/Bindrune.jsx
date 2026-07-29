// Bindrune.jsx
//
// The maker's runebinding: six runes bound adjacent, top to bottom, on one
// continuous stave. This is the mark the artwork's tablet should have been
// carrying — the plate's glyph column is invented, this one is not.
//
// Drawn in vector rather than baked into the plate so it scales, takes the
// face's colour through `currentColor`, and burns with the page. The glow is
// CSS (see `.rune-bind` in App.css), not painted into the geometry.
//
// PROPORTIONS: seven stacked runes make a tall column — viewBox 24×164,
// aspect ~1:7 — not the 24×32 icon box Rune.jsx uses. It is a signature mark,
// not a card icon; sizing it like one will crush it. Give it height and let
// the width follow.
import React from 'react'

// The stave every segment hangs from, drawn once. One unbroken vertical is
// what makes this a single bound mark rather than seven glyphs in a stack.
const STAVE = 'M12 4 V160'

// The binding, in order, top to bottom. Coordinates are absolute within the
// viewBox: each rune owns a band of the stave and its strokes are written
// where they sit, so tuning one segment cannot silently reflow the others.
//
// Kept as data — and labelled — because the point of a bindrune is that every
// stroke means something. If a segment moves, its meaning moves with it.
const BINDING = [
  {
    rune: 'Wunjo',
    meaning: 'joy, and the wish fulfilled',
    // The pointed bowl. Raidho repeats it below; that echo is deliberate.
    strokes: ['M12 5 L20 11 L12 17'],
  },
  {
    rune: 'Raidho',
    meaning: 'the ride, the journey',
    // Wunjo's bowl plus the leg — the leg is the whole difference between them.
    strokes: ['M12 19 L20 25 L12 31', 'M12 31 L20 40'],
  },
  {
    rune: 'Othala',
    meaning: 'the inherited homestead, the domain one keeps',
    // Diamond centred on the stave, which runs straight through it, plus the
    // splayed legs. Without the legs this reads as Ingwaz, not Othala.
    strokes: ['M12 42 L19 51 L12 60 L5 51 Z', 'M12 60 L18 69', 'M12 60 L6 69'],
  },
  {
    rune: 'Ansuz',
    meaning: 'the breath that carries a word',
    // Arms fall away from the stave. Fehu's rise — that slope is the only
    // thing telling the two apart, so keep them opposed.
    strokes: ['M12 72 L20 78', 'M12 82 L20 88'],
  },
  {
    rune: 'Berkano',
    meaning: 'the birch — growth, and literally wood',
    // Two bows meeting at 102, so it reads as one closed figure rather than
    // two separate bowls. Kept tight against Ansuz above it.
    strokes: ['M12 90 L20 96 L12 102', 'M12 102 L20 108 L12 114'],
  },
  {
    rune: 'Fehu',
    meaning: 'cattle, moveable wealth — what the work earns',
    strokes: ['M12 122 L20 116', 'M12 132 L20 126'],
  },
  {
    rune: 'Tiwaz ×3',
    meaning: 'the guiding star, thrice struck',
    // Tripled: three rooftops stacked apex-to-base so the foot of the mark
    // reads as one arrow pointing back up the stave.
    strokes: [
      'M5 144 L12 136 L19 144',
      'M5 152 L12 144 L19 152',
      'M5 160 L12 152 L19 160',
    ],
  },
]

/** The runes bound here, top to bottom — for copy that has to name them. */
export const BOUND_RUNES = BINDING.map((s) => s.rune)

export default function Bindrune({
  className = '',
  title = 'The Edge of the Map bindrune',
  binding = BINDING,
}) {
  return (
    <svg
      className={`rune-bind ${className}`}
      viewBox="0 0 24 164"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={STAVE} />
      {binding.flatMap((seg) =>
        seg.strokes.map((d, i) => <path key={`${seg.rune}-${i}`} d={d} />)
      )}
    </svg>
  )
}
