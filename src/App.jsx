// App.jsx
import React, { useEffect, useState } from 'react'
import './App.css'
import Rune from './Rune.jsx'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import mark from './assets/logo_signature.png'
import qrCode from './assets/qr_code.png'

const SITE_URL = 'https://theedgeofthemap.com'

// TODO(confirm): placeholder until the LLC's real inbox is settled.
// Single source for every CTA — change here, not in the markup.
const CONTACT_EMAIL = 'hello@theedgeofthemap.com'

// One brand, three crafts. Kept as data so a fourth path — or splitting one
// out to its own route later — is an edit here, not a layout rewrite.
const PATHS = [
  {
    id: 'keeper',
    rune: 'othala',
    title: 'The Keeper',
    discipline: 'Web & Systems',
    blurb:
      'Full-stack development, systems design, and digital infrastructure built to outlast the brief.',
    cta: 'Build with Me',
    subject: 'Project enquiry — Web & Systems',
  },
  {
    id: 'storyteller',
    rune: 'ansuz',
    title: 'The Storyteller',
    discipline: 'Audio Narration',
    blurb:
      'Audiobook narration, voice artistry, and immersive storytelling — recorded, directed, delivered.',
    cta: 'Speak with Me',
    subject: 'Booking enquiry — Audio Narration',
  },
  {
    id: 'wright',
    rune: 'berkano',
    title: 'The Wright',
    discipline: 'Woodworking',
    blurb:
      'Commissioned furniture and fine woodwork, cut and joined by hand for the room it will live in.',
    cta: 'Make with Me',
    subject: 'Commission enquiry — Woodworking',
  },
]

const mailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

/** Fades sections in as they enter view. Opts out entirely under
 *  prefers-reduced-motion by revealing everything up front. */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || !('IntersectionObserver' in window)) {
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

/** The compact header only earns its space once the hero is behind you. */
function usePastHero() {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.65)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return past
}

function App() {
  const [isMystic, setIsMystic] = useState(false)
  const pastHero = usePastHero()
  useScrollReveal()

  // Mystic mode themes the whole page, not just the centred container,
  // so the class lives on <body>.
  useEffect(() => {
    document.body.classList.toggle('mystic-mode', isMystic)
  }, [isMystic])

  const toggleMystic = () => setIsMystic((prev) => !prev)

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <header className={`site-header ${pastHero ? 'is-pinned' : ''}`}>
        <a href="#top" className="site-header-mark">
          Edge of the Map
        </a>

        <nav className="site-nav" aria-label="Disciplines">
          {PATHS.map((path) => (
            <a key={path.id} href={`#${path.id}`}>
              {path.discipline}
            </a>
          ))}
        </nav>

        <button
          className="header-toggle"
          onClick={toggleMystic}
          aria-pressed={isMystic}
          title={isMystic ? 'Return to the Known' : 'Reveal the Mystery'}
        >
          <Rune name="othala" />
          <span className="visually-hidden">
            {isMystic ? 'Return to the Known' : 'Reveal the Mystery'}
          </span>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-media">
          {/* The artwork's own wordmark is cropped off — the type below is real
              text so it scales, reflows, and can be read by a screen reader. */}
          <img
            className="hero-image"
            src={heroWide}
            srcSet={`${heroNarrow} 960w, ${heroWide} 1536w`}
            sizes="100vw"
            alt=""
            fetchPriority="high"
          />
          <div className="hero-scrim" />
        </div>

        <div className="hero-content">
          <div className="hero-runes" aria-hidden="true">
            <Rune name="othala" />
            <Rune name="ansuz" />
            <Rune name="berkano" />
          </div>

          <h1 className="wordmark">
            <span className="wordmark-line">Edge of the Map</span>
            <span className="wordmark-rule" aria-hidden="true" />
            <span className="wordmark-sub">Narration · Web · Woodwork</span>
          </h1>

          <p className="hero-tagline">
            At the edge of every map, something waits — a story to be told, a
            system to be built, a thing to be made by hand.
          </p>

          <button
            className="reveal-button"
            onClick={toggleMystic}
            aria-pressed={isMystic}
          >
            <span className="reveal-rune" aria-hidden="true">
              ◇
            </span>
            <span>{isMystic ? 'Return to the Known' : 'Reveal the Mystery'}</span>
            <span className="reveal-rune" aria-hidden="true">
              ◇
            </span>
          </button>
        </div>

        <div className="hero-scroll" aria-hidden="true">
          <span className="hero-scroll-line" />
        </div>
      </section>

      <div className="container">
        <section className="paths" aria-label="Disciplines">
          {PATHS.map((path, i) => (
            <article
              key={path.id}
              id={path.id}
              className={`panel ${path.id}`}
              data-reveal
              style={{ '--reveal-delay': `${i * 90}ms` }}
            >
              <span className="panel-index" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <Rune name={path.rune} className="panel-rune" />
              <p className="panel-discipline">{path.discipline}</p>
              <h2>{path.title}</h2>
              <p className="panel-blurb">{path.blurb}</p>
              <a className="path-cta" href={mailto(path.subject)}>
                {path.cta}
                <span className="path-cta-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </article>
          ))}
        </section>

        <section className="contact" data-reveal>
          <p className="section-label">Get in touch</p>
          <h2>Start where the map ends.</h2>
          <p className="contact-blurb">
            Tell me what you are building, recording, or commissioning — whichever
            path brought you here.
          </p>
          <a className="contact-link" href={mailto('Enquiry — Edge of the Map')}>
            {CONTACT_EMAIL}
          </a>
        </section>

        <section className="qr-section" data-reveal>
          <p className="section-label">Carry the Map</p>
          <p className="qr-caption">Scan to keep this page in your pocket.</p>
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
        </section>

        <footer>
          <img src={mark} alt="" className="footer-mark" loading="lazy" />
          <p>&copy; 2025 Edge of the Map LLC. All rights reserved.</p>
        </footer>
      </div>
    </>
  )
}

export default App
