import { describe, it, expect } from 'vitest'
import { createMonitors } from '../api/monitors.js'

function fakeUptimeRobot(answer) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, body: Object.fromEntries(init.body) })
    return { ok: true, json: async () => answer }
  }
  return { calls, monitors: createMonitors({ apiKey: async () => 'ur-read-only', fetch }) }
}

describe('uptime monitors', () => {
  it('reads every monitor with its status and uptime, once a minute', async () => {
    const { calls, monitors } = fakeUptimeRobot({ stat: 'ok', monitors: [
      { id: 1, friendly_name: 'theedgeofthemap.com', url: 'https://theedgeofthemap.com', status: 2, interval: 300, custom_uptime_ratio: '100.000-99.876' },
      { id: 2, friendly_name: 'alert-test.invalid', url: 'https://alert-test.invalid', status: 0, interval: 300 },
      { id: 3, friendly_name: 'loader', url: 'https://admin.theedgeofthemap.com/loader.js', status: 9, interval: 300, custom_uptime_ratio: '90-98.5' },
    ] })
    const r = await monitors()
    expect(r.configured).toBe(true)
    expect(r.monitors.map((m) => m.status)).toEqual(['up', 'paused', 'down'])
    expect(r.monitors[0]).toMatchObject({ uptimeDay: 100, uptimeMonth: 99.876 })
    expect(r.monitors[1].uptimeMonth).toBeNull()
    expect(calls[0].body).toMatchObject({ api_key: 'ur-read-only', format: 'json' })
    await monitors()
    expect(calls).toHaveLength(1)
  })

  it('says so when UptimeRobot refuses', async () => {
    const { monitors } = fakeUptimeRobot({ stat: 'fail', error: { message: 'api_key is wrong' } })
    await expect(monitors()).rejects.toMatchObject({ status: 502 })
  })
})
