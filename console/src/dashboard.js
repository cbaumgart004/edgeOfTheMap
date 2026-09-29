// admin.theedgeofthemap.com: sign in, then the sites this login edits, each
// opening on its own live page with the editor. Also where a password is set
// or reset. A site link signs the owner into that site's editor too (handoff).
// Same sign-in code as the console (auth.js), reached through this
// host's /_edit/auth rewrite.

import { neonAuth } from './auth.js'
import { mountRunes } from './runes.js'

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
// A toast pinned to the bottom of the screen, so it is seen however far down
// the page the owner is. Confirmations fade; errors stay until the next message.
let sayTimer = null
function say(msg, isError = false) {
  const el = $('#msg')
  clearTimeout(sayTimer)
  el.textContent = msg ?? ''
  el.className = isError ? 'msg is-error' : 'msg'
  if (msg && !isError && !/…$/.test(msg)) sayTimer = setTimeout(() => { el.textContent = '' }, 4000)
}

// Trades this page's sign-in for an editor token for one site and goes there
// with it in the URL fragment, which is never sent to a server. `back` is a path
// on that site; the site's address itself comes from the API, so this cannot be
// pointed at another domain.
async function handoff(site, back = '/', origin) {
  say('Opening the editor…')
  const token = await auth.getToken()
  if (!token) return show('signin')
  const res = await fetch('/api/handoff', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ site, origin }),
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
  return q.get('handoff') ? { site: q.get('handoff'), back: q.get('return') ?? '/', origin: q.get('origin') ?? undefined } : null
})()

// A site's logo, or its initial when it has none or the image fails to load.
const initial = (name) => `<span class="logo is-initial" aria-hidden="true">${esc(String(name ?? '?').trim().charAt(0).toUpperCase())}</span>`
const logo = (s) => s.logo
  ? `<img class="logo" src="${esc(s.logo)}" alt="" loading="lazy" data-initial="${esc(s.name)}" />`
  : initial(s.name)
document.addEventListener('error', (e) => {
  if (e.target.matches?.('img.logo')) e.target.outerHTML = initial(e.target.dataset.initial)
}, true)

// Signing in for one site: say which, with its logo. The boot answer is public.
async function showForSite() {
  if (!pending || !/^[a-z0-9-]+$/.test(pending.site)) return
  try {
    const res = await fetch(`/api/sites/${pending.site}/boot`)
    if (!res.ok) return
    const s = await res.json()
    const box = $('#for-site')
    box.innerHTML = `${logo(s)}<span>Sign in to edit <strong>${esc(s.name)}</strong></span>`
    box.hidden = false
  } catch { /* the plain sign-in still works */ }
}

