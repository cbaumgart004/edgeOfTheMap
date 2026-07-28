// SvgDefs.jsx
//
// Shared SVG filter definitions. Rendered once, referenced from CSS by id.
import React from 'react'

export default function SvgDefs() {
  return (
    <svg className="svg-defs" aria-hidden="true" focusable="false">
      <defs>
        {/*
          The mode transition's torn edge. Applied to a wrapper element rather
          than to the masked layers themselves: CSS applies `filter` before
          `mask`, so filtering the masked element would leave a clean circular
          edge. Filtering the parent displaces the already-composited mask,
          which is what makes it look torn.
        */}
        <filter id="burn-displace" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009"
            numOctaves="4"
            seed="11"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="110"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/*
          Weathered timber for the mystic card frames. Deliberately a low
          displacement — at higher scales the line melts instead of ageing.
          The anisotropic baseFrequency (coarser across than down) gives the
          wobble a grain direction, so edges read as split wood rather than
          as noise.

          Applied to a border-only pseudo-element, never to the card itself,
          so the text stays perfectly straight while its frame does not.
        */}
        <filter id="driftwood" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.022 0.055"
            numOctaves="4"
            seed="23"
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}
