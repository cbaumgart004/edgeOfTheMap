// Usage and cost on the management page, and the hourly check that emails when
// traffic or spend runs past a threshold.
//
// Neon bills per use since the Launch plan (2026-10-23), so anything that keeps
// a compute awake costs money. This module therefore never touches Neon's
// databases: its settings and alert state live in S3 beside the published
// snapshots (monitor/usage.json), and the hourly check reads only CloudWatch,
// Amplify, Neon's account API and S3. The free-quota outage of 2026-10-19 was
// requests every minute or so keeping the projects awake.
//
// Figures, and what each is measured against:
//   API requests     this Lambda's Invocations (CloudWatch), per hour, 24 hours.
//                    The alert threshold applies to the last full hour.
//   Site requests    Amplify Hosting's Requests per app: every file served,
//                    so a page view is several. Shown, not alerted on.
//   Neon             compute_time_seconds (CU-seconds) and data_storage_bytes_hour
//                    from Neon's project API for the current billing period,
//                    priced at the Launch rates below. Estimated, not Neon's invoice.
//   AWS              Cost Explorer, month to date by service. Each call costs
//                    $0.01, so the result is kept COST_FRESH.
// "Projected" is the period so far scaled to the whole period: an estimate.
//
// deps: store { read(key), write(key, value) } JSON in the published bucket
//       metricSums({ namespace, metric, dimensions, hours }) -> [{ at, value }] hourly sums, oldest first
//       amplifyApps() -> [{ appId, name }]
//       neon(path) -> parsed JSON from https://console.neon.tech/api/v2<path>
//       monthCost({ start, end }) -> { total, byService: [{ service, amount }] }
//       sendEmail({ to, subject, text }) (optional: no email when unset)
//       functionName: this Lambda's name
//       now() (optional)

import { ServiceError } from '../core/service.js'

// Neon Launch plan rates (neon.com pricing, checked 2026-10-23).
export const NEON_CU_HOUR = 0.106
export const NEON_GB_MONTH = 0.35

export const DEFAULT_SETTINGS = {
  requestsPerHour: 500, // ~5x the ~90/hour that exhausted Neon's free quota
  neonMonthly: 10,
  awsMonthly: null, // off until set
  recipients: [],
}

const SETTINGS_KEY = 'monitor/usage.json'
const STATE_KEY = 'monitor/usage-state.json'
const COST_KEY = 'monitor/aws-cost.json'
const COST_FRESH = 12 * 3_600_000
const REALERT = 6 * 3_600_000 // one email per breach per six hours
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const GB = 1024 ** 3

const round2 = (n) => Math.round(n * 100) / 100

