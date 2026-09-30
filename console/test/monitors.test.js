import { describe, it, expect } from 'vitest'
import { createMonitors } from '../api/monitors.js'

const MONITORS = [
  { id: 1, friendly_name: 'theedgeofthemap.com', url: 'https://theedgeofthemap.com', status: 2, interval: 300, custom_uptime_ratio: '100.000-99.876',
    custom_uptime_ranges: Array.from({ length: 30 }, (_, i) => (i === 29 ? '98.500' : '100.000')).join('-'), average_response_time: '312.5',
    response_times: [{ datetime: 1700000600, value: 400 }, { datetime: 1700000000, value: 300 }],
    logs: [{ type: 1, datetime: 1700000000, duration: 600, reason: { code: '522', detail: 'Connection Timeout' } }, { type: 2, datetime: 1700000600, duration: 0 }] },
  { id: 2, friendly_name: 'alert-test.invalid', url: 'https://alert-test.invalid', status: 0, interval: 300 },
  { id: 3, friendly_name: 'loader', url: 'https://admin.theedgeofthemap.com/loader.js', status: 9, interval: 300, custom_uptime_ratio: '90-98.5' },
]

function setup({ answer = { stat: 'ok', monitors: MONITORS } } = {}) {
  const settings = new Map()
  const calls = []
  const control = {
    async query(sql, p = []) {
      if (sql.startsWith('SELECT value FROM console_settings')) return { rows: settings.has('uptimerobot') ? [{ value: settings.get('uptimerobot') }] : [] }
      if (sql.startsWith('INSERT INTO console_settings')) { settings.set('uptimerobot', p[0]); return { rows: [] } }
      if (sql.startsWith('DELETE FROM console_settings')) { settings.delete('uptimerobot'); return { rowCount: 1 } }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  const fetch = async (url, init) => {
    calls.push(Object.fromEntries(init.body))
    return { ok: true, json: async () => answer }
  }
  return { settings, calls, monitors: createMonitors({ control, fetch }) }
}

describe('uptime monitors', () => {
  it('is not connected until a key is pasted', async () => {
    expect(await setup().monitors.list()).toEqual({ configured: false, monitors: [] })
  })

  it('checks a read-only key, keeps it, and lists every monitor once a minute', async () => {
    const { settings, calls, monitors } = setup()
    const r = await monitors.connect(' ur123456-abcdef0123 ')
    expect(settings.get('uptimerobot')).toEqual({ key: 'ur123456-abcdef0123' })
    expect(r.monitors.map((m) => m.status)).toEqual(['up', 'paused', 'down'])
    expect(r.monitors[0]).toMatchObject({ uptimeDay: 100, uptimeMonth: 99.876 })
    expect(r.monitors[1].uptimeMonth).toBeNull()
    expect(r.monitors[0].days).toHaveLength(30)
    expect(r.monitors[0].days[29].uptime).toBe(98.5)
    expect(r.monitors[0].responses.map((p) => p.ms)).toEqual([300, 400]) // oldest first
    expect(r.monitors[0].events[0]).toEqual({ type: 'down', at: 1700000000000, seconds: 600, reason: '522 Connection Timeout' })
    expect(r.monitors[1].days.every((d) => d.uptime === null)).toBe(true)
    expect(calls[0].custom_uptime_ranges.split('-')).toHaveLength(30)
    expect(calls[0]).toMatchObject({ api_key: 'ur123456-abcdef0123', format: 'json' })
    await monitors.list()
    expect(calls).toHaveLength(1)
    await monitors.disconnect()
    expect((await monitors.list()).configured).toBe(false)
  })

  it('refuses the main (full-access) key and a key UptimeRobot rejects', async () => {
    const { settings, monitors } = setup()
    await expect(monitors.connect('u123456-abcdef0123')).rejects.toMatchObject({ status: 400 })
    const bad = setup({ answer: { stat: 'fail', error: { message: 'api_key not found' } } })
    await expect(bad.monitors.connect('ur123456-abcdef0123')).rejects.toMatchObject({ status: 502 })
    expect(settings.size + bad.settings.size).toBe(0)
  })
})
