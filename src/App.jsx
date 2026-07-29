// App.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import Rune from './Rune.jsx'
import SvgDefs from './SvgDefs.jsx'
import RuneFrame from './RuneFrame.jsx'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import logoCard from './assets/logo-card.webp'
import mark from './assets/logo_signature.png'
import qrCode from './assets/qr_code.png'

const SITE_URL = 'https://theedgeofthemap.com'

// Single source for every CTA — change here, not in the markup.
// If the crafts ever want separate inboxes, add an `email` to PATHS and fall
// back to this one.
const CONTACT_EMAIL = 'keeper@theedgeofthemap.com'

// TODO(confirm): inferred from the repo owner. Change here, not in the copy.
const MAKER_NAME = 'Chris Baumgart'

const BURN_MS = 1250

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
      'A system is an idea that someone has to keep. It will outlive the brief, and the budget, and probably me, and one day a stranger will open it and have to understand it. I build for that stranger.',
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
      'Commissioned furniture and fine woodwork, cut and joined by hand for the room it will live in.',
    loreBlurb:
      'This was a tree once, and it was reaching for something the whole time it stood. It is still reaching. I shape it by hand into the thing it was already becoming, and it will hold long after the room it was made for is gone.',
    points: ['Bespoke furniture', 'Hardwood joinery', 'Finish and restoration'],
    cta: 'Discuss a commission',
    subject: 'Commission enquiry — Woodworking',
  },
]

const mailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

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
      <p>
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
        is to say growth, which is to say wood. Three branches, one trunk. I did
        not choose them. I noticed them.
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

/** Fades sections in as they enter view. Opts out entirely under
 *  prefers-reduced-motion by revealing everything up front. */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
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
    return () => io.disconnect()
  }, [])
}

function App() {
  const [isMystic, setIsMystic] = useState(false)
  // The burn sheet is painted with the *outgoing* background, frozen at the
  // moment of the toggle — reading a live var would recolour it mid-burn.
  const [burn, setBurn] = useState(null)
  const timers = useRef([])

  useScrollReveal()

  // Mystic mode themes the whole page, not just the centred container,
  // so the class lives on <body>.
  useEffect(() => {
    document.body.classList.toggle('mystic-mode', isMystic)
  }, [isMystic])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const toggleMystic = useCallback(() => {
    if (burn) return // already mid-transition

    if (prefersReducedMotion()) {
      setIsMystic((prev) => !prev)
      return
    }

    const outgoing = getComputedStyle(document.body).backgroundColor
    setBurn({ bg: outgoing, lit: false })

    // Let the sheet paint before the theme underneath changes, then start
    // the burn on the following frame so the mask transition has a start value.
    timers.current.push(
      setTimeout(() => {
        setIsMystic((prev) => !prev)
        setBurn((b) => (b ? { ...b, lit: true } : b))
      }, 60)
    )
    timers.current.push(setTimeout(() => setBurn(null), BURN_MS + 260))
  }, [burn])

  const toggleLabel = isMystic ? 'Return to the Known' : 'Reveal the Mystery'

  return (
    <>
      <SvgDefs />

      {burn && (
        <div className={`burn ${burn.lit ? 'is-lit' : ''}`} aria-hidden="true">
          <div className="burn-warp">
            <div className="burn-ember" />
            <div className="burn-sheet" style={{ background: burn.bg }} />
          </div>
        </div>
      )}

      <header className="site-header">
        <a className="brand" href="#top">
          <img src={mark} alt="" className="brand-mark" />
          <span className="brand-name">Edge of the Map</span>
        </a>

        <nav className="site-nav" aria-label="Sections">
          {PATHS.map((path) => (
            <a key={path.id} href={`#${path.id}`}>
              {path.title}
            </a>
          ))}
          <a href="#about">{isMystic ? 'Lore' : 'About'}</a>
        </nav>

        <div className="header-actions">
          <button
            className="header-toggle"
            onClick={toggleMystic}
            aria-pressed={isMystic}
            title={toggleLabel}
          >
            <Rune name="raido" />
            <span className="visually-hidden">{toggleLabel}</span>
          </button>
          <a className="btn btn-primary btn-sm" href={mailto('Enquiry — Edge of the Map')}>
            Contact
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          {/* Only lit in mystic mode — the default face is a clean light page. */}
          <div className="hero-media" aria-hidden="true">
            <img
              className="hero-image"
              src={heroWide}
              srcSet={`${heroNarrow} 960w, ${heroWide} 1536w`}
              sizes="100vw"
              alt=""
            />
            <div className="hero-scrim" />
          </div>

          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">Edge of the Map LLC</p>
              <h1>
                Narration, software, and woodwork — from one workshop.
              </h1>
              <p className="hero-sub">
                A single practitioner across three disciplines. Clear scope, direct
                communication, and work that outlasts the brief.
              </p>

              <div className="hero-actions">
                <a
                  className="btn btn-primary"
                  href={mailto('Enquiry — Edge of the Map')}
                >
                  Start a conversation
                </a>
                <a className="btn btn-ghost" href="#services">
                  Explore services
                </a>
              </div>

              {/* The signature interaction, stated outright rather than hidden
                  behind an icon — the ember palette foreshadows the burn. */}
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

              <ul className="hero-trust">
                {PATHS.map((path) => (
                  <li key={path.id}>
                    <Rune name={path.rune} />
                    {path.title}
                  </li>
                ))}
              </ul>
            </div>

            <div className="hero-visual">
              <img
                src={logoCard}
                alt="Edge of the Map LLC"
                width="800"
                height="533"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <section className="services" id="services">
          <div className="section-head" data-reveal>
            <p className="eyebrow">Services</p>
            <h2>Three disciplines, one point of contact.</h2>
            <p className="section-sub">
              Every engagement runs through the same person from first call to
              handover — no account layer, no handoffs.
            </p>
          </div>

          <div className="cards">
            {PATHS.map((path, i) => (
              <article
                key={path.id}
                id={path.id}
                className="card"
                data-reveal
                style={{ '--reveal-delay': `${i * 80}ms` }}
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

        <section
          className={`about ${isMystic ? 'is-lore' : ''}`}
          id="about"
          data-reveal
        >
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
            <a
              className="btn btn-primary btn-lg"
              href={mailto('Enquiry — Edge of the Map')}
            >
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
                Scan the code, or visit{' '}
                <a href={SITE_URL}>theedgeofthemap.com</a>.
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
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={mark} alt="" className="brand-mark" />
            <span>&copy; 2025 Edge of the Map LLC. All rights reserved.</span>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            {PATHS.map((path) => (
              <a key={path.id} href={`#${path.id}`}>
                {path.title}
              </a>
            ))}
            <a href={mailto('Enquiry — Edge of the Map')}>Contact</a>
          </nav>
        </div>
      </footer>
    </>
  )
}

export default App
