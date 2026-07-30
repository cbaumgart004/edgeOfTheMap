// HomePage.jsx
//
// Everything that used to be App's <main>. It moved out unchanged when the
// Keeper got a route: App is the shell (plate, nav, footer, burn) and each
// route supplies the middle. The two faces' About/Lore swap lives here because
// it is home-page content, not shell.

import React from 'react'
import Rune from './Rune.jsx'
import RuneFrame from './RuneFrame.jsx'
import { Link } from './router.jsx'
import {
  CONTACT_EMAIL,
  GENERAL_ENQUIRY,
  MAKER_NAME,
  PATHS,
  SITE_HOST,
  SITE_URL,
  cardHref,
} from './content.js'
import heroWide from './assets/hero-wide.webp'
import heroNarrow from './assets/hero-narrow.webp'
import logoCard from './assets/logo-card.webp'
import qrCode from './assets/qr_code.png'

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

export default function HomePage({ isMystic, toggleMystic, toggleLabel }) {
  return (
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
            <h1>Narration, software, and woodwork — from one workshop.</h1>
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

            {/* A credential row, and — where a craft has a page of its own —
                also a way in. Only the paths with an `href` become links: a
                trust row where one item is clickable and two are not is
                honest, where three that look alike and behave differently is
                not. When the Storyteller earns a page this needs no edit. */}
            <ul className="hero-trust">
              {PATHS.map((path) => (
                <li key={path.id}>
                  {path.href ? (
                    <Link href={path.href}>
                      <Rune name={path.rune} />
                      {path.title}
                    </Link>
                  ) : (
                    <>
                      <Rune name={path.rune} />
                      {path.title}
                    </>
                  )}
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
              {/* The heading links too, not just the CTA at the foot. A card
                  whose title looks like a heading and whose only target is one
                  line of small text at the bottom makes people hunt. Two links
                  to the same place in one card is the ordinary pattern; a
                  stretched overlay is not, because this card already has a
                  second, different link below it. */}
              <h3>
                {path.href ? <Link href={path.href}>{path.title}</Link> : path.title}
              </h3>
              <p className="card-blurb">
                {isMystic ? path.loreBlurb : path.blurb}
              </p>
              <ul className="card-points">
                {path.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {/* A path with a page of its own links to the page; one without
                  opens an enquiry. Both are `Link`, which passes anything that
                  isn't a route straight through to the browser. */}
              <Link className="card-link" href={cardHref(path)}>
                {path.cta}
                <span aria-hidden="true">→</span>
              </Link>
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
  )
}
