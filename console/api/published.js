// Each site's published content as one snapshot, read by the public routes
// (pages, /public/<type>, /seo, /sitemap.xml, /boot) instead of the site's Neon
// project. A Neon compute sleeps only after about five idle minutes; uptime
// monitors and crawlers asking every minute or so kept both site projects and
// the control project awake around the clock, and the free plan's compute ran
// out on 2026-10-19. With this, only editing wakes a database.
//
// A snapshot holds the site's public record (no connection, no member data)
// and every published document by type. It is rebuilt from the databases after
// anything that changes what visitors see: a publish, unpublish, discard or
// delete, a release, the owner's own types, any Manage change. Stored by the
// deployment (lambda.js: S3), kept in memory for `ttl` per warm container.
//
// deps: read(slug) -> snapshot | null, write(slug, snapshot), build(slug) -> snapshot | null

export const PUBLIC_SITE_FIELDS = ['id', 'slug', 'name', 'schema', 'allowed_origins', 'console_version', 'console_integrity', 'media_base_url']

export function createPublished({ read, write, build, ttl = 60_000, now = Date.now }) {
  const memo = new Map()

  async function refresh(slug) {
    const snap = await build(slug)
    if (snap) await write(slug, snap)
    memo.set(slug, { snap, at: now() })
    return snap
  }

  async function get(slug) {
    const hit = memo.get(slug)
    if (hit && now() - hit.at < ttl) {
      if (hit.failed) throw hit.failed
      return hit.snap
    }
    let snap = null
    try {
      snap = await read(slug)
    } catch (err) {
      console.warn('[published] reading the snapshot failed', slug, err?.message)
    }
    if (snap) {
      memo.set(slug, { snap, at: now() })
      return snap
    }
    // None yet (a new site, or the first request after this shipped): built
    // once from the databases, then served from the snapshot.
    console.warn('[published] no snapshot for', slug, '; building it from the database')
    try {
      return await refresh(slug)
    } catch (err) {
      // A database that is down is asked again after `ttl`, not on every request.
      memo.set(slug, { failed: err, at: now() })
      throw err
    }
  }

  return {
    get,
    refresh,
    site: async (slug) => (await get(slug))?.site ?? null,
    list: async (slug, type) => (await get(slug))?.docs?.[type] ?? [],
  }
}
