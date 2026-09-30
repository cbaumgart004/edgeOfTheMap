// The uptime monitors on the management page: every UptimeRobot monitor on the
// account, read through its API v2 with a read-only key, so the page shows
// what the phone app alerts on. Cached a minute per warm container; UptimeRobot
// checks every five.
//
// The key is pasted once on the Manage page ("Connect UptimeRobot") and kept in
// console_settings beside the Web Push keys; it is checked against UptimeRobot
// before it is kept and never sent back to a browser. The account's main key
// (full access) is refused: the page only reads.
//
// deps: control { query }, fetch (the global one in Lambda),
//       fallbackKey(): Promise<string> (optional: a key in SSM named by
//       UPTIMEROBOT_KEY_PARAM, used when none was pasted)

import { ServiceError } from '../core/service.js'

const API = 'https://api.uptimerobot.com/v2/getMonitors'
const DASHBOARD = 'https://dashboard.uptimerobot.com/monitors'
// UptimeRobot's status codes (API v2, getMonitors).
const STATUS = { 0: 'paused', 1: 'not checked yet', 2: 'up', 8: 'seems down', 9: 'down' }
const EVENT = { 1: 'down', 2: 'up', 98: 'started', 99: 'paused' }

export function createMonitors(deps) {
  const q = (sql, params) => deps.control.query(sql, params)
  let cache = null

  async function storedKey() {
    const { rows } = await q("SELECT value FROM console_settings WHERE name = 'uptimerobot'")
    if (rows[0]?.value?.key) return rows[0].value.key
    return deps.fallbackKey ? deps.fallbackKey() : null
  }

  // Each monitor with: uptime for each of the last 30 days (oldest first), its
  // response times over the last 24 hours, and its last 20 events (down, up,
  // paused, started) with UptimeRobot's reason.
  async function fetchMonitors(key, now = Date.now()) {
    const day = 86_400
    const today = Math.floor(now / 1000 / day) * day // UTC midnight
    const days = Array.from({ length: 30 }, (_, i) => today - (29 - i) * day)
    const ranges = days.map((start) => `${start}_${Math.min(start + day, Math.floor(now / 1000))}`).join('-')
    const res = await deps.fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
      body: new URLSearchParams({
        api_key: key, format: 'json', custom_uptime_ratios: '1-30', custom_uptime_ranges: ranges,
        response_times: '1', response_times_start_date: String(Math.floor(now / 1000) - day), response_times_end_date: String(Math.floor(now / 1000)),
        logs: '1', logs_limit: '20',
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.stat !== 'ok') throw new ServiceError(502, `UptimeRobot did not accept the key (${data?.error?.message ?? res.status}).`)
    const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
    return data.monitors.map((m) => {
      const [uptimeDay, uptimeMonth] = String(m.custom_uptime_ratio ?? '').split('-').map(num)
      const daily = String(m.custom_uptime_ranges ?? '').split('-').map(num)
      return {
        id: m.id, name: m.friendly_name, url: m.url, status: STATUS[m.status] ?? 'unknown', interval: m.interval,
        uptimeDay: uptimeDay ?? null, uptimeMonth: uptimeMonth ?? null,
        days: days.map((start, i) => ({ date: new Date(start * 1000).toISOString().slice(0, 10), uptime: daily[i] ?? null })),
        responseAvg: num(m.average_response_time),
        responses: (m.response_times ?? []).map((r) => ({ at: r.datetime * 1000, ms: r.value })).sort((a, b) => a.at - b.at),
        events: (m.logs ?? []).map((l) => ({
          type: EVENT[l.type] ?? 'event', at: l.datetime * 1000, seconds: l.duration ?? null,
          reason: [l.reason?.code, l.reason?.detail].filter(Boolean).join(' '),
        })),
      }
    })
  }

  return {
    async list() {
      if (cache && cache.at > Date.now() - 60_000) return cache.value
      const key = await storedKey()
      if (!key) return { configured: false, monitors: [] }
      const value = { configured: true, dashboard: DASHBOARD, monitors: await fetchMonitors(key) }
      cache = { at: Date.now(), value }
      return value
    },

    async connect(input) {
      const key = String(input ?? '').trim()
      if (!/^[\w-]{10,100}$/.test(key)) throw new ServiceError(400, 'Paste the Read-Only API Key from UptimeRobot (Integrations & API).')
      // Main keys start u<digits>-, read-only ones ur<digits>-.
      if (/^u\d/.test(key)) throw new ServiceError(400, 'That is the main API key, which can change monitors. Use the Read-Only API Key.')
      const monitors = await fetchMonitors(key)
      await q(`INSERT INTO console_settings (name, value) VALUES ('uptimerobot', $1)
               ON CONFLICT (name) DO UPDATE SET value = $1`, [{ key }])
      cache = { at: Date.now(), value: { configured: true, dashboard: DASHBOARD, monitors } }
      return cache.value
    },

    async disconnect() {
      await q("DELETE FROM console_settings WHERE name = 'uptimerobot'")
      cache = null
    },
  }
}
