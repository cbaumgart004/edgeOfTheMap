import { describe, it, expect } from 'vitest'
import { createRequests } from '../api/requests.js'

// A control project that understands only the statements requests.js sends.
function fakeControl({ operators = [{ user_id: 'op-1', email: 'op@example.com' }] } = {}) {
  const requests = []
  const comments = []
  const subs = new Map()
  const settings = new Map()
  return {
    requests, comments, subs, settings,
    async query(sql, p = []) {
      if (sql.startsWith('INSERT INTO change_requests')) {
        const r = { id: `00000000-0000-4000-8000-00000000000${requests.length + 1}`, site_id: p[0], user_id: p[1], email: p[2], page: p[3], body: p[4], status: 'new', created_at: 'now' }
        requests.push(r)
        return { rows: [r] }
      }
      if (sql.startsWith('SELECT o.user_id')) return { rows: operators }
      if (sql.startsWith('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ANY')) return { rows: [...subs.values()].filter((s) => p[0].includes(s.user_id)) }
      if (sql.startsWith('SELECT endpoint, keys FROM push_subscriptions WHERE user_id =')) return { rows: [...subs.values()].filter((s) => s.user_id === p[0]) }
      if (sql.startsWith('INSERT INTO push_subscriptions')) { subs.set(p[0], { endpoint: p[0], user_id: p[1], keys: p[2] }); return { rows: [] } }
      if (sql.startsWith('DELETE FROM push_subscriptions')) { subs.delete(p[0]); return { rowCount: 1 } }
      if (sql.startsWith("SELECT value FROM console_settings")) return { rows: settings.has('vapid') ? [{ value: settings.get('vapid') }] : [] }
      if (sql.startsWith("INSERT INTO console_settings")) { if (!settings.has('vapid')) settings.set('vapid', p[0]); return { rows: [] } }
      if (sql.startsWith('SELECT r.*, COALESCE')) return { rows: requests.filter((x) => x.id === p[0]).map((x) => ({ ...x, site_name: 'StoryShaped Studios' })) }
      if (sql.startsWith('SELECT 1 FROM operators')) return { rows: operators.some((o) => o.user_id === p[0]) ? [{}] : [] }
      if (sql.startsWith('INSERT INTO change_request_comments')) {
        const c = { id: `c-${comments.length + 1}`, request_id: p[0], user_id: p[1], email: p[2], body: p[3], notified: p[4], created_at: 'now' }
        comments.push(c)
        return { rows: [c] }
      }
      if (sql.includes('FROM change_request_comments')) return { rows: comments.filter((c) => p[0].includes(c.request_id)) }
      if (sql.startsWith('UPDATE change_requests SET status = CASE')) {
        const r = requests.find((x) => x.id === p[0])
        if (r?.status === 'new') r.status = 'active'
        return { rowCount: r ? 1 : 0 }
      }
      if (sql.startsWith('UPDATE change_requests SET')) {
        const r = requests.find((x) => x.id === p[0])
        for (const [, col, n] of sql.matchAll(/(\w+) = \$(\d+)/g)) if (r) r[col] = p[Number(n) - 1]
        return { rowCount: r ? 1 : 0 }
      }
      // list() and mine(): every request, as the joins would give them.
      if (sql.includes('FROM change_requests r')) return { rows: requests.filter((x) => !sql.includes('r.user_id = $1') || x.user_id === p[0]).map((x) => ({ ...x, site_name: 'StoryShaped Studios' })) }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
}

const SITE = { id: 'site-1', name: 'StoryShaped Studios' }
const USER = { id: 'u-1', email: 'whitney@example.com' }
const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }

function setup(opts = {}) {
  const control = fakeControl(opts)
  const mail = []
  const pushes = []
  let pushFails = null
  const requests = createRequests({
    control,
    sendEmail: opts.noEmail ? undefined : async (m) => { mail.push(m) },
    sendPush: async (sub, payload) => { if (pushFails) throw pushFails; pushes.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }) },
    generateVapid: () => ({ publicKey: 'pub', privateKey: 'priv' }),
  })
  return { control, mail, pushes, requests, failPush: (err) => { pushFails = err } }
}

