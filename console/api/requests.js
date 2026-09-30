// Change requests (tickets) and the notifications they raise.
//
// A site's owner asks for something the editor cannot do ("Request a change",
// in the editor or on the admin page). The request is kept in the control
// project as a ticket operators work like an Azure DevOps work item: a state
// (New, Active, Resolved, Closed), an operator assigned, and comments. Every
// operator is told of a new ticket at once: an email to each operator login,
// and a push to every browser an operator turned notifications on in. A
// comment or state change can tell the requester the same two ways. A failed
// email or push is logged and never loses the ticket.
//
// deps: control { query }, sendEmail({ to, subject, text }) (optional: absent
// means no email), sendPush(subscription, payload, vapid) -> throws with
// statusCode 404/410 for a gone subscription, generateVapid() -> { publicKey, privateKey }

import { ServiceError } from '../core/service.js'

const MAX_BODY = 4000
const MANAGE_URL = 'https://admin.theedgeofthemap.com/?manage'
const HOME_URL = 'https://admin.theedgeofthemap.com/'
// Azure DevOps' Basic process: New, Active, Resolved, Closed.
export const STATES = ['new', 'active', 'resolved', 'closed']
const LABEL = { new: 'New', active: 'Active', resolved: 'Resolved', closed: 'Closed' }

