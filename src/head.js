// head.js
//
// Per-route title, description and canonical. index.html carries the home
// page's; without this every route kept them, and the canonical pointing at
// `/` told search engines /keeper and /storyteller were copies of the home page.
// Unknown paths render home (router.jsx), so their canonical is `/` as well.

import { useEffect } from 'react'

const ORIGIN = 'https://theedgeofthemap.com'

const META = {
  '/keeper': {
    title: 'The Keeper: Websites You Own Outright | Edge of the Map',
    description:
      'Websites built, branded and hosted by one person. Your content stays yours, with a real API underneath and a live page you can edit yourself.',
  },
  '/storyteller': {
    title: 'The Storyteller: Audiobook Narration | Edge of the Map',
    description:
      'Audiobook narration: your book, in your characters’ voices. Listen to samples and ask about a production.',
  },
}

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector)
  if (el && value != null) el.setAttribute(attr, value)
}

// The home page's values as index.html shipped them, read once.
let home = null

export function useRouteHead(route) {
  useEffect(() => {
    const get = (sel, attr) => document.head.querySelector(sel)?.getAttribute(attr)
    home ??= {
      title: document.title,
      description: get('meta[name="description"]', 'content'),
      ogTitle: get('meta[property="og:title"]', 'content'),
      ogDescription: get('meta[property="og:description"]', 'content'),
    }
    const page = META[route]
    const url = ORIGIN + (route === '/' ? '/' : route)
    document.title = page?.title ?? home.title
    setMeta('meta[name="description"]', 'content', page?.description ?? home.description)
    setMeta('meta[property="og:title"]', 'content', page?.title ?? home.ogTitle)
    setMeta('meta[property="og:description"]', 'content', page?.description ?? home.ogDescription)
    setMeta('link[rel="canonical"]', 'href', url)
    setMeta('meta[property="og:url"]', 'content', url)
  }, [route])
}
