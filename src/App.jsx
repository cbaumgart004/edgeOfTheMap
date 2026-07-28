// App.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import Rune from './Rune.jsx'
import BurnFilter from './BurnFilter.jsx'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import logoCard from './assets/logo-card.webp'
import mark from './assets/logo_signature.png'
import qrCode from './assets/qr_code.png'

const SITE_URL = 'https://theedgeofthemap.com'

// TODO(confirm): placeholder until the LLC's real inbox is settled.
// Single source for every CTA — change here, not in the markup.
const CONTACT_EMAIL = 'hello@theedgeofthemap.com'

const BURN_MS = 1250

// One brand, three crafts. Kept as data so a fourth path — or splitting one
// out to its own route later — is an edit here, not a layout rewrite.
const PATHS = [
  {
    id: 'keeper',
    rune: 'othala',
    title: 'Web & Systems',
    persona: 'The Keeper',
    blurb:
      'Full-stack development, systems design, and digital infrastructure built to outlast the brief.',
    points: ['React & Node applications', 'API and data modelling', 'Deployment and CI'],
    cta: 'Start a project',
    subject: 'Project enquiry — Web & Systems',
  },
  {
    id: 'storyteller',
    rune: 'ansuz',
    title: 'Audio Narration',
    persona: 'The Storyteller',
    blurb:
      'Audiobook narration, voice artistry, and immersive storytelling — recorded, directed, delivered.',
    points: ['Audiobook narration', 'Character & commercial VO', 'Studio-quality delivery'],
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
    points: ['Bespoke furniture', 'Hardwood joinery', 'Finish and restoration'],
    cta: 'Discuss a commission',
    subject: 'Commission enquiry — Woodworking',
  },
]

const mailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

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

  const toggleLabel = isMystic ? 'Return to the known' : 'Reveal the mystery'

  return (
    <>
      <BurnFilter />

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

        <nav className="site-nav" aria-label="Services">
          {PATHS.map((path) => (
            <a key={path.id} href={`#${path.id}`}>
              {path.title}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button
            className="header-toggle"
            onClick={toggleMystic}
            aria-pressed={isMystic}
            title={toggleLabel}
          >
            <Rune name="othala" />
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
                <span className="card-icon">
                  <Rune name={path.rune} />
                </span>
                <p className="card-persona">{path.persona}</p>
                <h3>{path.title}</h3>
                <p className="card-blurb">{path.blurb}</p>
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
