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
import { usePaths } from './siteConsole.jsx'
import { EditsPage, Region, E } from './edits.jsx'
import {
  CONTACT_EMAIL,
  GENERAL_ENQUIRY,
  MAKER_NAME,
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
      <E id="about:pro:title" as="h2">One workshop, three trades.</E>
      <E id="about:pro:p1" as="p" rich>
        I&rsquo;m {MAKER_NAME}. I run Edge of the Map LLC on my own: I build
        software, I narrate audiobooks, and I make furniture.
      </E>
      <E id="about:pro:p2" as="p">
        That combination raises an eyebrow, and it should. So here is the honest
        version — they are not secretly the same craft. What they share is how
        the work gets done. You describe what you need, and the person you spoke
        to is the person who builds it. No account layer, no handoff, no junior
        picking it up on Thursday.
      </E>
      <E id="about:pro:p3" as="p" rich>
        The other thing they share is a time horizon. A table outlives the room
        it was bought for. A narration sits in someone&rsquo;s ears for eleven
        hours. A system gets inherited by whoever comes next. I would rather
        make things that survive contact with that.
      </E>
    </>
  )
}

function AboutLore() {
  return (
    <>
      <E id="about:lore:title" as="h2">Every story starts at the beginning.</E>
      <E id="about:lore:p1" as="p" rich>With the exception of those that don&rsquo;t.</E>
      <E id="about:lore:lede" as="p" className="lore-lede">
        There are three branches here, and they look like three different
        things, and people tell me so. They sprout from a single trunk. A
        website is an idea, or an amalgam of ideas, and every one of them must
        start somewhere. Every narration is a tale from start to end. Every
        finished piece of woodwork first was a seedling, sprouted, grew, and was
        shaped. All of it born of star stuff.
      </E>
      <E id="about:lore:p2" as="p">
        And the wood remembers. It remembers every year it stood and every dry
        summer, and it will tell you so in the grain, and it will fight you if
        you do not read it. And the story remembers too, because someone dreamed
        it once, and someone must say it aloud, or it stays ink. And the system
        remembers longest of all. Someone will inherit it. Someone I will never
        meet will open it at two in the morning and either bless me or curse me,
        and I will never know which.
      </E>
      <E id="about:lore:p3" as="p">So I shape. And I tell. And I keep.</E>
      <E id="about:lore:p4" as="p">
        The runes were not chosen for their shapes. Othala, the homestead you
        keep. Ansuz, the breath that carries a word. Berkano, the birch, which
        is to say growth, and very literally growth in wood itself. Three branches, one trunk. I did
        not choose them. But they are here, and they have spoken.
      </E>
      <E id="about:lore:p5" as="p">
        Each of these branches shares in common one single thing. Wonder.
      </E>
      <E id="about:lore:p6" as="p">
        That is the whole of it. Not the wood, not the code, not the voice. The
        held breath before a thing exists, and the smaller one after. I have
        chased it into all three trades and found it waiting in each, patient,
        and entirely unwilling to explain itself.
      </E>
      <E id="about:lore:p7" as="p">
        We are the keepers of wonder. A shaper of stories, a teller of tales, a
        dreamer of dreams.
      </E>
      <E id="about:lore:p8" as="p">
        They told me the map ended here. It does not end. It is only where
        someone else stopped drawing.
      </E>
    </>
  )
}