export function createUsage(deps) {
  const now = deps.now ?? Date.now
  let orgId = null

  async function settings() {
    return { ...DEFAULT_SETTINGS, ...((await deps.store.read(SETTINGS_KEY)) ?? {}) }
  }

  // One request to Neon per project per call; the organisation is looked up once
  // per container (a personal key must name it).
  async function neonUsage() {
    orgId ??= (await deps.neon('/users/me/organizations')).organizations?.[0]?.id
    if (!orgId) throw new Error('the Neon key sees no organization')
    const list = (await deps.neon(`/projects?org_id=${encodeURIComponent(orgId)}`)).projects ?? []
    const projects = await Promise.all(list.map(async ({ id }) => {
      const p = (await deps.neon(`/projects/${encodeURIComponent(id)}`)).project
      const start = Date.parse(p.consumption_period_start)
      const end = Date.parse(p.consumption_period_end)
      const cuHours = (p.compute_time_seconds ?? 0) / 3600
      const storageGbMonths = (p.data_storage_bytes_hour ?? 0) / GB / 730
      return {
        id, name: p.name, start, end, cuHours: round2(cuHours),
        storageGb: round2((p.synthetic_storage_size ?? 0) / GB),
        transferGb: round2((p.data_transfer_bytes ?? 0) / GB),
        cost: cuHours * NEON_CU_HOUR + storageGbMonths * NEON_GB_MONTH,
      }
    }))
    const start = Math.min(...projects.map((p) => p.start))
    const end = Math.max(...projects.map((p) => p.end))
    const cost = projects.reduce((s, p) => s + p.cost, 0)
    return {
      start, end, cost: round2(cost), projected: round2(project(cost, start, end)),
      projects: projects.map((p) => ({ ...p, cost: round2(p.cost) })),
    }
  }

  // The period so far scaled to the whole period, once at least an hour has run.
  function project(soFar, start, end) {
    const elapsed = now() - start
    if (!(elapsed > 3_600_000) || !(end > start)) return soFar
    return soFar * Math.max(1, (end - start) / elapsed)
  }

  async function awsCost({ refresh = false } = {}) {
    const kept = await deps.store.read(COST_KEY)
    if (!refresh && kept && kept.at > now() - COST_FRESH) return kept
    const d = new Date(now())
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    const day = (t) => new Date(t).toISOString().slice(0, 10)
    // Cost Explorer's end date is exclusive and must be after the start.
    const r = await deps.monthCost({ start: day(start), end: day(Math.max(now(), start + 86_400_000)) })
    const value = {
      at: now(), start, end, total: round2(r.total), projected: round2(project(r.total, start, end)),
      byService: r.byService.filter((s) => s.amount >= 0.005).sort((a, b) => b.amount - a.amount)
        .map((s) => ({ ...s, amount: round2(s.amount) })),
    }
    await deps.store.write(COST_KEY, value)
    return value
  }

  async function traffic(hours = 24) {
    const api = await deps.metricSums({ namespace: 'AWS/Lambda', metric: 'Invocations', dimensions: { FunctionName: deps.functionName }, hours })
    const apps = await deps.amplifyApps()
    const sites = await Promise.all(apps.map(async (a) => ({
      ...a, hours: await deps.metricSums({ namespace: 'AWS/AmplifyHosting', metric: 'Requests', dimensions: { App: a.appId }, hours }),
    })))
    const sum = (pts) => pts.reduce((s, p) => s + p.value, 0)
    return {
      api: { hours: api, total: sum(api), lastHour: api.at(-1)?.value ?? 0 },
      sites: sites.map((s) => ({ ...s, total: sum(s.hours) })).sort((a, b) => b.total - a.total),
    }
  }

  // Each figure on its own, so one source failing (a missing grant, Neon's API
  // down) still shows the rest with the reason beside the gap.
  const attempt = (p) => p.then((value) => ({ value }), (err) => ({ error: err.message }))

  async function report({ defaultRecipient, refreshCost = false } = {}) {
    let s = await settings()
    if (!s.recipients.length && defaultRecipient && EMAIL.test(defaultRecipient)) {
      s = { ...s, recipients: [defaultRecipient] }
      await deps.store.write(SETTINGS_KEY, s)
    }
    const [t, n, a, state] = await Promise.all([attempt(traffic()), attempt(neonUsage()), attempt(awsCost({ refresh: refreshCost })), deps.store.read(STATE_KEY)])
    return {
      at: now(), settings: s, traffic: t, neon: n, aws: a,
      lastCheck: state?.at ?? null, alerts: state?.alerts ?? {}, rates: { cuHour: NEON_CU_HOUR, gbMonth: NEON_GB_MONTH },
    }
  }

  async function saveSettings(body = {}) {
    const money = (v, label) => {
      if (v === '' || v == null) return null
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0 || n > 10_000) throw new ServiceError(400, `${label} must be a dollar amount above 0, or blank for no alert.`)
      return round2(n)
    }
    const perHour = Number(body.requestsPerHour)
    if (!Number.isInteger(perHour) || perHour < 10 || perHour > 1_000_000) throw new ServiceError(400, 'Requests per hour must be a whole number of 10 or more.')
    const recipients = [...new Set((Array.isArray(body.recipients) ? body.recipients : String(body.recipients ?? '').split(/[\s,;]+/))
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    const bad = recipients.find((e) => !EMAIL.test(e))
    if (bad) throw new ServiceError(400, `${bad} is not an email address.`)
    if (!recipients.length) throw new ServiceError(400, 'Name at least one address to alert.')
    const s = { requestsPerHour: perHour, neonMonthly: money(body.neonMonthly, 'Neon monthly'), awsMonthly: money(body.awsMonthly, 'AWS monthly'), recipients }
    await deps.store.write(SETTINGS_KEY, s)
    return s
  }

  // The hourly check (EventBridge Scheduler invokes {"eotmUsageCheck": true}).
  // Cost Explorer is read from the twelve-hour copy, so this adds no CE charge
  // beyond two calls a day.
  async function check() {
    const s = await settings()
    const prior = (await deps.store.read(STATE_KEY)) ?? { alerts: {} }
    const breaches = []
    const problems = []
    const [t, n, a] = await Promise.all([attempt(traffic(2)), s.neonMonthly ? attempt(neonUsage()) : null, s.awsMonthly ? attempt(awsCost()) : null])
    if (t.error) problems.push(`traffic: ${t.error}`)
    else if (t.value.api.lastHour > s.requestsPerHour) {
      breaches.push({ key: 'requests', text: `API requests last hour: ${t.value.api.lastHour} (threshold ${s.requestsPerHour}).` })
    }
    if (n?.error) problems.push(`Neon: ${n.error}`)
    else if (n && n.value.projected > s.neonMonthly) {
      breaches.push({ key: 'neon', text: `Neon projected this period: $${n.value.projected.toFixed(2)} (threshold $${s.neonMonthly.toFixed(2)}; $${n.value.cost.toFixed(2)} so far).` })
    }
    if (a?.error) problems.push(`AWS cost: ${a.error}`)
    else if (a && a.value.projected > s.awsMonthly) {
      breaches.push({ key: 'aws', text: `AWS projected this month: $${a.value.projected.toFixed(2)} (threshold $${s.awsMonthly.toFixed(2)}; $${a.value.total.toFixed(2)} so far).` })
    }
    const alerts = { ...prior.alerts }
    const due = breaches.filter((b) => !(alerts[b.key] > now() - REALERT))
    let emailed = false
    if (due.length && deps.sendEmail && s.recipients.length) {
      const text = [...due.map((b) => b.text), '', 'Usage & cost: https://admin.theedgeofthemap.com/?manage',
        'This repeats at most every six hours while it lasts.'].join('\n')
      for (const to of s.recipients) {
        try {
          await deps.sendEmail({ to, subject: `Edge of the Map usage alert: ${due.map((b) => b.key).join(', ')}`, text })
          emailed = true
        } catch (err) {
          problems.push(`email to ${to}: ${err.message}`)
        }
      }
      if (emailed) for (const b of due) alerts[b.key] = now()
    }
    // A breach that has cleared may alert again as soon as it returns.
    for (const key of Object.keys(alerts)) if (!breaches.some((b) => b.key === key)) delete alerts[key]
    await deps.store.write(STATE_KEY, { at: now(), alerts, breaches: breaches.map((b) => b.text), problems })
    if (problems.length) console.warn('[usage] check incomplete:', problems.join('; '))
    return { breaches: breaches.map((b) => b.text), emailed: emailed ? due.map((b) => b.key) : [], problems }
  }

  return { report, saveSettings, check }
}
