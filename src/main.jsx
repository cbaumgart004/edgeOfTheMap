// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'

// Self-hosted so the fonts named in App.css actually resolve, and so the
// site makes no third-party request to render.
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/600.css'

import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