export default function HomePage({ isMystic, toggleMystic, toggleLabel }) {
  const paths = usePaths()
  return (
    <EditsPage page="home">
    <main id="top">
      <Region id="hero" as="section" label="Hero" className="hero">
        {/* Only lit in mystic mode — the default face is a clean light page.
            It stays in the document rather than mounting on toggle, because
            the burn clones the outgoing page and a plate that appears with
            the flip would pop in behind the tear instead of being revealed
            by it. It is, though, explicitly deprioritised: every visitor
            fetches and decodes it, and most never toggle, so it must not
            compete with the hero card for bandwidth on first paint. */}
        <E id="hero:media" as="div" text={false} className="hero-media" aria-hidden="true">
          <E
            id="hero:media:image"
            as="img"
            place={false}
            text={false}
            className="hero-image"
            src={heroWide}
            srcSet={`${heroNarrow} 960w, ${heroWide} 1536w`}
            sizes="100vw"
            alt=""
            fetchPriority="low"
            decoding="async"
          />
          <div className="hero-scrim" />
        </E>

        <div className="hero-inner" data-eotm-wrap="">
          <div className="hero-copy" data-eotm-wrap="">
            {/* The section's title line, with the signature interaction set
                against it on the right. The pill reads as the answer to the
                brand line rather than as one more button under the CTAs, and
                the pairing costs the hero a row instead of adding one. */}
            <div className="hero-head" data-eotm-wrap="">
              <E id="hero:eyebrow" as="p" className="eyebrow">Edge of the Map LLC</E>
              <E
                id="hero:reveal"
                as="button"
                text={false}
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
              </E>
            </div>
            <E id="hero:title" as="h1">Narration, software, and woodwork — from one workshop.</E>
            <E id="hero:sub" as="p" className="hero-sub">
              A single practitioner across three disciplines. Clear scope, direct
              communication, and work that outlasts the brief.
            </E>

            <E id="hero:actions" as="div" text={false} className="hero-actions">
              <E id="hero:actions:start" as="a" place={false} className="btn btn-primary" href={GENERAL_ENQUIRY}>
                Start a conversation
              </E>
              <E id="hero:actions:explore" as="a" place={false} className="btn btn-ghost" href="#services">
                Explore services
              </E>
            </E>

            {/* A credential row, and — where a craft has a page of its own —
                also a way in. Only the paths with an `href` become links: a
                trust row where one item is clickable and two are not is
                honest, where three that look alike and behave differently is
                not. When the Storyteller earns a page this needs no edit. */}
            <E id="hero:trust" as="ul" text={false} className="hero-trust">
              {paths.map((path) => (
                <E key={path.id} id={`hero:trust:${path.id}`} as="li" place={false} text={false}>
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
                </E>
              ))}
            </E>
          </div>
        </div>
      </Region>

      {/* The logo card sits here rather than in the hero. With the banner
          plate directly above it, the hero was showing the wordmark twice
          above the fold; down here the card is the section's visual and the
          only place the full logo appears in the page body.

          className stays a constant string — see the note on .about below. */}
      <Region id="services" as="section" domId="services" label="Services" className="services">
        <div className="section-head services-head" data-reveal data-eotm-wrap="">
          <div className="services-head-copy" data-eotm-wrap="">
            <E id="services:eyebrow" as="p" className="eyebrow">Services</E>
            <E id="services:title" as="h2">Three disciplines, one point of contact.</E>
            <E id="services:sub" as="p" className="section-sub">
              Every engagement runs through the same person from first call to
              handover — no account layer, no handoffs.
            </E>
          </div>

          <E id="services:visual" as="div" text={false} className="services-visual">
            <E
              id="services:visual:image"
              as="img"
              place={false}
              text={false}
              src={logoCard}
              alt="Edge of the Map LLC"
              width="800"
              height="533"
              loading="lazy"
              decoding="async"
            />
          </E>
        </div>

        {/* --reveal-index carries only the index — the stagger interval is
            pace, and pace is a token here, so CSS multiplies it by
            --reveal-step. As a `${i * 80}ms` literal the cascade was stuck at
            the light face's rhythm and could not slow with the mystic face. */}
        <E id="services:cards" as="div" text={false} className="cards">
          {paths.map((path, i) => (
            <E
              key={path.id}
              id={`services:card:${path.id}`}
              as="article"
              domId={path.id}
              place={false}
              text={false}
              className="card"
              data-reveal
              style={{ '--reveal-index': i }}
            >
              {isMystic && <RuneFrame />}
              <E id={`services:card:${path.id}:icon`} as="span" place={false} text={false} className="card-icon">
                <Rune name={path.rune} />
              </E>
              <E id={`services:card:${path.id}:persona`} as="p" place={false} className="card-persona">{path.persona}</E>
              {/* The heading links too, not just the CTA at the foot. A card
                  whose title looks like a heading and whose only target is one
                  line of small text at the bottom makes people hunt. Two links
                  to the same place in one card is the ordinary pattern; a
                  stretched overlay is not, because this card already has a
                  second, different link below it. */}
              <E id={`services:card:${path.id}:title`} as="h3" place={false} rich>
                {path.href ? <Link href={path.href}>{path.title}</Link> : path.title}
              </E>
              {isMystic ? (
                <E id={`services:card:${path.id}:loreBlurb`} as="p" place={false} className="card-blurb">
                  {path.loreBlurb}
                </E>
              ) : (
                <E id={`services:card:${path.id}:blurb`} as="p" place={false} className="card-blurb">
                  {path.blurb}
                </E>
              )}
              <E id={`services:card:${path.id}:points`} as="ul" place={false} text={false} className="card-points">
                {path.points.map((point, j) => (
                  <E key={point} id={`services:card:${path.id}:point:${j}`} as="li" place={false}>{point}</E>
                ))}
              </E>
              {/* A path with a page of its own links to the page; one without
                  opens an enquiry. Both are `Link`, which passes anything that
                  isn't a route straight through to the browser. */}
              <E id={`services:card:${path.id}:link`} as={Link} place={false} rich className="card-link" href={cardHref(path)}>
                {path.cta}
                <span aria-hidden="true">→</span>
              </E>
            </E>
          ))}
        </E>
      </Region>

      {/* className must stay a constant string. useScrollReveal adds
          `is-visible` imperatively and then unobserves the element, so any
          React-computed className here would wipe that class on the next
          mode toggle and strand the section at opacity 0 forever. The lore
          styling keys off body.mystic-mode instead. */}
      <Region id="about" as="section" domId="about" label="About" className="about" data-reveal>
        <div className="about-inner" data-eotm-wrap="">
          {isMystic ? (
            <E id="about:lore:eyebrow" as="p" className="eyebrow">Lore</E>
          ) : (
            <E id="about:pro:eyebrow" as="p" className="eyebrow">About</E>
          )}
          {isMystic ? <AboutLore /> : <AboutProfessional />}
        </div>
      </Region>

      <Region id="cta" as="section" label="Call to action" className="cta-band" data-reveal>
        <div className="cta-band-inner" data-eotm-wrap="">
          <div data-eotm-wrap="">
            <E id="cta:title" as="h2">Start where the map ends.</E>
            <E id="cta:text" as="p">
              Tell me what you are building, recording, or commissioning —
              whichever path brought you here.
            </E>
          </div>
          <E id="cta:button" as="a" className="btn btn-primary btn-lg" href={GENERAL_ENQUIRY}>
            {CONTACT_EMAIL}
          </E>
        </div>
      </Region>

      <Region id="qr" as="section" label="QR code" className="qr-section" data-reveal>
        <div className="qr-card" data-eotm-wrap="">
          <div className="qr-copy" data-eotm-wrap="">
            <E id="qr:eyebrow" as="p" className="eyebrow">Carry the map</E>
            <E id="qr:title" as="h2">Keep this page in your pocket.</E>
            <E id="qr:text" as="p" rich>
              Scan the code, or visit <a href={SITE_URL}>{SITE_HOST}</a>.
            </E>
          </div>
          <E id="qr:link" as="a" text={false} href={SITE_URL} className="qr-link">
            <E
              id="qr:image"
              as="img"
              place={false}
              text={false}
              src={qrCode}
              alt={`QR code linking to ${SITE_URL}`}
              width="500"
              height="750"
              className="qr-code"
              loading="lazy"
            />
          </E>
        </div>
      </Region>
    </main>
    </EditsPage>
  )
}
