// admin.theedgeofthemap.com: sign in, then the sites this login edits, each
// opening on its own live page with the editor. Also where a password is set
// or reset. A site link signs the owner into that site's editor too (handoff).
// Same sign-in code as the console (auth.js), reached through this
// host's /_edit/auth rewrite.

import { neonAuth } from './auth.js'

const auth = neonAuth({ base: '/_edit/auth' })
const $ = (sel) => document.querySelector(sel)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function show(id) {
  for (const el of document.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== id
  document.querySelector('main').classList.toggle('is-wide', id === 'manage')
}

async function api(method, path, body) {
  const token = await auth.getToken()
  if (!token) { show('signin'); throw new Error('Sign in again.') }
  const res = await fetch(path, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}
function say(msg, isError = false) {
  const el = $('#msg')
  el.textContent = msg ?? ''
  el.className = isError ? 'msg is-error' : 'msg'
}

// Trades this page's sign-in for an editor token for one site and goes there
// with it in the URL fragment, which is never sent to a server. `back` is a path
// on that site; the site's address itself comes from the API, so this cannot be
// pointed at another domain.
async function handoff(site, back = '/') {
  say('Opening the editor…')
  const token = await auth.getToken()
  if (!token) return show('signin')
  const res = await fetch('/api/handoff', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ site }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return say(data.error ?? 'Could not open the editor.', true)
  let url = new URL(back, data.url)
  if (url.origin !== new URL(data.url).origin) url = new URL('/', data.url)
  if (!url.searchParams.has('edit')) url.searchParams.set('edit', '')
  location.assign(`${url.href.replace(/edit=(&|$)/, 'edit$1')}#eotm-token=${data.token}`)
}

// A site's editor sends the owner here to sign in (?handoff=<site>&return=<path>).
const pending = (() => {
  const q = new URLSearchParams(location.search)
  return q.get('handoff') ? { site: q.get('handoff'), back: q.get('return') ?? '/' } : null
})()

async function loadSites() {
  const token = await auth.getToken()
  if (!token) return show('signin')
  if (pending) return handoff(pending.site, pending.back)
  const res = await fetch('/api/me/sites', { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 401) return show('signin')
  const data = await res.json()
  $('#who').textContent = data.email ?? ''
  $('#manage-open').hidden = !data.operator
  $('#sites').innerHTML = data.sites.length
    ? data.sites.map((s) => `<li><a class="site" data-site="${esc(s.slug)}" href="${esc(s.url)}/?edit"><strong>${esc(s.name)}</strong><span>${esc(s.url.replace(/^https:\/\//, ''))} · ${esc(s.role)}</span></a></li>`).join('')
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

$('#sites').addEventListener('click', (e) => {
  const link = e.target.closest('a[data-site]')
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  handoff(link.dataset.site).catch((err) => say(err.message, true))
})

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

// Management page (operators): every site, its editor version, photo storage and members.
let state = null
async function loadManage() {
  say('Loading…')
  state = await api('GET', '/api/manage')
  say('')
  const versions = state.releases.map((r) => r.version).reverse()
  $('#m-sites').innerHTML = state.sites.map((s) => `
    <li class="card" data-slug="${esc(s.slug)}">
      <h3>${esc(s.name)}</h3>
      <p class="meta">${s.origins.map((o) => `<a href="${esc(o)}" target="_blank" rel="noopener">${esc(o.replace(/^https:\/\//, ''))}</a>`).join(' · ')}
        ${s.repo ? ` · <a href="${esc(s.repo)}" target="_blank" rel="noopener">repo</a>` : ''}</p>
      <form class="grid" data-form="site">
        <div><label>Repository</label><input name="repo" value="${esc(s.repo ?? '')}" placeholder="https://github.com/owner/repo" /></div>
        <div><label>Editor version</label><select name="consoleVersion">${versions.map((v) => `<option${v === s.console_version ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div><label>Photo bucket</label><input name="mediaBucket" value="${esc(s.media_bucket)}" placeholder="not set up" /></div>
        <div><label>Photo address</label><input name="mediaBaseUrl" value="${esc(s.media_base_url)}" placeholder="https://…" /></div>
        <div><button type="submit">Save</button></div>
      </form>
      <ul class="people">${s.members.map((m) => `<li><span>${esc(m.email ?? m.user_id)} · ${esc(m.role)}</span>
        <button type="button" class="link" data-remove="${esc(m.user_id)}">Remove</button></li>`).join('') || '<li class="empty">No members.</li>'}</ul>
      <form class="grid" data-form="member">
        <div><label>Add an existing login</label><input name="email" type="email" required placeholder="email" /></div>
        <div><label>Role</label><select name="role"><option value="editor">Editor</option><option value="owner">Owner</option></select></div>
        <div><button type="submit">Add</button></div>
      </form>
    </li>`).join('')
  $('#mu-site').innerHTML = '<option value="">No site yet</option>' + state.sites.map((s) => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('')
  $('#m-ops').innerHTML = state.operators.map((o) => `<li>${esc(o.email ?? o.user_id)}</li>`).join('')
  $('#m-logins').innerHTML = state.logins.map((l) => `<li><span>${esc(l.email)}${l.name ? ` · ${esc(l.name)}` : ''}</span></li>`).join('')
  show('manage')
}

const run = (fn) => (e) => { e.preventDefault(); fn(e).catch((err) => say(err.message, true)) }

$('#manage-open').addEventListener('click', run(loadManage))
$('#manage-back').addEventListener('click', run(async () => { say(''); await loadSites() }))

$('#m-sites').addEventListener('submit', run(async (e) => {
  const form = e.target
  const slug = form.closest('[data-slug]').dataset.slug
  const f = Object.fromEntries(new FormData(form))
  if (form.dataset.form === 'site') {
    await api('PUT', `/api/manage/sites/${slug}`, f)
    say('Saved. Sites pick up a new editor version within a minute.')
  } else {
    await api('POST', `/api/manage/sites/${slug}/members`, f)
    say('Added.')
  }
  await loadManage()
}))
$('#m-sites').addEventListener('click', (e) => {
  const id = e.target.dataset?.remove
  if (!id) return
  const slug = e.target.closest('[data-slug]').dataset.slug
  run(async () => { await api('DELETE', `/api/manage/sites/${slug}/members/${encodeURIComponent(id)}`); say('Removed.'); await loadManage() })(e)
})

$('#mu-gen').addEventListener('click', () => {
  const words = new Uint32Array(3)
  crypto.getRandomValues(words)
  $('#mu-pass').value = [...words].map((w) => w.toString(36)).join('-')
})
$('#m-user').addEventListener('submit', run(async () => {
  const body = { email: $('#mu-email').value, name: $('#mu-name').value, password: $('#mu-pass').value, site: $('#mu-site').value || undefined, role: $('#mu-role').value }
  const r = await api('POST', '/api/manage/users', body)
  const out = $('#mu-result')
  out.hidden = false
  out.textContent = r.created
    ? `Created ${r.email}. Give them the temporary password privately and send them to admin.theedgeofthemap.com; they can change it under “Change password”.`
    : `${r.email} already had a login; ${body.site ? 'it now has the site. Its password is unchanged.' : 'nothing changed.'}`
  $('#mu-pass').value = ''
  await loadManage()
}))
$('#m-op').addEventListener('submit', run(async () => {
  await api('POST', '/api/manage/operators', { email: $('#mo-email').value })
  $('#mo-email').value = ''
  say('Operator added.')
  await loadManage()
}))

$('#change-form').addEventListener('submit', run(async () => {
  await auth.changePassword($('#current-password').value, $('#changed-password').value)
  $('#current-password').value = ''
  $('#changed-password').value = ''
  $('#change').open = false
  say('Password changed. Other devices are signed out.')
}))

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
