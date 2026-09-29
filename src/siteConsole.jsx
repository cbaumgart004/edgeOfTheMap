// siteConsole.js
//
// The site's half of the Edge of the Map console (the `console` branch,
// StoryShaped ADR-0007). index.html loads the console's loader, which installs
// window.EOTM. Published documents come from the console's public API; while
// the owner edits, the loader pushes drafts through window.EOTM and
// useLiveDocuments re-renders with them, which is the live preview.
//
// Everything here degrades to the built-in content: an unreachable API, or a
// site not yet registered with the console, reads as "nothing published".

import { useEffect, useMemo, useState } from 'react'
import { PATHS } from './content.js'

export const CONSOLE_API = 'https://admin.theedgeofthemap.com/api/sites/edgeofthemap'

// Where "Client sign-in" goes. `?manage` opens the operators' page for an
// operator and each client's own sites for everyone else.
export const CONSOLE_SIGN_IN = 'https://admin.theedgeofthemap.com/?manage'

// One request per type per page load, shared by every component asking.
const published = new Map()
export function fetchPublished(type) {
  if (!published.has(type)) {
    published.set(type, fetch(`${CONSOLE_API}/public/${encodeURIComponent(type)}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []))
  }
  return published.get(type)
}

// Published documents of one type with the owner's unsaved drafts on top.
export function useLiveDocuments(type) {
  const [docs, setDocs] = useState([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    fetchPublished(type).then((d) => active && setDocs(d))
    let unsubscribe = null
    let timer = null
    const wire = () => {
      if (window.EOTM) unsubscribe = window.EOTM.subscribe((c) => c.type === type && !c.order && setTick((t) => t + 1))
      else timer = setTimeout(wire, 50)
    }
    wire()
    return () => {
      active = false
      clearTimeout(timer)
      if (unsubscribe) unsubscribe()
    }
  }, [type])
  return useMemo(
    () => (window.EOTM ? window.EOTM.merge(type, docs) : docs),
    [type, docs, tick] // eslint-disable-line react-hooks/exhaustive-deps
  )
}

// PATHS with the owner's wording on top. A `craft` document names the path it
// rewords by `key`; a blank field keeps the built-in text. What a path *is*
// (its id, rune, page and enquiry subject) stays in content.js.
const WORDING = ['title', 'persona', 'blurb', 'loreBlurb', 'cta']
export function usePaths() {
  const docs = useLiveDocuments('craft')
  return useMemo(() => PATHS.map((path) => {
    const d = docs.find((doc) => doc.data?.key === path.id)?.data
    if (!d) return path
    const out = { ...path }
    for (const f of WORDING) if (typeof d[f] === 'string' && d[f].trim()) out[f] = d[f].trim()
    const points = (d.points ?? []).map((p) => p?.text?.trim()).filter(Boolean)
    if (points.length) out.points = points
    return out
  }), [docs])
}

// The owner's colours (the `theme` singleton), as CSS custom properties laid
// over App.css's tokens. Doubled selectors outrank `:root, .face` and
// `.face.mystic-mode` without !important. Only a well-formed #rrggbb is used.
const HEX = /^#[0-9a-f]{6}$/i
const triple = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

export function themeCss(theme) {
  if (!theme) return ''
  const block = (selector, vars) => {
    const body = Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}: ${v};`).join(' ')
    return body ? `${selector} { ${body} }` : ''
  }
  const day = theme.daylight ?? {}
  const night = theme.mystic ?? {}
  const c = (v) => (HEX.test(v ?? '') ? v : null)
  return [
    block(':root:root, .face.face', {
      '--bg': c(day.background), '--accent': c(day.accent), '--ink': c(day.text), '--ember': c(day.ember),
    }),
    block('body.mystic-mode.mystic-mode, .face.mystic-mode.mystic-mode', {
      '--bg': c(night.background), '--accent': c(night.glow), '--ink': c(night.text),
      '--glow': c(night.glow) && triple(night.glow), '--violet': c(night.violet) && triple(night.violet),
    }),
  ].filter(Boolean).join('\n')
}

export function SiteTheme() {
  const docs = useLiveDocuments('theme')
  const css = themeCss(docs[0]?.data)
  return css ? <style data-eotm-theme>{css}</style> : null
}