async function loadSites() {
  const token = await auth.getToken()
  if (!token) return show('signin')
  const res = await fetch('/api/me/sites', { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 401) return show('signin')
  const data = await res.json()
  // A login made with an operator's temporary password: nothing else until it is replaced.
  if (data.mustChangePassword) {
    $('#who-first').textContent = data.email ?? ''
    return show('first')
  }
  if (pending) return handoff(pending.site, pending.back, pending.origin)
  $('#who').textContent = data.email ?? ''
  $('#manage-open').hidden = !data.operator
  // admin.theedgeofthemap.com/?manage opens the management page directly.
  if (data.operator && new URLSearchParams(location.search).has('manage')) return loadManage()
  $('#sites').innerHTML = data.sites.length
    ? data.sites.map((s) => `<li><a class="site" data-site="${esc(s.slug)}" href="${esc(s.url)}/?edit">${logo(s)}<div><strong>${esc(s.name)}</strong><span>${esc(s.url.replace(/^https:\/\//, ''))} · ${esc(s.role)}</span></div></a>${
      // A site with a preview (or a second domain): open that one instead.
      (s.origins ?? []).length > 1 ? `<p class="meta alts">Also open: ${s.origins.slice(1).map((o) => `<button type="button" class="link" data-site="${esc(s.slug)}" data-origin="${esc(o)}">${esc(o.replace(/^https:\/\//, ''))}</button>`).join(' · ')}</p>` : ''}</li>`).join('')
    : '<li class="empty">No sites yet. Ask Edge of the Map to add you to one.</li>'
  $('#request').hidden = !data.sites.length
  $('#rq-site').innerHTML = data.sites.map((s) => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('')
  show('sites')
}

async function start() {
  const token = new URLSearchParams(location.search).get('token')
  if (token && location.pathname.startsWith('/reset')) return show('reset')
  const session = await auth.current()
  if (session) await loadSites()
  else show('signin')
}
showForSite()

// Show or hide each password as typed, for phones especially.
for (const input of document.querySelectorAll('input[type=password]')) {
  const wrap = document.createElement('div')
  wrap.className = 'pw'
  input.replaceWith(wrap)
  const toggle = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Show' })
  toggle.setAttribute('aria-label', 'Show password')
  toggle.addEventListener('click', () => {
    const hidden = input.type === 'password'
    input.type = hidden ? 'text' : 'password'
    toggle.textContent = hidden ? 'Hide' : 'Show'
    toggle.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password')
    input.focus()
  })
  wrap.append(input, toggle)
}

$('#cant').addEventListener('click', () => {
  const help = $('#help')
  help.hidden = !help.hidden
  $('#cant').setAttribute('aria-expanded', String(!help.hidden))
})

$('#help-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = $('#email').value.trim()
  if (!email) { $('#email').focus(); return say('Enter the email you sign in with, above.', true) }
  say('Sending…')
  try {
    const res = await fetch('/api/signin-help', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, body: $('#help-body').value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error ?? 'Could not send. Try again shortly.', true)
    $('#help-body').value = ''
    say(`Sent. We will reply to ${email}.`)
  } catch {
    say('Could not reach the server. Try again shortly.', true)
  }
})

$('#sites').addEventListener('click', (e) => {
  const alt = e.target.closest('button[data-origin]')
  if (alt) return handoff(alt.dataset.site, '/', alt.dataset.origin).catch((err) => say(err.message, true))
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
  if (!email) { $('#email').focus(); return say('Enter your email above first.', true) }
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
// quiet: a refresh after a save, which must not clear the save's message.
async function loadManage({ quiet = false } = {}) {
  if (!quiet) say('Loading…')
  state = await api('GET', '/api/manage')
  if (!quiet) say('')
  const versions = state.releases.map((r) => r.version).reverse()
  // An API older than the page sends no profileFields; show no company details rather than break.
  const profileFields = state.profileFields ?? []
  const urlFields = profileFields.filter((f) => f.kind === 'url')
  // A save re-renders the cards; keep open whichever details were open.
  const openDetails = new Set([...document.querySelectorAll('details.company[open]')].map((d) => d.closest('[data-slug]').dataset.slug))
  $('#m-sites').innerHTML = state.sites.map((s) => `
    <li class="card" data-slug="${esc(s.slug)}">
      <h3>${esc(s.name)}</h3>
      ${s.console_version === versions[0] ? '' : `<p class="behind">Editor ${esc(s.console_version)}; the newest is ${esc(versions[0])}. Choose it under Editor version and Save.</p>`}
      <p class="meta">${s.origins.map((o) => `<a href="${esc(o)}" target="_blank" rel="noopener">${esc(o.replace(/^https:\/\//, ''))}</a>`).join(' · ')}
        ${s.repo ? ` · <a href="${esc(s.repo)}" target="_blank" rel="noopener">repo</a>` : ''}${
        // Every recorded address in one line, so each piece is a click away.
        urlFields.filter((f) => s.profile?.[f.key]).map((f) => ` · <a href="${esc(s.profile[f.key])}" target="_blank" rel="noopener">${esc(f.label.replace(/ page$/, ''))}</a>`).join('')}</p>
      ${profileFields.length ? `<details class="company">
        <summary>Company details${Object.keys(s.profile ?? {}).length ? '' : ' (none recorded)'}</summary>
        <form class="grid" data-form="profile">
          ${profileFields.map((f) => f.kind === 'lines'
            ? `<div style="grid-column: 1 / -1"><label>${esc(f.label)}</label><textarea name="${esc(f.key)}" rows="3" placeholder="${esc(f.placeholder ?? '')}">${esc(s.profile?.[f.key] ?? '')}</textarea></div>`
            : `<div><label>${esc(f.label)}</label><input name="${esc(f.key)}" ${f.kind === 'url' ? 'type="url" placeholder="https://…"' : `placeholder="${esc(f.placeholder ?? '')}"`} value="${esc(s.profile?.[f.key] ?? '')}" /></div>`).join('')}
          <p class="meta" style="grid-column: 1 / -1">Names, ids and addresses only. Passwords and keys belong in a password manager.</p>
          <div><button type="submit">Save details</button></div>
        </form>
      </details>` : ''}
      <form class="grid" data-form="site">
        <div><label>Repository</label><input name="repo" value="${esc(s.repo ?? '')}" placeholder="https://github.com/owner/repo" /></div>
        <div><label>Editor version</label><select name="consoleVersion">${versions.map((v) => `<option${v === s.console_version ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div><label>Own photo bucket (blank: the shared one)</label><input name="mediaBucket" value="${esc(s.media_bucket)}" placeholder="shared" /></div>
        <div><label>Own photo address</label><input name="mediaBaseUrl" value="${esc(s.media_base_url)}" placeholder="shared" /></div>
        <div style="grid-column: 1 / -1"><label>Notes (operators only; no passwords or keys)</label>
          <textarea name="notes" rows="4" placeholder="Anything Company details has no field for…">${esc(s.notes ?? '')}</textarea></div>
        <div><button type="submit">Save</button></div>
      </form>
      ${s.members.length ? `<ul class="members">
        <li class="member is-head" aria-hidden="true"><span>Name</span><span>Username (email)</span><span>Role</span><span></span></li>
        ${s.members.map((m) => `<li class="member">
          <span class="m-name">${esc(m.name || '—')}</span>
          <span class="m-email">${esc(m.email ?? m.user_id)}</span>
          <select data-role="${esc(m.user_id)}" aria-label="Role for ${esc(m.email ?? m.user_id)}">${['owner', 'editor'].map((r) => `<option value="${r}"${r === m.role ? ' selected' : ''}>${r === 'owner' ? 'Owner' : 'Editor'}</option>`).join('')}</select>
          <button type="button" class="link" data-remove="${esc(m.user_id)}">Remove</button>
        </li>`).join('')}</ul>` : '<p class="empty">No members.</p>'}
      <p class="meta"><button type="button" class="link" data-token="${esc(s.slug)}">Copy an editor token</button>
        for scripts such as a content import: edits only this site, lasts 8 hours. Paste it straight into the command; never into a file.</p>
      <form class="grid" data-form="member">
        <div><label>Add an existing login</label><input name="email" type="email" required placeholder="email" /></div>
        <div><label>Role</label><select name="role"><option value="editor">Editor</option><option value="owner">Owner</option></select></div>
        <div><button type="submit">Add</button></div>
      </form>
    </li>`).join('')
  for (const slug of openDetails) document.querySelector(`[data-slug="${CSS.escape(slug)}"] details.company`)?.setAttribute('open', '')
  $('#mu-site').innerHTML = '<option value="">No site yet</option>' + state.sites.map((s) => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('')
  $('#m-ops').innerHTML = state.operators.map((o) => `<li>${esc(o.email ?? o.user_id)}</li>`).join('')
  $('#m-logins').innerHTML = state.logins.map((l) => `<li><span>${esc(l.email)}${l.name ? ` · ${esc(l.name)}` : ''}</span></li>`).join('')
  show('manage')
  // Requests are one part of the page: failing to load them (say, a migration
  // not yet run) must not hide the sites, versions and logins above.
  try {
    renderRequests(await api('GET', '/api/manage/requests'))
  } catch (err) {
    $('#m-req-count').textContent = ''
    $('#m-requests').innerHTML = `<li class="empty">Requests could not load: ${esc(err.message)}</li>`
  }
  pushStatus().catch(() => {})
  if (!new URLSearchParams(location.search).has('manage')) history.replaceState({}, '', '/?manage')
}

// Change requests, open first (api/requests.js). Done ones fade and can reopen.
function renderRequests(list) {
  const open = list.filter((r) => r.status === 'open').length
  $('#m-req-count').textContent = open ? `${open} open` : 'none open'
  $('#m-requests').innerHTML = list.map((r) => `
    <li class="card${r.status === 'done' ? ' is-done' : ''}">
      <p class="meta">${esc(r.site_name)} · ${esc(r.email ?? 'unknown')}${r.page ? ` · ${esc(r.page)}` : ''} · ${esc(new Date(r.created_at).toLocaleString())}</p>
      <p class="request">${esc(r.body)}</p>
      <div><button type="button" class="link" data-req="${esc(r.id)}" data-status="${r.status === 'open' ? 'done' : 'open'}">${r.status === 'open' ? 'Mark done' : 'Reopen'}</button></div>
    </li>`).join('') || '<li class="empty">No requests yet.</li>'
}

// Runs a form's action with its submit button showing the outcome in place:
// "Saving…", then "Saved" or "Not saved", as well as the toast. A save that
// re-renders the site cards replaces its button, so the outcome goes on the
// button now standing in the same card and form.
const run = (fn) => async (e) => {
  e.preventDefault()
  const form = e.target.closest?.('form')
  const pick = 'button[type=submit], button:not([type])'
  let btn = form?.querySelector(pick)
  const label = btn?.textContent
  const slug = form?.closest('[data-slug]')?.dataset.slug
  const find = () => {
    if (btn?.isConnected || !slug) return btn
    btn = document.querySelector(`[data-slug="${CSS.escape(slug)}"] form[data-form="${form.dataset.form}"]`)?.querySelector(pick)
    return btn
  }
  const mark = (text, cls) => { const b = find(); if (!b?.isConnected) return; b.textContent = text; b.className = cls; b.disabled = text === 'Saving…' }
  mark('Saving…', '')
  try {
    await fn(e)
    mark('Saved', 'is-done')
  } catch (err) {
    say(err.message, true)
    mark('Not saved', 'is-failed')
  }
  setTimeout(() => mark(label, ''), 2500)
}

$('#manage-open').addEventListener('click', run(loadManage))
$('#manage-back').addEventListener('click', run(async () => { say(''); history.replaceState({}, '', '/'); await loadSites() }))

$('#m-sites').addEventListener('submit', run(async (e) => {
  const form = e.target
  const slug = form.closest('[data-slug]').dataset.slug
  const f = Object.fromEntries(new FormData(form))
  if (form.dataset.form === 'site') {
    await api('PUT', `/api/manage/sites/${slug}`, { ...f, reloadSchema: true })
    say('Saved. The editor picks up the version and fields within a minute.')
  } else if (form.dataset.form === 'profile') {
    await api('PUT', `/api/manage/sites/${slug}`, { profile: f })
    say('Company details saved.')
  } else {
    await api('POST', `/api/manage/sites/${slug}/members`, f)
    say('Added.')
  }
  await loadManage({ quiet: true })
}))
$('#m-sites').addEventListener('click', async (e) => {
  const site = e.target.dataset?.token
  if (site) {
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await auth.getToken()}` }, body: JSON.stringify({ site }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not make a token.')
      await navigator.clipboard.writeText(data.token)
      say(`Copied an editor token for ${site}. It lasts 8 hours.`)
    } catch (err) {
      say(err.message, true)
    }
    return
  }
  const id = e.target.dataset?.remove
  if (!id) return
  const slug = e.target.closest('[data-slug]').dataset.slug
  run(async () => { await api('DELETE', `/api/manage/sites/${slug}/members/${encodeURIComponent(id)}`); say('Removed.'); await loadManage({ quiet: true }) })(e)
})
// A member's role, changed in their row.
$('#m-sites').addEventListener('change', async (e) => {
  const id = e.target.dataset?.role
  if (!id) return
  const slug = e.target.closest('[data-slug]').dataset.slug
  try {
    await api('PUT', `/api/manage/sites/${slug}/members/${encodeURIComponent(id)}`, { role: e.target.value })
    say('Role changed.')
  } catch (err) {
    say(err.message, true)
  }
  await loadManage({ quiet: true })
})

$('#m-requests').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-req]')
  if (!b) return
  try {
    await api('PUT', `/api/manage/requests/${b.dataset.req}`, { status: b.dataset.status })
    renderRequests(await api('GET', '/api/manage/requests'))
  } catch (err) {
    say(err.message, true)
  }
})

$('#request-form').addEventListener('submit', run(async () => {
  await api('POST', '/api/requests', { site: $('#rq-site').value, body: $('#rq-body').value })
  $('#rq-body').value = ''
  say('Sent to Edge of the Map. You will hear back by email.')
}))

// ---------------------------------------------------------------- push
// Notifications on this device for operators: the service worker (sw.js)
// shows what the API pushes. iPhone and iPad allow it only once the page is
// added to the Home Screen and opened from there (iOS 16.4+).
const pushable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const toKey = (b64) => Uint8Array.from(atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pushStatus() {
  if (!pushable) {
    $('#push-on').hidden = true
    $('#push-note').textContent = /iPhone|iPad/.test(navigator.userAgent)
      ? 'To get notifications on this iPhone or iPad: Share → Add to Home Screen, then open Edge of the Map from the Home Screen and come back here.'
      : 'This browser cannot show notifications.'
    return
  }
  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = await reg.pushManager.getSubscription()
  $('#push-on').textContent = sub ? 'Turn off notifications on this device' : 'Turn on notifications on this device'
  $('#push-test').hidden = !sub
  $('#push-note').textContent = sub ? 'This device is told about every change request.' : ''
}

$('#push-on').addEventListener('click', run(async () => {
  const reg = await navigator.serviceWorker.register('/sw.js')
  const current = await reg.pushManager.getSubscription()
  if (current) {
    await api('DELETE', '/api/manage/push', { endpoint: current.endpoint })
    await current.unsubscribe()
  } else {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in the browser settings.')
    const { key } = await (await fetch('/api/push/key')).json()
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) })
    await api('POST', '/api/manage/push', { subscription: sub.toJSON() })
  }
  await pushStatus()
}))

$('#push-test').addEventListener('click', run(async () => {
  const r = await api('POST', '/api/manage/push/test')
  say(`Test sent to ${r.sent} of ${r.of} of your devices.`)
}))

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
  await loadManage({ quiet: true })
}))
$('#m-op').addEventListener('submit', run(async () => {
  await api('POST', '/api/manage/operators', { email: $('#mo-email').value })
  $('#mo-email').value = ''
  say('Operator added.')
  await loadManage({ quiet: true })
}))

$('#first-form').addEventListener('submit', run(async () => {
  const current = $('#first-current').value
  const next = $('#first-new').value
  if (next !== $('#first-again').value) throw new Error('The two new passwords do not match.')
  if (next === current) throw new Error('Choose a password different from the temporary one.')
  await auth.changePassword(current, next)
  await api('POST', '/api/me/password-changed')
  for (const id of ['#first-current', '#first-new', '#first-again']) $(id).value = ''
  say('Password set. Other devices are signed out.')
  await loadSites()
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

for (const b of document.querySelectorAll('#signout, [data-signout]')) {
  b.addEventListener('click', async () => {
    await auth.signOut()
    show('signin')
  })
}

mountRunes($('#runes-body'))
start().catch((err) => say(err.message, true))
