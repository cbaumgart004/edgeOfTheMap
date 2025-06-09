// App.jsx
import React, { useState } from 'react'
import './App.css'
import logo from './assets/logo.png' // Adjust the path as necessary

function App() {
  const [isMystic, setIsMystic] = useState(false)

  const toggleMystic = () => {
    setIsMystic((prev) => !prev)
  }

  return (
    <div className={`container ${isMystic ? 'mystic-mode' : ''}`}>
      <header>
        <img
          src={logo}
          alt="Edge of the Map LLC Logo"
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

      <footer>&copy; 2025 Edge of the Map LLC. All rights reserved.</footer>
    </div>
  )
}

export default App
