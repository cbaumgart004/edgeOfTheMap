import { describe, it, expect, vi } from 'vitest'
import { createUsage, NEON_CU_HOUR } from '../api/usage.js'

const HOUR = 3_600_000
const NOW = Date.parse('2026-10-24T12:00:00Z')

function setup({ lastHour = 40, cuSeconds = 3600, stored = {}, sendEmail = vi.fn(async () => {}), neonFails = false } = {}) {
  const files = new Map(Object.entries(stored))
  const store = { read: vi.fn(async (k) => files.get(k) ?? null), write: vi.fn(async (k, v) => { files.set(k, v) }) }
  const monthCost = vi.fn(async () => ({ total: 3.2, byService: [{ service: 'AWS Lambda', amount: 1.2 }, { service: 'Amazon S3', amount: 2 }, { service: 'Tax', amount: 0.001 }] }))
  const usage = createUsage({
    now: () => NOW,
    functionName: 'eotm-console-api',
    store,
    metricSums: async ({ namespace, hours }) => Array.from({ length: hours }, (_, i) => ({
      at: NOW - (hours - i) * HOUR, value: namespace === 'AWS/Lambda' ? (i === hours - 1 ? lastHour : 10) : 100,
    })),
    amplifyApps: async () => [{ appId: 'a1', name: 'LiveSpiritSeedsMk2' }],
    neon: async (path) => {
      if (neonFails) throw new Error('Neon API 401 on /users/me/organizations')
      if (path === '/users/me/organizations') return { organizations: [{ id: 'org-1' }] }
      if (path.startsWith('/projects?')) return { projects: [{ id: 'p1' }] }
      return { project: {
        name: 'edge-of-the-map-console', compute_time_seconds: cuSeconds, data_storage_bytes_hour: 0,
        synthetic_storage_size: 0, data_transfer_bytes: 0,
        consumption_period_start: '2026-10-23T12:00:00Z', consumption_period_end: '2026-11-01T00:00:00Z',
      } }
    },
    monthCost,
    sendEmail,
  })
  return { usage, files, store, monthCost, sendEmail }
}

describe('usage report', () => {
  it('adds API, site, Neon and AWS figures, and projects Neon over its period', async () => {
    const { usage } = setup()
    const r = await usage.report()
    expect(r.traffic.value.api.lastHour).toBe(40)
    expect(r.traffic.value.api.total).toBe(23 * 10 + 40)
    expect(r.traffic.value.sites).toEqual([expect.objectContaining({ name: 'LiveSpiritSeedsMk2', total: 2400 })])
    // One CU-hour in the first day of an 8.5-day period.
    expect(r.neon.value.cost).toBe(Math.round(NEON_CU_HOUR * 100) / 100)
    expect(r.neon.value.projected).toBeCloseTo(NEON_CU_HOUR * 8.5, 1)
    expect(r.aws.value.byService.map((s) => s.service)).toEqual(['Amazon S3', 'AWS Lambda'])
  })

  it('keeps Cost Explorer for twelve hours, so the panel does not pay per open', async () => {
    const { usage, monthCost } = setup()
    await usage.report()
    await usage.report()
    expect(monthCost).toHaveBeenCalledTimes(1)
    await usage.report({ refreshCost: true })
    expect(monthCost).toHaveBeenCalledTimes(2)
  })

  it('shows the rest when one source fails', async () => {
    const { usage } = setup({ neonFails: true })
    const r = await usage.report()
    expect(r.neon.error).toMatch(/401/)
    expect(r.traffic.value.api.lastHour).toBe(40)
  })

  it('makes the first operator to open it the alert recipient', async () => {
    const { usage } = setup()
    expect((await usage.report({ defaultRecipient: 'ops@example.com' })).settings.recipients).toEqual(['ops@example.com'])
  })
})

describe('usage settings', () => {
  it('cleans and keeps thresholds; blank dollar fields turn that alert off', async () => {
    const { usage, files } = setup()
    const s = await usage.saveSettings({ requestsPerHour: 800, neonMonthly: '12.5', awsMonthly: '', recipients: 'A@x.com, b@y.com' })
    expect(s).toEqual({ requestsPerHour: 800, neonMonthly: 12.5, awsMonthly: null, recipients: ['a@x.com', 'b@y.com'] })
    expect(files.get('monitor/usage.json')).toEqual(s)
  })

  it('refuses a bad threshold or address', async () => {
    const { usage } = setup()
    await expect(usage.saveSettings({ requestsPerHour: 2, recipients: 'a@x.com' })).rejects.toMatchObject({ status: 400 })
    await expect(usage.saveSettings({ requestsPerHour: 100, recipients: 'nope' })).rejects.toMatchObject({ status: 400 })
  })
})

describe('hourly check', () => {
  const settings = { 'monitor/usage.json': { requestsPerHour: 500, neonMonthly: 10, awsMonthly: null, recipients: ['ops@example.com'] } }

  it('stays quiet under the thresholds', async () => {
    const { usage, sendEmail } = setup({ stored: settings })
    expect((await usage.check()).breaches).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('emails on a traffic spike, then not again for six hours', async () => {
    const { usage, sendEmail, files } = setup({ lastHour: 900, stored: settings })
    const r = await usage.check()
    expect(r.emailed).toEqual(['requests'])
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@example.com', text: expect.stringContaining('900') }))
    await usage.check()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(files.get('monitor/usage-state.json').alerts.requests).toBe(NOW)
  })

  it('alerts on projected Neon cost', async () => {
    // 20 CU-hours in the first day of the period projects far past $10.
    const { usage } = setup({ cuSeconds: 20 * 3600, stored: settings })
    expect((await usage.check()).emailed).toEqual(['neon'])
  })

  it('never calls Cost Explorer while the AWS alert is off', async () => {
    const { usage, monthCost } = setup({ stored: settings })
    await usage.check()
    expect(monthCost).not.toHaveBeenCalled()
  })

  it('forgets a cleared breach, so its return alerts at once', async () => {
    const { usage, files } = setup({ stored: { ...settings, 'monitor/usage-state.json': { alerts: { requests: NOW - HOUR } } } })
    await usage.check()
    expect(files.get('monitor/usage-state.json').alerts).toEqual({})
  })
})
