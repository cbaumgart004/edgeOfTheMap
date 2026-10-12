// Visitors to each customer site, kept in the control project (migration 010)
// and shown to the site's members on the admin page. The loader sends a beacon
// per page view; nothing is stored in the visitor's browser.
//
// A visitor is sha256(day's salt, site, address, browser), cut to 16 hex
// characters. Salts older than yesterday are deleted, so a hash cannot be
// reversed or followed from one day to the next: "visitors" over a range is the
// sum of each day's, as Plausible counts it.

import { createHash, randomBytes } from 'node:crypto'

const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptimerobot|preview|facebookexternalhit|curl|wget|python|node-fetch|axios/i
const KEEP_DAYS = 400

export function deviceOf(width) {
  const w = Number(width)
  if (!(w > 0)) return 'desktop'
  return w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'desktop'
}

// The referring host when it is another site; a visitor moving between pages
// of this site (or its preview) is not a referral.
export function referrerOf(raw, origins) {
  try {
    const host = new URL(String(raw)).host.replace(/^www\./, '')
    const own = origins.map((o) => { try { return new URL(o).host.replace(/^www\./, '') } catch { return null } })
    return host && !own.includes(host) ? host : null
  } catch {
    return null
  }
}

export function cleanPath(raw) {
  const p = String(raw ?? '/').split(/[?#]/)[0].slice(0, 300)
  return p.startsWith('/') ? p.replace(/(.)\/+$/, '$1') : '/'
}

export function createTraffic({ control, now = () => new Date() }) {
  const q = (sql, params) => control.query(sql, params)
  const salts = new Map() // day -> salt, per warm container

  async function saltFor(day) {
    if (salts.has(day)) return salts.get(day)
    let { rows } = await q('SELECT salt FROM traffic_salts WHERE day = $1', [day])
    if (!rows.length) {
      // The first hit of a day: make its salt, drop the ones that can no
      // longer be needed, and the hits past what the page shows.
      await q('INSERT INTO traffic_salts (day, salt) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING', [day, randomBytes(32)])
      await q(`DELETE FROM traffic_salts WHERE day < $1::date - 1`, [day])
      await q(`DELETE FROM traffic_hits WHERE day < $1::date - ${KEEP_DAYS}`, [day])
      rows = (await q('SELECT salt FROM traffic_salts WHERE day = $1', [day])).rows
    }
    salts.set(day, rows[0].salt)
    return rows[0].salt
  }

  // One page view. Returns false when it was not counted (a robot).
  async function record(site, { path, referrer, width }, { ip, userAgent }) {
    if (!userAgent || BOTS.test(userAgent)) return false
    const day = now().toISOString().slice(0, 10)
    const visitor = createHash('sha256').update(await saltFor(day)).update(`${site.slug}|${ip}|${userAgent}`).digest('hex').slice(0, 16)
    await q(`INSERT INTO traffic_hits (site_id, day, path, referrer, device, visitor) VALUES ($1, $2, $3, $4, $5, $6)`,
      [site.id, day, cleanPath(path), referrerOf(referrer, site.allowed_origins), deviceOf(width), visitor])
    return true
  }

  // The last `days` days (today included) for the admin page.
  async function report(site, days = 30) {
    const n = Math.min(Math.max(Math.trunc(Number(days)) || 30, 1), KEEP_DAYS)
    const since = new Date(now().getTime() - (n - 1) * 86_400_000).toISOString().slice(0, 10)
    const args = [site.id, since]
    const where = 'site_id = $1 AND day >= $2'
    const [daily, pages, referrers, devices] = await Promise.all([
      q(`SELECT day::text AS day, count(*)::int AS views, count(DISTINCT visitor)::int AS visitors
         FROM traffic_hits WHERE ${where} GROUP BY day ORDER BY day`, args),
      q(`SELECT path, count(*)::int AS views FROM traffic_hits WHERE ${where} GROUP BY path ORDER BY views DESC, path LIMIT 10`, args),
      q(`SELECT referrer, count(*)::int AS views FROM traffic_hits WHERE ${where} AND referrer IS NOT NULL
         GROUP BY referrer ORDER BY views DESC, referrer LIMIT 10`, args),
      q(`SELECT device, count(*)::int AS views FROM traffic_hits WHERE ${where} GROUP BY device ORDER BY views DESC`, args),
    ])
    // Every day in the range, a quiet one as zero, so the chart has no gaps.
    const byDay = new Map(daily.rows.map((r) => [r.day, r]))
    const series = Array.from({ length: n }, (_, i) => {
      const day = new Date(Date.parse(since) + i * 86_400_000).toISOString().slice(0, 10)
      return byDay.get(day) ?? { day, views: 0, visitors: 0 }
    })
    return {
      days: n,
      views: series.reduce((t, d) => t + d.views, 0),
      visitors: series.reduce((t, d) => t + d.visitors, 0),
      daily: series,
      pages: pages.rows,
      referrers: referrers.rows,
      devices: devices.rows,
    }
  }

  return { record, report }
}
