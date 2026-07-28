// App.jsx
import React, { useEffect, useState } from 'react'
import './App.css'
import logo from './assets/logo_signature.png'
import qrCode from './assets/qr_code.png'

const SITE_URL = 'https://theedgeofthemap.com'

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
    <div className="container">
      <header>
        <img
          src={logo}
          alt="Edge of the Map LLC Logo"
          width="300"
          height="200"
          className="logo shimmer"
        />
        <div className="tagline">
          At the edge of every map, something waits — a story to be told, a
          system to be built.
        </div>
        <button className="toggle-button" onClick={toggleMystic}>
          {isMystic ? 'Return to the Known' : 'Reveal the Mystery'}
        </button>
      </header>

      <section className="dual-panels">
        <div className="panel keeper">
          <h2>The Keeper</h2>
          <p>
            Full-stack development, systems design, and digital infrastructure.
          </p>
          <button className="glow-button">Build with Me</button>
        </div>

        <div className="panel storyteller">
          <h2>The Storyteller</h2>
          <p>
            Audiobook narration, voice artistry, and immersive storytelling.
          </p>
          <button className="glow-button">Speak with Me</button>
        </div>
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

      <footer>&copy; 2025 Edge of the Map LLC. All rights reserved.</footer>
    </div>
  )
}

export default App