describe('change requests', () => {
  it('saves a request, emails every operator and pushes to their browsers', async () => {
    const { control, mail, pushes, requests } = setup()
    await requests.subscribe({ id: 'op-1' }, SUB)
    await requests.submit(SITE, USER, { body: '  Make the footer bigger ', page: '/library' })
    expect(control.requests[0]).toMatchObject({ body: 'Make the footer bigger', page: '/library', email: 'whitney@example.com' })
    expect(mail).toEqual([expect.objectContaining({ to: 'op@example.com', subject: 'New ticket: StoryShaped Studios' })])
    expect(mail[0].text).toMatch(/whitney@example.com \(on \/library\):\n\nMake the footer bigger/)
    expect(pushes).toEqual([expect.objectContaining({ endpoint: SUB.endpoint, title: 'New ticket: StoryShaped Studios', url: `https://admin.theedgeofthemap.com/?manage#ticket-${control.requests[0].id}` })])
  })

  it('refuses an empty request and drops a page that is not a site path', async () => {
    const { control, requests } = setup()
    await expect(requests.submit(SITE, USER, { body: '   ' })).rejects.toMatchObject({ status: 400 })
    await requests.submit(SITE, USER, { body: 'x', page: 'https://evil.example' })
    expect(control.requests[0].page).toBeNull()
  })

  it('keeps the request when email or push fails, and forgets a gone subscription', async () => {
    const { control, requests, failPush } = setup()
    await requests.subscribe({ id: 'op-1' }, SUB)
    failPush(Object.assign(new Error('gone'), { statusCode: 410 }))
    await requests.submit(SITE, USER, { body: 'still saved' })
    expect(control.requests).toHaveLength(1)
    expect(control.subs.size).toBe(0)
  })

  it('makes one VAPID key pair and keeps it', async () => {
    const { requests, control } = setup()
    expect(await requests.publicKey()).toBe('pub')
    expect(control.settings.get('vapid')).toEqual({ publicKey: 'pub', privateKey: 'priv' })
  })

  it('a comment tells the requester by email and push, and makes a New ticket Active', async () => {
    const { control, mail, pushes, requests } = setup()
    await requests.subscribe(USER, SUB)
    const { id } = await requests.submit(SITE, USER, { body: 'Bigger footer' })
    mail.length = 0
    pushes.length = 0
    await requests.comment(id, { body: 'On it today.', notify: true }, { id: 'op-1', email: 'op@example.com' })
    expect(control.requests[0].status).toBe('active')
    expect(control.comments[0]).toMatchObject({ body: 'On it today.', notified: true })
    expect(mail).toEqual([expect.objectContaining({ to: 'whitney@example.com', subject: 'Reply to your request (StoryShaped Studios)' })])
    expect(pushes).toEqual([expect.objectContaining({ endpoint: SUB.endpoint, body: expect.stringContaining('On it today.') })])
    const [listed] = await requests.list()
    expect(listed.comments).toHaveLength(1)
    const [mine] = await requests.mine(USER)
    expect(mine.comments).toEqual([{ email: 'op@example.com', body: 'On it today.', created_at: 'now' }])
  })

  it('a quiet comment tells no one', async () => {
    const { mail, requests } = setup()
    const { id } = await requests.submit(SITE, USER, { body: 'x' })
    mail.length = 0
    await requests.comment(id, { body: 'note to self', notify: false }, { id: 'op-1' })
    expect(mail).toEqual([])
  })

  it('moves a ticket through DevOps states and assigns only operators', async () => {
    const { control, mail, requests } = setup()
    const { id } = await requests.submit(SITE, USER, { body: 'x' })
    mail.length = 0
    await requests.update(id, { status: 'resolved', notify: true }, { id: 'op-1', email: 'op@example.com' })
    expect(control.requests[0].status).toBe('resolved')
    expect(mail[0]).toMatchObject({ to: 'whitney@example.com', subject: 'Your request is now Resolved' })
    await requests.update(id, { assignedTo: 'op-1' }, { id: 'op-1' })
    expect(control.requests[0].assigned_to).toBe('op-1')
    await expect(requests.update(id, { assignedTo: 'u-1' }, { id: 'op-1' })).rejects.toMatchObject({ status: 400 })
    await expect(requests.update(id, { status: 'done' }, { id: 'op-1' })).rejects.toMatchObject({ status: 400 })
  })

  it('sends a test new-ticket alert shaped like a real one, saving nothing', async () => {
    const { control, pushes, requests } = setup()
    await requests.subscribe({ id: 'op-1' }, SUB)
    expect(await requests.test({ id: 'op-1', email: 'op@example.com' }, 'ticket')).toEqual({ sent: 1, of: 1 })
    expect(pushes[0].title).toBe('New ticket: StoryShaped Studios (test)')
    expect(control.requests).toEqual([])
  })

  it('refuses a subscription that is not one', async () => {
    await expect(setup().requests.subscribe({ id: 'op-1' }, { endpoint: 'http://x' })).rejects.toMatchObject({ status: 400 })
  })
})
