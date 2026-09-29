// admin.theedgeofthemap.com: sign in, then the sites this login edits, each
// opening on its own live page with the editor. Also where a password is set
// or reset. Same sign-in code as the console (auth.js), reached through this
// host's /_edit/auth rewrite.

import { neonAuth } from './auth.js'

const auth = neonAuth({ base: '/_edit/auth' })
const $ = (sel) => document.querySelector(sel)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function show(id) {
  for (const el of document.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== id
}
function say(msg, isError = false) {
  const el = $('#msg')
  el.textContent = msg ?? ''
  el.className = isError ? 'msg is-error' : 'msg'
}

async function loadSites() {
  const token = await auth.getToken()
  if (!token) return show('signin')
  const res = await fetch('/api/me/sites', { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 401) return show('signin')
  const data = await res.json()
  $('#who').textContent = data.email ?? ''
  $('#sites').innerHTML = data.sites.length
    ? data.sites.map((s) => `<li><a class="site" href="${esc(s.url)}/?edit"><strong>${esc(s.name)}</strong><span>${esc(s.url.replace(/^https:\/\//, ''))} · ${esc(s.role)}</span></a></li>`).join('')
    : '<li class="empty">No sites yet. Ask Edge of the Map to add you to one.</li>'
  show('sites')
}

async function start() {
  const token = new URLSearchParams(location.search).get('token')
  if (token && location.pathname.startsWith('/reset')) return show('reset')
  const session = await auth.current()
  if (session) await loadSites()
  else show('signin')
}

$('#signin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  say('Signing in…')
  try {
    const session = await auth.signIn($('#email').value, $('#password').value)
    if (!session) throw new Error('Signed in, but no editing token came back. Tell Edge of the Map.')
    say('')
    await loadSites()
  } catch (err) {
    say(err.message, true)
  }
})

$('#forgot').addEventListener('click', async () => {
  const email = $('#email').value.trim()
  if (!email) return say('Enter your email first, then choose “Set or reset password”.', true)
  say('Checking…')
  try {
    const res = await fetch('/api/password-reset', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) say(`Sent. A link to set your password is on its way to ${data.email}. It comes from auth@mail.myneon.app; check spam if it is not there in a few minutes.`)
    else if (res.status === 404) say(`No login uses ${data.email ?? email}. Check the spelling, or ask Edge of the Map to add you.`, true)
    else say(data.error ?? 'Could not send the link. Try again shortly.', true)
  } catch {
    say('Could not reach the server. Try again shortly.', true)
  }
})

$('#signup').addEventListener('click', async () => {
  const email = $('#email').value.trim()
  const password = $('#password').value
  if (!email || password.length < 8) return say('Enter your email and a password of at least 8 characters, then choose “Create login”.', true)
  say('Creating your login…')
  try {
    await auth.signUp(email, password)
    say('')
    await loadSites()
  } catch (err) {
    say(/exist/i.test(err.message) ? `A login already uses ${email}. Sign in instead.` : err.message, true)
  }
})

$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const token = new URLSearchParams(location.search).get('token')
  try {
    await auth.resetPassword(token, $('#new-password').value)
    history.replaceState({}, '', '/')
    say('Password set. Sign in with it now.')
    show('signin')
  } catch (err) {
    say(err.message, true)
  }
})

$('#signout').addEventListener('click', async () => {
  await auth.signOut()
  show('signin')
})

start().catch((err) => say(err.message, true))
