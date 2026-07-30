// App.jsx
//
// The shell: the banner plate that is the header, the footer, the burn, and
// whichever route's page goes between them. The page bodies live in
// HomePage.jsx, KeeperPage.jsx and StorytellerPage.jsx; everything all four
// need is in content.js.
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import './App.css'
import Rune from './Rune.jsx'
import Bindrune from './Bindrune.jsx'
import SvgDefs from './SvgDefs.jsx'
import HomePage from './HomePage.jsx'
import KeeperPage from './KeeperPage.jsx'
import StorytellerPage from './StorytellerPage.jsx'
import { Link, useRoute } from './router.jsx'
import { useSiteMode } from './useSiteMode.js'
import {
  BANNER,
  BURN_MS,
  GENERAL_ENQUIRY,
  PATHS,
  navHref,
} from './content.js'

/** The site's one mode axis. **The values are the class names**, not semantic
 *  labels the hook maps to classes: `mystic-mode` is written into ~40 selectors
 *  across two stylesheets and into most of DESIGN.md, and renaming it to suit a
 *  refactor that is supposed to change no behaviour is a bad trade.
 *
 *  `light` is first, so it is the null case and gets no class at all. */
const FACES = ['light', 'mystic-mode']

/** Which component owns which route. Keyed by the same strings as `ROUTES` in
 *  router.jsx — that list decides what is a route at all, this one decides what
 *  renders. Anything absent falls back to HomePage, which is also what
 *  `normalizePath` has already done to the URL. */
const PAGES = {
  '/keeper': KeeperPage,
  '/storyteller': StorytellerPage,
}

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fades sections in as they enter view.
 *
 *  **Visible is the default state; hiding is opt-in.** The `opacity: 0` in CSS
 *  is gated behind `.reveal-ready` on <html>, which this hook adds only once the
 *  observer that un-hides is actually armed. Ungated, every way this hook can
 *  fail to run — a throw earlier in the effect, a browser without the API, a tab
 *  the browser has frozen — presents as a page of tall blank gaps rather than as
 *  a missing animation, and there is nothing on screen to hint why. That has bit
 *  twice; DESIGN.md §6 records the first.
 *
 *  Three cases skip the animation and reveal everything up front: reduced
 *  motion, no IntersectionObserver, and a document that is *hidden* at mount —
 *  the last because a backgrounded tab does not deliver IntersectionObserver
 *  callbacks at all, so arming the gate there would hide the page and then never
 *  un-hide it. In all three the gate is never added, so the CSS never hides.
 *
 *  A **layout** effect, not an effect: `useEffect` runs after the browser paints,
 *  so the gate would arm a frame late and anything above the fold would flash in
 *  and then blink out before fading back. Arming before first paint is the whole
 *  reason the gate is affordable.
 *
 *  **It re-arms per route, and that dependency is load-bearing.** The observer
 *  unobserves each element as it fires, so it is spent once used; the gate,
 *  though, is a class on `<html>` that outlives the page under it. Left as a
 *  mount-only effect, navigating to a second route would leave `.reveal-ready`
 *  set with an observer watching nodes that no longer exist — every section of
 *  the new page hidden at `opacity: 0` with nothing left to reveal it. That is
 *  the same failure DESIGN.md §6 records, arrived at from a new direction. */
function useScrollReveal(route) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const els = document.querySelectorAll('[data-reveal]')

    if (
      prefersReducedMotion() ||
      !('IntersectionObserver' in window) ||
      document.visibilityState === 'hidden'
    ) {
      els.forEach((el) => el.classList.add('is-visible'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
    )

    els.forEach((el) => io.observe(el))
    // Armed last, so nothing is hidden before something can reveal it.
    root.classList.add('reveal-ready')

    return () => {
      io.disconnect()
      root.classList.remove('reveal-ready')
    }
  }, [route])
}

/** Puts a new route at the top, or at the fragment it was asked for.
 *
 *  A browser restores scroll position across a `pushState`, which is right for
 *  back/forward and wrong for a link click: arriving at `/keeper` two thirds of
 *  the way down is disorienting in a way no visitor blames on the router.
 *
 *  Same-document fragment links never reach here — `Link` leaves those to the
 *  browser — so the hash branch is for the cross-page case only, plus a deep
 *  link opened cold. `scrollIntoView` rather than an offset calculation because
 *  the targets already carry `scroll-margin-top: var(--header-h)`, which is the
 *  one thing keeping anchors out from under the sticky plate. */
