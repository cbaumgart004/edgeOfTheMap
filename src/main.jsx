// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'

// Only the mystic face ships a webfont — the default face uses the system UI
// stack, which costs nothing and reads as native on every platform.
// Self-hosted so the site makes no third-party request to render.
//
// The `latin-` entrypoints, not the bare `400.css`/`600.css`: those declare all
// five subsets (cyrillic, cyrillic-ext, vietnamese, latin-ext, latin), so ten
// @font-face blocks land in the render-blocking stylesheet where two can ever
// match this copy — and Vite emits a .woff fallback for each, twenty font files
// to ship two. The subset imports cut both to the pair actually used.
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-600.css'

import App from './App.jsx'
import './index.css'

// Warm the serif once the page is idle. The @font-face rules ship in the CSS
// but the woff2 is not fetched until a glyph needs it — which is the moment the
// burn flips the face, 60ms in. That put a ~45KB request on the frame the mask
// transition starts, and `font-display: swap` then re-laid out the whole
// document mid-burn: the mystic reveal arrived in system-ui and snapped to
// serif a beat later. Serif type is half that face's identity, so it should be
// resident before the toggle is ever pressed, not fetched because it was.
const warmMysticFont = () => {
  if (!document.fonts?.load) return
  document.fonts.load('400 1rem "Cormorant Garamond"')
  document.fonts.load('600 1rem "Cormorant Garamond"')
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(warmMysticFont)
} else {
  setTimeout(warmMysticFont, 1200)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
