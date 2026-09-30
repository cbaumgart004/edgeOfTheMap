// The uptime monitors on the management page: every UptimeRobot monitor on the
// account, read through its API v2 with a read-only key, so the page shows
// what the phone app alerts on. Cached a minute per warm container; UptimeRobot
// checks every five.
//
// deps: apiKey(): Promise<string> (the read-only API key, from SSM by name),
//       fetch (the global one in Lambda)

import { ServiceError } from '../core/service.js'

const API = 'https://api.uptimerobot.com/v2/getMonitors'
// UptimeRobot's status codes (API v2, getMonitors).
const STATUS = { 0: 'paused', 1: 'not checked yet', 2: 'up', 8: 'seems down', 9: 'down' }

export function createMonitors(deps) {
  let cache = null
  return async function monitors() {
    if (cache && cache.at > Date.now() - 60_000) return cache.value
    const res = await deps.fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
      body: new URLSearchParams({ api_key: await deps.apiKey(), format: 'json', custom_uptime_ratios: '1-30' }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.stat !== 'ok') throw new ServiceError(502, `UptimeRobot did not answer (${data?.error?.message ?? res.status}).`)
    const value = {
      configured: true,
      dashboard: 'https://dashboard.uptimerobot.com/monitors',
      monitors: data.monitors.map((m) => {
        const [day, month] = String(m.custom_uptime_ratio ?? '').split('-').map(Number)
        return {
          id: m.id, name: m.friendly_name, url: m.url, status: STATUS[m.status] ?? 'unknown',
          interval: m.interval, uptimeDay: Number.isFinite(day) ? day : null, uptimeMonth: Number.isFinite(month) ? month : null,
        }
      }),
    }
    cache = { at: Date.now(), value }
    return value
  }
}