function useRouteScroll(route) {
  useLayoutEffect(() => {
    const hash = window.location.hash.slice(1)
    const target = hash ? document.getElementById(hash) : null

    // `behavior: 'instant'` explicitly, because `html { scroll-behavior: smooth }`
    // otherwise animates this. Smooth is right for a fragment link *within* a page
    // — it shows you where you were carried from. Across a route it animates
    // through content that has already been replaced, which reads as a glitch.
    if (target) target.scrollIntoView({ behavior: 'instant' })
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [route])
}

function App() {
  const route = useRoute()

  // The face axis. `light` is first, so it is the null case and takes no class —
  // the light tokens are the bare `:root, .face` block and mystic is the
  // override on top. `body: true` writes to <body> because mystic repaints the
  // whole viewport, gutters included; `face.className` is written to the wrapper
  // as well, which is what lets the burn's detached clone hold the *opposite*
  // face. See useSiteMode's header and DESIGN.md §3.
  //
  // `persistence: 'none'` is deliberate, not a default left unconsidered: a
  // restored mode has to be applied before first paint or it flashes, and this
  // site has no build-time bake and no paint gate to hang that on. Recorded as
  // an open question in ADR 0005.
  const face = useSiteMode({
    name: 'face',
    values: FACES,
    persistence: 'none',
  })
  const isMystic = face.value === 'mystic-mode'

  // The burn holds a *clone of the outgoing page*, captured at the moment of
  // the toggle. The clone keeps the old face because `.face` re-declares the
  // theme tokens, so it renders in the outgoing world while the live wrapper
  // below it has already flipped to the new one.
  const [burn, setBurn] = useState(null)
  const timers = useRef([])
  const faceRef = useRef(null)
  const sheetRef = useRef(null)

  useScrollReveal(route)
  useRouteScroll(route)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Mount the cloned page into the sheet once React has rendered the sheet.
  useEffect(() => {
    if (!burn || !sheetRef.current) return
    sheetRef.current.appendChild(burn.clone)
    return () => burn.clone.remove()
  }, [burn])

  const toggleMystic = useCallback(() => {
    if (burn) return // already mid-transition

    // `faceEl`, not `face` — the hook above owns that name now, and shadowing it
    // here would silently call `cloneNode` on the mode object and `toggle` on a
    // DOM element.
    const faceEl = faceRef.current
    if (prefersReducedMotion() || !faceEl) {
      face.toggle()
      return
    }

    const clone = faceEl.cloneNode(true)
    clone.classList.add('burn-page')
    clone.setAttribute('aria-hidden', 'true')
    // Duplicate ids would briefly shadow the real ones for anchor links.
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    // Nothing in a clone is reachable, and the clone outlives the tab order for
    // 1.8s. Without this, tabbing mid-burn walks into a copy of the page that is
    // about to be deleted — including the demo's contentEditable fields, which
    // are focusable and would take the caret out of the real document.
    clone
      .querySelectorAll('a, button, input, textarea, select, [contenteditable]')
      .forEach((n) => {
        n.setAttribute('tabindex', '-1')
        n.removeAttribute('contenteditable')
      })

    // The sticky header needs no JS: it stays in flow (moving it out shifts
    // everything below it up by its own height) and CSS retargets its sticky
    // threshold to the burn bleed. See `.burn-page .site-header`.
    setBurn({
      clone,
      lit: false,
      scrollY: window.scrollY,
      width: faceEl.offsetWidth,
    })

    // Let the clone paint before the theme underneath changes, then start the
    // burn on the following frame so the mask transition has a start value.
    //
    // Assigned, not appended: the burn is single-flight (the guard above), so
    // only the current run's ids can ever matter and pushing grew the array for
    // the whole session.
    timers.current = [
      setTimeout(() => {
        face.toggle()
        setBurn((b) => (b ? { ...b, lit: true } : b))
      }, 60),
      setTimeout(() => setBurn(null), BURN_MS + 260),
    ]
  }, [burn, face])

  const toggleLabel = isMystic ? 'Return to the Known' : 'Reveal the Mystery'
  const Page = PAGES[route] ?? HomePage

  return (
    <>
      <SvgDefs />

      {burn && (
        <div
          className={`burn ${burn.lit ? 'is-lit' : ''}`}
          aria-hidden="true"
          style={{
            '--burn-scroll': `${burn.scrollY}px`,
            '--burn-width': `${burn.width}px`,
            '--burn-dur': `${BURN_MS}ms`,
          }}
        >
          <div className="burn-warp">
            {/* Lives inside .burn so the mask circle inherits the animating
                --burn. The displacement rides on the mask shape, not on the
                sheet, so the hole tears while the page stays legible. */}
            <svg className="burn-mask-svg" aria-hidden="true" focusable="false">
              <defs>
                <mask id="burnMask" maskUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
                  <circle
                    className="burn-hole"
                    fill="#000"
                    filter="url(#burn-displace)"
                  />
                </mask>
              </defs>
            </svg>

            {/* The clone is appended here imperatively — it is a detached DOM
                node, not React's to render. The ember sits *after* it so the
                rim glows over the burning page rather than behind it. */}
            <div className="burn-sheet" ref={sheetRef} />

            {/* The ember gets a filtered *wrapper*, not a filter of its own:
                `filter` runs before `mask`, so displacing the ember element
                would warp its smooth background gradient — invisible — and
                then carve a perfectly clean ring out of the result. */}
            <div className="burn-ember-warp">
              <div className="burn-ember" />
            </div>
          </div>
        </div>
      )}

      {/* `face.className` rather than a ternary: the hook owns the mapping from
          value to class, and this wrapper is the whole reason it can write to an
          element instead of only to <body> — the burn's clone carries a bare
          `.face` and so resolves the *outgoing* tokens. See ADR 0005. */}
      <div className={`face ${face.className}`} ref={faceRef}>
      {/* The plate *is* the header. The nav and the controls are laid over the
          artwork above its bound-rune frieze, and the plate's own neon wordmark
          is the brand — so the compact signature mark and the "Edge of the Map"
          text that used to sit in this row are gone rather than repeated.

          The plate is not lazy and not deprioritised: it is the largest thing
          above the fold, so it is the LCP element, and index.html preloads it by
          the same stable URL. */}
      <header className="site-header">
        {/* `/#top` rather than `#top`: the header renders on every route, and a
            bare fragment from /keeper would look for an anchor on the page it is
            already on. Both pages carry id="top", so this is a scroll at home
            and a route change from anywhere else. */}
        <Link
          className="brand"
          href="/#top"
          aria-label="Edge of the Map LLC — back to top"
        >
          <img
            className="masthead-plate"
            src={BANNER}
            alt="Edge of the Map LLC"
            width="2048"
            height="640"
            fetchPriority="high"
            decoding="async"
          />
        </Link>

        <div className="header-bar">
          {/* The nav wears the same button as Contact rather than a nav-link
              style of its own — one shape for every control on the plate. The
              classes are reused, not restyled: `.header-bar` re-declares the
              accent tokens so `.btn-primary` resolves to the plate's neon. */}
          <nav className="site-nav" aria-label="Sections">
            {PATHS.map((path) => (
              <Link
                key={path.id}
                className="btn btn-primary btn-sm"
                href={navHref(path)}
                aria-current={route === path.href ? 'page' : undefined}
              >
                {path.title}
              </Link>
            ))}
            <Link className="btn btn-primary btn-sm" href="/#about">
              {isMystic ? 'Lore' : 'About'}
            </Link>
          </nav>

          <div className="header-actions">
            <button
              className="btn btn-primary btn-sm header-toggle"
              onClick={toggleMystic}
              aria-pressed={isMystic}
              title={toggleLabel}
            >
              <Rune name="raido" />
              <span className="visually-hidden">{toggleLabel}</span>
            </button>
            <a className="btn btn-primary btn-sm" href={GENERAL_ENQUIRY}>
              Contact
            </a>
          </div>
        </div>
      </header>

      {/* A table rather than a ternary chain, for the reason PATHS is a table:
          the second craft page turned the branch into a nest, and a third would
          be unreadable. Every page takes the same props and the craft pages
          ignore the two they do not use — one call site means a page cannot be
          added and then handed a different set of props by accident. HomePage is
          the fallback because `normalizePath` has already sent everything
          unrecognised to '/'. */}
      <Page
        isMystic={isMystic}
        toggleMystic={toggleMystic}
        toggleLabel={toggleLabel}
      />

      <footer className="site-footer">
        {/* The same plate that opens the page, closing it — full width, so the
            two bookend the document. It carries the wordmark itself, which is
            why the copyright row below no longer repeats the signature mark.
            Lazy here: it is the last thing on the page, not the first. */}
        <div className="footer-banner">
          <img
            src={BANNER}
            alt=""
            width="2048"
            height="640"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="footer-inner">
          <nav className="footer-nav" aria-label="Footer">
            {PATHS.map((path) => (
              <Link key={path.id} href={navHref(path)}>
                {path.title}
              </Link>
            ))}
            <a href={GENERAL_ENQUIRY}>Contact</a>
          </nav>
        </div>

        {/* The maker's mark: the same seven-rune binding carved into the
            tablet in the hero artwork, drawn here as vector so it takes the
            face's colour and lights in mystic mode. Laid on its side and set
            last, so it signs the page off along the bottom edge rather than
            standing as a column above the footer text. */}
        <div className="footer-mark">
          <Bindrune orientation="horizontal" title="The Edge of the Map bindrune" />
        </div>

        {/* Last line on the page, under the mark that signs it. */}
        <p className="footer-legal">
          &copy; 2025 Edge of the Map LLC. All rights reserved.
        </p>
      </footer>
      </div>
    </>
  )
}

export default App
