// App.jsx
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
import RuneFrame from './RuneFrame.jsx'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import logoCard from './assets/logo-card.webp'
import qrCode from './assets/qr_code.png'

// The full banner plate — the neon wordmark, the dragon, and the bound-rune
// frieze on one 3.2:1 field. Referenced by path rather than imported because it
// lives in public/: it is also the social banner, which needs a stable URL that
// survives a rebuild (see DESIGN §2). That exception is what lets index.html
// preload it — it is the page's LCP element now, and a hashed bundle name could
// not be named in static HTML.
const BANNER = '/banner.webp'

const SITE_URL = 'https://theedgeofthemap.com'

// The visible link label, derived rather than retyped — a domain change used to
// leave the anchor text pointing at the old host while its href and alt updated.
const SITE_HOST = new URL(SITE_URL).host

// Single source for every CTA — change here, not in the markup.
// If the crafts ever want separate inboxes, add an `email` to PATHS and fall
// back to this one.
const CONTACT_EMAIL = 'keeper@theedgeofthemap.com'

// TODO(confirm): inferred from the repo owner. Change here, not in the copy.
const MAKER_NAME = 'Chris Baumgart'

// Drives both the unmount timer below and the mask animation in CSS, which
// reads it as --burn-dur. Changing it here changes both.
const BURN_MS = 1800

// One brand, three crafts. Kept as data so a fourth path — or splitting one
// out to its own route later — is an edit here, not a layout rewrite.
//
// `blurb` is the light face: plain, professional, no atmosphere. `loreBlurb`
// is the mystic face, in the same voice as AboutLore. Two fields rather than
// one because the cards render in both faces, and letting the mystic copy
// through to daylight is exactly the leak §5 of DESIGN.md warns about.
const PATHS = [
  {
    id: 'keeper',
    rune: 'othala',
    title: 'Web & Systems',
    persona: 'The Keeper',
    blurb:
      'Web applications you own outright — your data exportable on demand, a real API behind it, and full control of your own content.',
    loreBlurb:
      'A system is an idea that someone has to keep. It will outlive the immediate, the budget, and probably me, and one day a stranger will open it and have to understand it. I build for that stranger.',
    points: [
      'Your data, yours to export',
      'Robust, documented API access',
      'Template starts, then edit inline',
    ],
    cta: 'Start a project',
    subject: 'Project enquiry — Web & Systems',
  },
  {
    id: 'storyteller',
    rune: 'ansuz',
    title: 'Audio Narration',
    persona: 'The Storyteller',
    blurb:
      'Audiobook narration made in collaboration with the author — characters voiced as faithfully to your original intent as I can get them.',
    loreBlurb:
      'A story is only ink until someone says it aloud. And then it is a voice in a stranger’s ear, in the car, in the dark, over the dishes, for hours. I say it aloud.',
    points: [
      'Author-led character work',
      'Audiobook and commercial VO',
      'Studio-quality delivery',
    ],
    cta: 'Request a demo',
    subject: 'Booking enquiry — Audio Narration',
  },
  {
    id: 'wright',
    rune: 'berkano',
    title: 'Woodworking',
    persona: 'The Wright',
    blurb:
      'Commissioned fine woodwork decor and accessories, cut and joined by hand for the room it will live in.',
    loreBlurb:
      'This was a tree once, and it was reaching for something the whole time it stood. It is still reaching. I shape it by hand into the thing it was already becoming, and it will hold long after the room it was made for is gone.',
    points: ['Bespoke Decor', 'Hardwood joinery', 'Finish and restoration'],
    cta: 'Discuss a commission',
    subject: 'Commission enquiry — Woodworking',
  },
]

const mailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

// The one subject line that isn't path-specific, and so the only one that could
// drift: it was typed out at four call sites, and editing three of four splits
// inbound mail into two differently-named threads with nothing visible on the
// page to show it. Per-path subjects live in PATHS.subject.
const GENERAL_ENQUIRY = mailto('Enquiry — Edge of the Map')

