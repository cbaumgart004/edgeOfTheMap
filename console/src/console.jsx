// The versioned bundle (/console/<version>/console.js). The loader imports it and
// calls mount(); nothing runs on import.

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import css from './console.css?inline'
import { httpStore, localStore } from './store.js'
import { neonAuth, localAuth, editorAuth } from './auth.js'

export const VERSION = __CONSOLE_VERSION__

// opts: { schema, bridge, apiBase?, authBase?, local? }
export function mount({ schema, bridge, apiBase, authBase, local = false }) {
  const style = document.createElement('style')
  style.dataset.eotm = VERSION
  style.textContent = css
  document.head.append(style)

  const host = document.createElement('div')
  host.dataset.eotmHost = ''
  document.body.append(host)

  const auth = local ? localAuth() : editorAuth({ apiBase, site: schema.site, fallback: neonAuth({ base: authBase }) })
  const store = local ? localStore({ schema }) : httpStore({ apiBase, site: schema.site, getToken: () => auth.getToken() })
  const root = createRoot(host)
  bridge.editing = true

  const unmount = () => {
    root.unmount()
    host.remove()
    style.remove()
    bridge.clear()
    bridge.editing = false
  }
  // The admin page the owner came from; none in local mode.
  const dashboard = local ? null : apiBase
  root.render(<App schema={schema} store={store} bridge={bridge} auth={auth} dashboard={dashboard} onClose={unmount} />)
  return { unmount, store }
}
