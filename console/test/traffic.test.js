import { describe, it, expect } from 'vitest'
import { createTraffic, referrerOf, cleanPath, deviceOf } from '../api/traffic.js'

// A control project that keeps salts and hits in arrays and answers the report
// queries from them, enough to check what traffic.js counts.
function world(day = '2026-10-12T15:00:00Z') {
  const salts = new Map()
  const hits = []
  const control = {
    async query(sql, p = []) {
      if (sql.startsWith('SELECT salt')) return { rows: salts.has(p[0]) ? [{ salt: salts.get(p[0]) }] : [] }
      if (sql.startsWith('INSERT INTO traffic_salts')) { if (!salts.has(p[0])) salts.set(p[0], p[1]); return { rows: [] } }
      if (sql.startsWith('DELETE')) return { rows: [] }
      if (sql.startsWith('INSERT INTO traffic_hits')) {
        const [site_id, d, path, referrer, device, visitor] = p
        hits.push({ site_id, day: d, path, referrer, device, visitor })
        return { rows: [] }
      }
      const mine = hits.filter((h) => h.site_id === p[0] && h.day >= p[1])
      const count = (key) => Object.entries(mine.reduce((m, h) => (h[key] == null ? m : { ...m, [h[key]]: (m[h[key]] ?? 0) + 1 }), {}))
        .map(([k, views]) => ({ [key]: k, views })).sort((a, b) => b.views - a.views)
      if (sql.includes('GROUP BY day')) {
        return { rows: [...new Set(mine.map((h) => h.day))].map((d) => ({ day: d, views: mine.filter((h) => h.day === d).length,
          visitors: new Set(mine.filter((h) => h.day === d).map((h) => h.visitor)).size })) }
      }
      if (sql.includes('GROUP BY path')) return { rows: count('path') }
      if (sql.includes('GROUP BY referrer')) return { rows: count('referrer') }
      if (sql.includes('GROUP BY device')) return { rows: count('device') }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  return { traffic: createTraffic({ control, now: () => new Date(day) }), hits, salts }
}
const site = { id: 's-1', slug: 'storyshaped', allowed_origins: ['https://storyshapedstudios.com', 'https://preview.storyshapedstudios.com'] }
const chrome = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130'

describe('traffic', () => {
  it('counts a visitor once a day however many pages they open, and skips robots', async () => {
    const { traffic, hits } = world()
    await traffic.record(site, { path: '/', referrer: 'https://www.google.com/search?q=x', width: 400 }, { ip: '1.2.3.4', userAgent: chrome })
    await traffic.record(site, { path: '/shop/?a=1', referrer: 'https://storyshapedstudios.com/', width: 400 }, { ip: '1.2.3.4', userAgent: chrome })
    await traffic.record(site, { path: '/', width: 1400 }, { ip: '5.6.7.8', userAgent: chrome })
    expect(await traffic.record(site, { path: '/' }, { ip: '9.9.9.9', userAgent: 'Googlebot/2.1' })).toBe(false)
    expect(hits.map((h) => h.path)).toEqual(['/', '/shop', '/'])
    expect(hits[0].visitor).toBe(hits[1].visitor)
    expect(hits[0].visitor).not.toBe(hits[2].visitor)
    expect(hits[0].visitor).toMatch(/^[0-9a-f]{16}$/)
    const r = await traffic.report(site, 7)
    expect(r).toMatchObject({ days: 7, views: 3, visitors: 2 })
    expect(r.daily).toHaveLength(7)
    expect(r.daily.at(-1)).toEqual({ day: '2026-10-12', views: 3, visitors: 2 })
    expect(r.pages[0]).toEqual({ path: '/', views: 2 })
    expect(r.referrers).toEqual([{ referrer: 'google.com', views: 1 }])
    expect(r.devices).toEqual([{ device: 'phone', views: 2 }, { device: 'desktop', views: 1 }])
  })

  it('gives the same visitor a different hash on another day', async () => {
    const a = world('2026-10-12T10:00:00Z')
    const b = world('2026-10-13T10:00:00Z')
    await a.traffic.record(site, { path: '/' }, { ip: '1.2.3.4', userAgent: chrome })
    await b.traffic.record(site, { path: '/' }, { ip: '1.2.3.4', userAgent: chrome })
    expect(a.hits[0].visitor).not.toBe(b.hits[0].visitor)
  })

  it('keeps only another site as a referrer, a clean path and a device class', () => {
    expect(referrerOf('https://preview.storyshapedstudios.com/x', site.allowed_origins)).toBe(null)
    expect(referrerOf('https://www.storyshapedstudios.com/', site.allowed_origins)).toBe(null)
    expect(referrerOf('', site.allowed_origins)).toBe(null)
    expect(referrerOf('https://l.instagram.com/?u=1', site.allowed_origins)).toBe('l.instagram.com')
    expect(cleanPath('/library/#top')).toBe('/library')
    expect(cleanPath('javascript:alert(1)')).toBe('/')
    expect([deviceOf(375), deviceOf(800), deviceOf(1440), deviceOf(undefined)]).toEqual(['phone', 'tablet', 'desktop', 'desktop'])
  })
})