/* The one place the two faces diverge in *content* rather than styling.
   Everything else on the page is the same markup re-themed; here the mode
   genuinely changes what is said. The professional face earns trust, the
   mystic face rewards the visitor who pulled the thread. */

function AboutProfessional() {
  return (
    <>
      <h2>One workshop, three trades.</h2>
      <p>
        I&rsquo;m {MAKER_NAME}. I run Edge of the Map LLC on my own: I build
        software, I narrate audiobooks, and I make furniture.
      </p>
      <p>
        That combination raises an eyebrow, and it should. So here is the honest
        version — they are not secretly the same craft. What they share is how
        the work gets done. You describe what you need, and the person you spoke
        to is the person who builds it. No account layer, no handoff, no junior
        picking it up on Thursday.
      </p>
      <p>
        The other thing they share is a time horizon. A table outlives the room
        it was bought for. A narration sits in someone&rsquo;s ears for eleven
        hours. A system gets inherited by whoever comes next. I would rather
        make things that survive contact with that.
      </p>
    </>
  )
}

function AboutLore() {
  return (
    <>
      <h2>Every story starts at the beginning.</h2>
      <p>With the exception of those that don&rsquo;t.</p>
      <p className="lore-lede">
        There are three branches here, and they look like three different
        things, and people tell me so. They sprout from a single trunk. A
        website is an idea, or an amalgam of ideas, and every one of them must
        start somewhere. Every narration is a tale from start to end. Every
        finished piece of woodwork first was a seedling, sprouted, grew, and was
        shaped. All of it born of star stuff.
      </p>
      <p>
        And the wood remembers. It remembers every year it stood and every dry
        summer, and it will tell you so in the grain, and it will fight you if
        you do not read it. And the story remembers too, because someone dreamed
        it once, and someone must say it aloud, or it stays ink. And the system
        remembers longest of all. Someone will inherit it. Someone I will never
        meet will open it at two in the morning and either bless me or curse me,
        and I will never know which.
      </p>
      <p>So I shape. And I tell. And I keep.</p>
      <p>
        The runes were not chosen for their shapes. Othala, the homestead you
        keep. Ansuz, the breath that carries a word. Berkano, the birch, which
        is to say growth, and very literally growth in wood itself. Three branches, one trunk. I did
        not choose them. But they are here, and they have spoken.
      </p>
      <p>
        Each of these branches shares in common one single thing. Wonder.
      </p>
      <p>
        That is the whole of it. Not the wood, not the code, not the voice. The
        held breath before a thing exists, and the smaller one after. I have
        chased it into all three trades and found it waiting in each, patient,
        and entirely unwilling to explain itself.
      </p>
      <p>
        We are the keepers of wonder. A shaper of stories, a teller of tales, a
        dreamer of dreams.
      </p>
      <p>
        They told me the map ended here. It does not end. It is only where
        someone else stopped drawing.
      </p>
    </>
  )
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
 *  reason the gate is affordable. */
function useScrollReveal() {
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
  }, [])
}

