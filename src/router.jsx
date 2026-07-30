// router.jsx
//
// Two routes and no dependency. See docs/adr/0003 for why this is ~40 lines of
// history API rather than react-router: the site has one nested layout, no
// loaders, no params, and no guards, and the router that ships with those costs
// more than the whole CSS bundle.
//
// The trick that keeps it small: `history.pushState` deliberately does *not*
// fire `popstate`, so navigating programmatically and navigating with the back
// button would normally need two separate paths. Synthesising the event means
// there is exactly one listener and one code path, and back/forward is correct
// by construction rather than by remembering to handle it.

import { useEffect, useState } from 'react'

// Every path that is not a real route renders the home page. There is no 404:
// the host rewrites unknown URLs to index.html anyway (`serve -s`), so the only
// honest options are "home" or a not-found page, and a one-page site with a
// single sub-route does not have enough surface to get lost on.
export const ROUTES = ['/', '/keeper']

// Trailing slashes and the empty string all mean the root. Normalising here
// rather than at each comparison is what keeps `/keeper/` from silently
// falling through to the home page.
export function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '')
  const path = trimmed === '' ? '/' : trimmed
  return ROUTES.includes(path) ? path : '/'
}

export function navigate(to) {
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute() {
  const [route, setRoute] = useState(() =>
    normalizePath(window.location.pathname)
  )

  useEffect(() => {
    const onPop = () => setRoute(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return route
}

/** An anchor that stays an anchor.
 *
 *  It renders a real `href` and only calls `preventDefault` when it is actually
 *  going to handle the click itself, so middle-click, ctrl-click, "open in new
 *  tab" and "copy link address" all behave the way they would on any other
 *  link — and the href is a genuine URL, so a crawler that runs no JS still
 *  finds `/keeper`.
 *
 *  **Same-document hash links are left to the browser on purpose.** From `/`,
 *  `/#services` is a native fragment navigation: it scrolls, it honours
 *  `scroll-margin-top`, and clicking the same link twice scrolls twice. Routing
 *  it through `pushState` would break that last one — the URL would already
 *  match, so there would be nothing for a route effect to react to, and the
 *  second click would do nothing. The browser is better at this than we are;
 *  the only case it cannot handle is a hash on a *different* page. */
export function Link({ href, onClick, children, ...rest }) {
  const handleClick = (event) => {
    onClick?.(event)

    if (event.defaultPrevented) return
    // Let the browser own everything that isn't a plain left-click: modified
    // clicks are the user asking for a new tab or window.
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    // mailto:, external URLs and bare `#anchor` are not ours.
    if (!href?.startsWith('/')) return

    const target = new URL(href, window.location.origin)
    if (target.pathname === window.location.pathname) {
      // Same page with a fragment — the native scroll described above.
      if (target.hash) return
      // Same page, no fragment: `href="/"` while already on `/`. Left to the
      // browser this is a **full page reload** — same URL, but a navigation all
      // the same, and the whole app remounts to end up where it started.
      event.preventDefault()
      window.scrollTo({ top: 0 })
      return
    }

    event.preventDefault()
    navigate(href)
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
