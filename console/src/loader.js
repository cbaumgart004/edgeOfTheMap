// The one script a customer site includes (ADR-0007):
//
//   <script src="https://admin.theedgeofthemap.com/loader.js" data-site="storyshaped" async></script>
//
// Visitors get only this file and the window.EOTM bridge; the console itself is
// fetched when an owner opens the editor with ?edit in the URL or
// Ctrl/Cmd+Shift+E. It loads the version the site is pinned to and refuses it if
// the bytes do not match the pinned integrity hash.
//
// Local mode (demo, development): data-local and data-schema point at a schema
// file and the console stores documents in localStorage.

import { createBridge } from './bridge.js'

const script = document.currentScript
const cfg = {
  site: script?.dataset.site,
  apiBase: script?.dataset.api ?? (script ? new URL(script.src).origin : location.origin),
  authBase: script?.dataset.auth ?? '/_edit/auth',
  local: script?.dataset.local != null,
  schemaUrl: script?.dataset.schema,
  consoleUrl: script?.dataset.console,
}

const bridge = window.EOTM ?? createBridge()
window.EOTM = bridge
let opening = null

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous' }
    s.onload = resolve
    s.onerror = () => reject(new Error(`Could not load the editor (${src}).`))
    document.head.append(s)
  })
}

async function open() {
  if (bridge.editing) return
  if (opening) return opening
  opening = (async () => {
    let schema
    let consoleSrc
    let integrity = null
    if (cfg.local) {
      schema = await (await fetch(cfg.schemaUrl)).json()
      consoleSrc = cfg.consoleUrl
    } else {
      const boot = await (await fetch(`${cfg.apiBase}/api/sites/${cfg.site}/boot`)).json()
      schema = boot.schema
      consoleSrc = `${cfg.apiBase}/console/${boot.version}/console.js`
      integrity = boot.integrity
    }
    if (!window.EOTMConsole) await loadScript(consoleSrc, integrity)
    try { sessionStorage.setItem('eotm:edit', '1') } catch { /* private mode */ }
    const { unmount } = window.EOTMConsole.mount({ schema, bridge, apiBase: cfg.apiBase, authBase: cfg.authBase, local: cfg.local })
    bridge.close = () => {
      unmount()
      try { sessionStorage.removeItem('eotm:edit') } catch { /* private mode */ }
    }
  })().catch((err) => {
    console.error('[EOTM]', err)
  }).finally(() => { opening = null })
  return opening
}

bridge.open = open

// Single sign-on: the admin page sends the owner here with #eotm-token=<editor
// token>. Keep it in this browser until it runs out (8 hours, one site), so a
// second tab opens the editor already signed in; take it out of the address bar
// (and so out of history and anything copied from it), and open the editor.
// It is also written to this tab's sessionStorage, where editors before 1.1.5
// look for it.
function takeHandoff() {
  const m = location.hash.match(/(?:^#|&)eotm-token=([\w.-]+)/)
  if (!m || !cfg.site) return false
  try {
    localStorage.setItem(`eotm:token:${cfg.site}`, m[1])
    sessionStorage.setItem(`eotm:token:${cfg.site}`, m[1])
    sessionStorage.setItem('eotm:edit', '1')
  } catch { /* private mode: the owner signs in on the page instead */ }
  const rest = location.hash.replace(m[0], '').replace(/^#&?/, '')
  history.replaceState(history.state, '', location.pathname + location.search + (rest ? `#${rest}` : ''))
  return true
}
const handedOff = takeHandoff()

const wantsEdit = () => {
  try { return new URLSearchParams(location.search).has('edit') || sessionStorage.getItem('eotm:edit') === '1' } catch { return false }
}
if (handedOff || wantsEdit()) open()

addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    open()
  }
})
