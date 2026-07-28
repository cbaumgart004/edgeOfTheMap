// App.jsx
import React, { useEffect, useState } from 'react'
import './App.css'
import Rune from './Rune.jsx'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import mark from './assets/logo_signature.png'
import qrCode from './assets/qr_code.png'

const SITE_URL = 'https://theedgeofthemap.com'

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
  },
  {
    id: 'storyteller',
    rune: 'ansuz',
    title: 'The Storyteller',
    discipline: 'Audio Narration',
    blurb:
      'Audiobook narration, voice artistry, and immersive storytelling — recorded, directed, delivered.',
    cta: 'Speak with Me',
  },
  {
    id: 'wright',
    rune: 'berkano',
    title: 'The Wright',
    discipline: 'Woodworking',
    blurb:
      'Commissioned furniture and fine woodwork, cut and joined by hand for the room it will live in.',
    cta: 'Make with Me',
  },
]

function App() {
  const [isMystic, setIsMystic] = useState(false)

  // Mystic mode themes the whole page, not just the centred container,
  // so the class lives on <body>.
  useEffect(() => {
    document.body.classList.toggle('mystic-mode', isMystic)
  }, [isMystic])

  const toggleMystic = () => {
    setIsMystic((prev) => !prev)
  }

  return (
    <>
      <section className="hero">
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
          {PATHS.map((path) => (
            <article key={path.id} className={`panel ${path.id}`}>
              <Rune name={path.rune} className="panel-rune" />
              <p className="panel-discipline">{path.discipline}</p>
              <h2>{path.title}</h2>
              <p className="panel-blurb">{path.blurb}</p>
              <button className="glow-button">{path.cta}</button>
            </article>
          ))}
        </section>

        <section className="qr-section">
          <h2>Carry the Map</h2>
          <p>Scan to keep this page in your pocket.</p>
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
