// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'

// Only the mystic face ships a webfont — the default face uses the system UI
// stack, which costs nothing and reads as native on every platform.
// Self-hosted so the site makes no third-party request to render.
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/600.css'

import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
