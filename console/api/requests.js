// Change requests and the notifications they raise.
//
// A site's owner asks for something the editor cannot do ("Request a change",
// in the editor or on the admin page). The request is kept in the control
// project for operators to work through on the management page, and every
// operator is told at once: an email to each operator login, and a push to
// every browser an operator turned notifications on in. A failed email or push
// is logged and never loses the request.
//
// deps: control { query }, sendEmail({ to, subject, text }) (optional: absent
// means no email), sendPush(subscription, payload, vapid) -> throws with
// statusCode 404/410 for a gone subscription, generateVapid() -> { publicKey, privateKey }

import { ServiceError } from '../core/service.js'

const MAX_BODY = 4000
const MANAGE_URL = 'https://admin.theedgeofthemap.com/?manage'

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
        subject: `Change request: ${site.name}`,
        text: `${user.email ?? 'An editor'}${page ? ` (on ${page})` : ''}:\n\n${body}`,
        url: MANAGE_URL,
      })
      return { id: saved.id, created_at: saved.created_at }
    },

    // Operators: every open request, then the last 20 done.
    async list() {
      const { rows } = await q(
        `(SELECT r.*, s.name AS site_name, s.slug AS site FROM change_requests r JOIN sites s ON s.id = r.site_id
          WHERE r.status = 'open' ORDER BY r.created_at DESC)
         UNION ALL
         (SELECT r.*, s.name AS site_name, s.slug AS site FROM change_requests r JOIN sites s ON s.id = r.site_id
          WHERE r.status = 'done' ORDER BY r.done_at DESC LIMIT 20)`)
      return rows.map(({ site_id, user_id, ...r }) => r)
    },

    async setStatus(id, status) {
      if (!['open', 'done'].includes(status)) throw new ServiceError(400, 'Status must be open or done.')
      const { rowCount } = await q(
        `UPDATE change_requests SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() END WHERE id = $1`, [id, status])
      if (!rowCount) throw new ServiceError(404, 'No such request.')
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
    async test(user) {
      const subs = (await q('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1', [user.id])).rows
      if (!subs.length) throw new ServiceError(400, 'Turn on notifications on this device first.')
      const results = await pushTo(subs, JSON.stringify({ title: 'Edge of the Map', body: 'Notifications are working on this device.', url: MANAGE_URL }))
      return { sent: results.filter((r) => r !== false).length, of: subs.length }
    },
  }
}
