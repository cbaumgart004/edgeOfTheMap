// SvgDefs.jsx
//
// Shared SVG filter definitions. Rendered once, referenced from CSS by id.
import React from 'react'

export default function SvgDefs() {
  return (
    <svg className="svg-defs" aria-hidden="true" focusable="false">
      <defs>
        {/*
          The mode transition's torn edge. Shared by the mask circle that
          punches the hole and by the ember rim that rides it — one filter and
          one seed, so the glow stays registered with the tear it is lighting.
          A perfectly circular ember beside a ragged hole is what reads as fake.

          Tuned low and fine. An earlier pass ran baseFrequency 0.009 at
          scale 110: a ~110px noise period swinging the edge by up to ±55px.
          That was tolerable while the filter sat on a flat sheet, but against
          the hard-edged mask circle it pushed the boundary around in slow
          lobes and looked like a wobbling cut-out. A shorter period (~36px)
          at a quarter of the excursion crinkles the line instead of swinging
          it. Two octaves rather than four: each octave is another noise
          sample per pixel per frame, and the extra detail lands under the
          blur regardless.

          The trailing blur feathers the hole. The mask circle is a hard
          shape, and a hard edge is what makes a displaced boundary look cut
          rather than burnt — the flat-sheet version got its feather from a
          6% gradient ramp that the SVG mask does not have.
        */}
        <filter id="burn-displace" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.028"
            numOctaves="2"
            seed="11"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
            result="torn"
          />
          <feGaussianBlur in="torn" stdDeviation="3" />
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