export function createRequests(deps) {
  const q = (sql, params) => deps.control.query(sql, params)

  let vapid = null
  async function vapidKeys() {
    if (vapid) return vapid
    const { rows } = await q("SELECT value FROM console_settings WHERE name = 'vapid'")
    if (rows.length) return (vapid = rows[0].value)
    // Two cold containers may race; the first key pair written wins for both.
    await q("INSERT INTO console_settings (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING", [deps.generateVapid()])
    return (vapid = (await q("SELECT value FROM console_settings WHERE name = 'vapid'")).rows[0].value)
  }

  async function pushTo(subs, payload) {
    const keys = await vapidKeys()
    return Promise.all(subs.map((s) => deps.sendPush({ endpoint: s.endpoint, keys: s.keys }, payload, keys).catch(async (err) => {
      if (err.statusCode === 404 || err.statusCode === 410) await q('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint])
      else console.error('[requests] push failed:', err.message)
      return false
    })))
  }

  // Email and push to every operator. Never throws: the request is already saved.
  async function announce({ subject, text, url }) {
    try {
      const ops = (await q(`SELECT o.user_id, u.email FROM operators o LEFT JOIN neon_auth."user" u ON u.id::text = o.user_id`)).rows
      const jobs = []
      if (deps.sendEmail) {
        for (const to of ops.map((o) => o.email).filter(Boolean)) {
          jobs.push(deps.sendEmail({ to, subject, text: `${text}\n\n${url}` }).catch((err) => console.error('[requests] email to', to, 'failed:', err.message)))
        }
      }
      const subs = (await q('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ANY($1)', [ops.map((o) => o.user_id)])).rows
      if (subs.length) jobs.push(pushTo(subs, JSON.stringify({ title: subject, body: text.slice(0, 180), url })))
      await Promise.all(jobs)
    } catch (err) {
      console.error('[requests] announcing failed:', err.message)
    }
  }

  async function load(id) {
    const { rows } = await q(
      `SELECT r.*, COALESCE(s.name, 'Sign-in help') AS site_name FROM change_requests r LEFT JOIN sites s ON s.id = r.site_id WHERE r.id = $1`, [id])
    if (!rows.length) throw new ServiceError(404, 'No such request.')
    return rows[0]
  }

  async function commentsFor(ids) {
    const by = new Map()
    if (!ids.length) return by
    const { rows } = await q(
      `SELECT id, request_id, email, body, notified, created_at FROM change_request_comments
       WHERE request_id = ANY($1) ORDER BY created_at`, [ids])
    for (const { request_id, ...c } of rows) by.set(request_id, [...(by.get(request_id) ?? []), c])
    return by
  }

  // The person who asked: an email to the address on the ticket, and a push to
  // every browser their login turned notifications on in. Never throws.
  async function tell(ticket, subject, text) {
    try {
      const jobs = []
      if (deps.sendEmail && ticket.email) {
        jobs.push(deps.sendEmail({ to: ticket.email, subject, text: `${text}\n\n${HOME_URL}` }).catch((err) => console.error('[requests] email to requester failed:', err.message)))
      }
      if (ticket.user_id) {
        const subs = (await q('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ANY($1)', [[ticket.user_id]])).rows
        if (subs.length) jobs.push(pushTo(subs, JSON.stringify({ title: subject, body: text.slice(0, 180), url: HOME_URL })))
      }
      await Promise.all(jobs)
    } catch (err) {
      console.error('[requests] telling the requester failed:', err.message)
    }
  }

  return {
    // site: a loaded sites row; user: an authorized member ({ id, email }).
    async submit(site, user, input) {
      const body = String(input?.body ?? '').trim()
      if (!body) throw new ServiceError(400, 'Say what you would like changed.')
      if (body.length > MAX_BODY) throw new ServiceError(400, 'Keep a request under 4,000 characters; send a second one for the rest.')
      const page = typeof input?.page === 'string' && input.page.startsWith('/') ? input.page.slice(0, 500) : null
      const { rows: [saved] } = await q(
        `INSERT INTO change_requests (site_id, user_id, email, page, body) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`, [site.id, user.id, user.email ?? null, page, body])
      await announce({
        subject: `New ticket: ${site.name}`,
        text: `${user.email ?? 'An editor'}${page ? ` (on ${page})` : ''}:\n\n${body}`,
        url: `${MANAGE_URL}#ticket-${saved.id}`,
      })
      return { id: saved.id, created_at: saved.created_at }
    },

    // "Can't sign in?" from the admin page, before any login. The email is only
    // what was typed: an operator checks it against the login before replying.
    async signinHelp(input) {
      const email = String(input?.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ServiceError(400, 'Enter the email you sign in with.')
      const note = String(input?.body ?? '').trim().slice(0, 1000)
      const body = note || 'Cannot sign in.'
      const { rows: [saved] } = await q(
        `INSERT INTO change_requests (site_id, user_id, email, page, body) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`, [null, null, email, null, body])
      await announce({ subject: 'Sign-in help', text: `${email} cannot sign in:\n\n${body}`, url: MANAGE_URL })
      return { id: saved.id }
    },

    // Operators: every ticket not closed, newest first, then the last 20
    // closed; each with its assignee and comment thread.
    async list() {
      const { rows } = await q(
        `(SELECT r.*, COALESCE(s.name, 'Sign-in help') AS site_name, s.slug AS site, a.email AS assigned_email
          FROM change_requests r LEFT JOIN sites s ON s.id = r.site_id LEFT JOIN neon_auth."user" a ON a.id::text = r.assigned_to
          WHERE r.status <> 'closed' ORDER BY r.created_at DESC)
         UNION ALL
         (SELECT r.*, COALESCE(s.name, 'Sign-in help') AS site_name, s.slug AS site, a.email AS assigned_email
          FROM change_requests r LEFT JOIN sites s ON s.id = r.site_id LEFT JOIN neon_auth."user" a ON a.id::text = r.assigned_to
          WHERE r.status = 'closed' ORDER BY r.updated_at DESC LIMIT 20)`)
      const comments = await commentsFor(rows.map((r) => r.id))
      return rows.map(({ site_id, user_id, ...r }) => ({ ...r, comments: comments.get(r.id) ?? [] }))
    },

    // The signed-in user's own tickets and their threads, for the admin page.
    async mine(user) {
      const { rows } = await q(
        `SELECT r.id, r.status, r.page, r.body, r.created_at, r.updated_at, COALESCE(s.name, 'Sign-in help') AS site_name
         FROM change_requests r LEFT JOIN sites s ON s.id = r.site_id
         WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 30`, [user.id])
      const comments = await commentsFor(rows.map((r) => r.id))
      return rows.map((r) => ({ ...r, comments: (comments.get(r.id) ?? []).map(({ email, body, created_at }) => ({ email, body, created_at })) }))
    },

    // An operator moves a ticket's state or assignee. notify: tell the
    // requester about a state change.
    async update(id, input, operator) {
      const ticket = await load(id)
      const sets = []
      const params = [id]
      const set = (col, value) => { params.push(value); sets.push(`${col} = $${params.length}`) }
      if ('status' in input) {
        if (!STATES.includes(input.status)) throw new ServiceError(400, `State must be one of ${STATES.join(', ')}.`)
        set('status', input.status)
        set('done_at', input.status === 'closed' ? new Date().toISOString() : null)
      }
      if ('assignedTo' in input) {
        const to = input.assignedTo ? String(input.assignedTo) : null
        if (to && !(await q('SELECT 1 FROM operators WHERE user_id = $1', [to])).rows.length) throw new ServiceError(400, 'Assign a ticket to an operator.')
        set('assigned_to', to)
      }
      if (!sets.length) throw new ServiceError(400, 'Nothing to change.')
      await q(`UPDATE change_requests SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params)
      if ('status' in input && input.status !== ticket.status && input.notify) {
        await tell(ticket, `Your request is now ${LABEL[input.status]}`, `${operator.email ?? 'Edge of the Map'} moved your request to ${LABEL[input.status]}.\n\n"${ticket.body.slice(0, 300)}"`)
      }
    },

    // An operator comments on a ticket; notify tells the requester.
    async comment(id, input, operator) {
      const ticket = await load(id)
      const body = String(input?.body ?? '').trim()
      if (!body) throw new ServiceError(400, 'Write a comment first.')
      if (body.length > MAX_BODY) throw new ServiceError(400, 'Keep a comment under 4,000 characters.')
      const notify = Boolean(input.notify) && Boolean(ticket.user_id || ticket.email)
      const { rows: [saved] } = await q(
        `INSERT INTO change_request_comments (request_id, user_id, email, body, notified) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`, [id, operator.id, operator.email ?? null, body, notify])
      // A comment on a New ticket means someone is on it.
      await q(`UPDATE change_requests SET status = CASE WHEN status = 'new' THEN 'active' ELSE status END, updated_at = now() WHERE id = $1`, [id])
      if (notify) await tell(ticket, `Reply to your request (${ticket.site_name})`, `${operator.email ?? 'Edge of the Map'}:\n\n${body}`)
      return { id: saved.id, created_at: saved.created_at }
    },

    publicKey: async () => (await vapidKeys()).publicKey,

    async subscribe(user, sub) {
      if (typeof sub?.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
        throw new ServiceError(400, 'That is not a push subscription.')
      }
      await q(`INSERT INTO push_subscriptions (endpoint, user_id, keys) VALUES ($1, $2, $3)
               ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, keys = $3`, [sub.endpoint, user.id, { p256dh: sub.keys.p256dh, auth: sub.keys.auth }])
    },

    async unsubscribe(user, endpoint) {
      await q('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(endpoint ?? ''), user.id])
    },

    // A test notification to the caller's own browsers, from the Manage page.
    // kind 'ticket' is shaped exactly like a new ticket's, so what arrives is
    // what a real one will look like; nothing is saved.
    async test(user, kind) {
      const subs = (await q('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1', [user.id])).rows
      if (!subs.length) throw new ServiceError(400, 'Turn on notifications on this device first.')
      const payload = kind === 'ticket'
        ? { title: 'New ticket: StoryShaped Studios (test)', body: `${user.email ?? 'An editor'} (on /library):\n\nThis is a test ticket. Nothing was saved.`, url: MANAGE_URL }
        : { title: 'Edge of the Map', body: 'Notifications are working on this device.', url: MANAGE_URL }
      const results = await pushTo(subs, JSON.stringify(payload))
      return { sent: results.filter((r) => r !== false).length, of: subs.length }
    },
  }
}
