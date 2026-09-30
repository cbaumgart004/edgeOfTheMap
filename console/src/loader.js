// The one script a customer site includes (ADR-0007):
//
//   <script src="https://admin.theedgeofthemap.com/loader.js" data-site="storyshaped" async></script>
//
// Visitors get only this file and the window.EOTM bridge; the console itself is
// fetched when an owner opens the editor with ?edit in the URL, Ctrl/Cmd+Shift+E,
// or the Edit site button this file shows while the browser holds her editor
// token (data-edit-button="off" leaves that to the site). It loads the version the site is pinned to and refuses it if
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
  editButton: script?.dataset.editButton !== 'off',
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
    editButton(false)
    // However the editor closes (its own button, or bridge.close), this tab
    // stops reopening it and the Edit site button comes back. Consoles before
    // 1.2.0 do not call onClose, so their close button leaves both as they were.
    const closed = () => {
      try { sessionStorage.removeItem('eotm:edit') } catch { /* private mode */ }
      editButton(signedIn())
    }
    const { unmount } = window.EOTMConsole.mount({ schema, bridge, apiBase: cfg.apiBase, authBase: cfg.authBase, local: cfg.local, onClose: closed })
    bridge.close = () => {
      unmount()
      closed()
    }
  })().catch((err) => {
    editButton(signedIn())
    console.error('[EOTM]', err)
  }).finally(() => { opening = null })
  return opening
}

bridge.open = open

// Whether this browser holds an editor token for this site that has not run
// out (the loader keeps it in localStorage for its 8 hours, see takeHandoff).
// Only the expiry is read; the console API checks the signature.
function signedIn() {
  if (!cfg.site) return false
  try {
    const token = localStorage.getItem(`eotm:token:${cfg.site}`)
    if (!token) return false
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.site === cfg.site && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

// The owner's way back into the editor from any page while she is signed in.
// Its own shadow root, so the site's styles cannot reach it nor it theirs.
let button = null
function editButton(show) {
  if (!cfg.editButton) return
  if (!show || bridge.editing) {
    button?.remove()
    button = null
    return
  }
  if (button || !document.body) return
  button = document.createElement('div')
  button.dataset.eotmEdit = ''
  const root = button.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>
    button { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px;
      background: #1b1b1b; color: #fff; font: 600 15px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 6px 20px rgb(0 0 0 / 0.25); }
    button:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
    svg { display: block; }
  </style><button type="button" title="Open the editor"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Edit site</button>`
  root.querySelector('button').addEventListener('click', () => open())
  document.body.append(button)
}
// The token runs out while the page is open, or another tab signs in or out.
const recheck = () => editButton(signedIn())
addEventListener('storage', (e) => { if (e.key === `eotm:token:${cfg.site}`) recheck() })
addEventListener('visibilitychange', () => { if (!document.hidden) recheck() })
setInterval(recheck, 60_000)

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
else if (document.body) recheck()
else addEventListener('DOMContentLoaded', recheck, { once: true })

addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    open()
  }
})