function App() {
  const [isMystic, setIsMystic] = useState(false)
  // The burn holds a *clone of the outgoing page*, captured at the moment of
  // the toggle. The clone keeps the old face because `.face` re-declares the
  // theme tokens, so it renders in the outgoing world while the live wrapper
  // below it has already flipped to the new one.
  const [burn, setBurn] = useState(null)
  const timers = useRef([])
  const faceRef = useRef(null)
  const sheetRef = useRef(null)

  useScrollReveal()

  // Mystic mode themes the whole page, not just the centred container,
  // so the class lives on <body>.
  useEffect(() => {
    document.body.classList.toggle('mystic-mode', isMystic)
  }, [isMystic])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Mount the cloned page into the sheet once React has rendered the sheet.
  useEffect(() => {
    if (!burn || !sheetRef.current) return
    sheetRef.current.appendChild(burn.clone)
    return () => burn.clone.remove()
  }, [burn])

  const toggleMystic = useCallback(() => {
    if (burn) return // already mid-transition

    const face = faceRef.current
    if (prefersReducedMotion() || !face) {
      setIsMystic((prev) => !prev)
      return
    }

    const clone = face.cloneNode(true)
    clone.classList.add('burn-page')
    clone.setAttribute('aria-hidden', 'true')
    // Duplicate ids would briefly shadow the real ones for anchor links.
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))

    // The sticky header needs no JS: it stays in flow (moving it out shifts
    // everything below it up by its own height) and CSS retargets its sticky
    // threshold to the burn bleed. See `.burn-page .site-header`.
    setBurn({
      clone,
      lit: false,
      scrollY: window.scrollY,
      width: face.offsetWidth,
    })

    // Let the clone paint before the theme underneath changes, then start the
    // burn on the following frame so the mask transition has a start value.
    //
    // Assigned, not appended: the burn is single-flight (the guard above), so
    // only the current run's ids can ever matter and pushing grew the array for
    // the whole session.
    timers.current = [
      setTimeout(() => {
        setIsMystic((prev) => !prev)
        setBurn((b) => (b ? { ...b, lit: true } : b))
      }, 60),
      setTimeout(() => setBurn(null), BURN_MS + 260),
    ]
  }, [burn])

  const toggleLabel = isMystic ? 'Return to the Known' : 'Reveal the Mystery'

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

      <div className={`face ${isMystic ? 'mystic-mode' : ''}`} ref={faceRef}>
      {/* The plate *is* the header. The nav and the controls are laid over the
          artwork above its bound-rune frieze, and the plate's own neon wordmark
          is the brand — so the compact signature mark and the "Edge of the Map"
          text that used to sit in this row are gone rather than repeated.

          The plate is not lazy and not deprioritised: it is the largest thing
          above the fold, so it is the LCP element, and index.html preloads it by
          the same stable URL. */}
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Edge of the Map LLC — back to top">
          <img
            className="masthead-plate"
            src={BANNER}
            alt="Edge of the Map LLC"
            width="2048"
            height="640"
            fetchPriority="high"
            decoding="async"
          />
        </a>

        <div className="header-bar">
          {/* The nav wears the same button as Contact rather than a nav-link
              style of its own — one shape for every control on the plate. The
              classes are reused, not restyled: `.header-bar` re-declares the
              accent tokens so `.btn-primary` resolves to the plate's neon. */}
          <nav className="site-nav" aria-label="Sections">
            {PATHS.map((path) => (
              <a
                key={path.id}
                className="btn btn-primary btn-sm"
                href={`#${path.id}`}
              >
                {path.title}
              </a>
            ))}
            <a className="btn btn-primary btn-sm" href="#about">
              {isMystic ? 'Lore' : 'About'}
            </a>
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

      <main id="top">
        <section className="hero">
          {/* Only lit in mystic mode — the default face is a clean light page.
              It stays in the document rather than mounting on toggle, because
              the burn clones the outgoing page and a plate that appears with
              the flip would pop in behind the tear instead of being revealed
              by it. It is, though, explicitly deprioritised: every visitor
              fetches and decodes it, and most never toggle, so it must not
              compete with the hero card for bandwidth on first paint. */}
          <div className="hero-media" aria-hidden="true">
            <img
              className="hero-image"
              src={heroWide}
              srcSet={`${heroNarrow} 960w, ${heroWide} 1536w`}
              sizes="100vw"
              alt=""
              fetchPriority="low"
              decoding="async"
            />
            <div className="hero-scrim" />
          </div>

          <div className="hero-inner">
            <div className="hero-copy">
              {/* The section's title line, with the signature interaction set
                  against it on the right. The pill reads as the answer to the
                  brand line rather than as one more button under the CTAs, and
                  the pairing costs the hero a row instead of adding one. */}
              <div className="hero-head">
                <p className="eyebrow">Edge of the Map LLC</p>
                <button
                  className="reveal-cta"
                  onClick={toggleMystic}
                  aria-pressed={isMystic}
                >
                  <span className="reveal-cta-rune" aria-hidden="true">
                    <Rune name="raido" />
                  </span>
                  <span className="reveal-cta-text">
                    <strong>{toggleLabel}</strong>
                    <small>
                      {isMystic
                        ? 'Put out the fire and return to daylight'
                        : 'Burn the map away and see what lies beneath'}
                    </small>
                  </span>
                </button>
              </div>
              <h1>
                Narration, software, and woodwork — from one workshop.
              </h1>
              <p className="hero-sub">
                A single practitioner across three disciplines. Clear scope, direct
                communication, and work that outlasts the brief.
              </p>

              <div className="hero-actions">
                <a className="btn btn-primary" href={GENERAL_ENQUIRY}>
                  Start a conversation
                </a>
                <a className="btn btn-ghost" href="#services">
                  Explore services
                </a>
              </div>

              <ul className="hero-trust">
                {PATHS.map((path) => (
                  <li key={path.id}>
                    <Rune name={path.rune} />
                    {path.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* The logo card sits here rather than in the hero. With the banner
            plate directly above it, the hero was showing the wordmark twice
            above the fold; down here the card is the section's visual and the
            only place the full logo appears in the page body.

            className stays a constant string — see the note on .about below. */}
        <section className="services" id="services">
          <div className="section-head services-head" data-reveal>
            <div className="services-head-copy">
              <p className="eyebrow">Services</p>
              <h2>Three disciplines, one point of contact.</h2>
              <p className="section-sub">
                Every engagement runs through the same person from first call to
                handover — no account layer, no handoffs.
              </p>
            </div>

            <div className="services-visual">
              <img
                src={logoCard}
                alt="Edge of the Map LLC"
                width="800"
                height="533"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          {/* --reveal-index carries only the index — the stagger interval is
              pace, and pace is a token here, so CSS multiplies it by
              --reveal-step. As a `${i * 80}ms` literal the cascade was stuck at
              the light face's rhythm and could not slow with the mystic face. */}
          <div className="cards">
            {PATHS.map((path, i) => (
              <article
                key={path.id}
                id={path.id}
                className="card"
                data-reveal
                style={{ '--reveal-index': i }}
              >
                {isMystic && <RuneFrame />}
                <span className="card-icon">
                  <Rune name={path.rune} />
                </span>
                <p className="card-persona">{path.persona}</p>
                <h3>{path.title}</h3>
                <p className="card-blurb">
                  {isMystic ? path.loreBlurb : path.blurb}
                </p>
                <ul className="card-points">
                  {path.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <a className="card-link" href={mailto(path.subject)}>
                  {path.cta}
                  <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* className must stay a constant string. useScrollReveal adds
            `is-visible` imperatively and then unobserves the element, so any
            React-computed className here would wipe that class on the next
            mode toggle and strand the section at opacity 0 forever. The lore
            styling keys off body.mystic-mode instead. */}
        <section className="about" id="about" data-reveal>
          <div className="about-inner">
            <p className="eyebrow">{isMystic ? 'Lore' : 'About'}</p>
            {isMystic ? <AboutLore /> : <AboutProfessional />}
          </div>
        </section>

        <section className="cta-band" data-reveal>
          <div className="cta-band-inner">
            <div>
              <h2>Start where the map ends.</h2>
              <p>
                Tell me what you are building, recording, or commissioning —
                whichever path brought you here.
              </p>
            </div>
            <a className="btn btn-primary btn-lg" href={GENERAL_ENQUIRY}>
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>

        <section className="qr-section" data-reveal>
          <div className="qr-card">
            <div className="qr-copy">
              <p className="eyebrow">Carry the map</p>
              <h2>Keep this page in your pocket.</h2>
              <p>
                Scan the code, or visit <a href={SITE_URL}>{SITE_HOST}</a>.
              </p>
            </div>
            <a href={SITE_URL} className="qr-link">
              <img
                src={qrCode}
                alt={`QR code linking to ${SITE_URL}`}
                width="500"
                height="750"
                className="qr-code"
                loading="lazy"
              />
            </a>
          </div>
        </section>
      </main>

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
              <a key={path.id} href={`#${path.id}`}>
                {path.title}
              </a>
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
