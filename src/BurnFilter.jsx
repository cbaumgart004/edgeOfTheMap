// BurnFilter.jsx
//
// The displacement filter that gives the mode transition its ragged, burning
// edge. It lives on a wrapper element rather than on the masked layers
// themselves: CSS applies `filter` *before* `mask`, so filtering the masked
// element would leave a clean circular edge. Filtering the parent displaces
// the already-composited mask instead, which is what makes it look torn.
import React from 'react'

export default function BurnFilter() {
  return (
    <svg className="burn-defs" aria-hidden="true" focusable="false">
      <defs>
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
      </defs>
    </svg>
  )
}
