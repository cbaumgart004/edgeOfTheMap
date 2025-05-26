// App.jsx
import React from 'react'
import './App.css'
import logo from './assets/logo.png' // Adjust the path as necessary

import qrCode from './assets/QR_Complete.png'

function App() {
  return (
    <div className="container">
      <header>
        <img
          src={logo}
          alt="Edge of the Map LLC Logo"
          className="logo shimmer"
        />
        <div className="tagline">
          Where legends are forged in luminous flame
        </div>
      </header>
      <section className="qr-section">
        <div className="glow-ring">
          <img src={qrCode} alt="Scan to visit" className="qr-image" />
        </div>
        <p>Scan the seal to enter the archive</p>
        <button
          className="glow-button"
          onClick={() => (window.location.href = 'https://theedgeofthemap.com')}
        >
          Enter the Archive
        </button>
      </section>
      <footer>&copy; 2025 Edge of the Map LLC. All rights reserved.</footer>
    </div>
  )
}

export default App
