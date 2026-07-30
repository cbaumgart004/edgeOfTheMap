// StorytellerPage.jsx — /storyteller
//
// The Audio Narration pitch. The home page's Storyteller card is the one-line
// version; this is the argument, and the samples are the argument's evidence —
// narration is the one craft here that can simply be demonstrated on the page.
//
// This is the second exercise of the split DESIGN.md §4 anticipated: the path
// gained an `href` in `PATHS` and everything else — nav, footer nav, the card's
// destination — followed from the table. Nothing outside `content.js`, the
// route list and the switch in App.jsx knew about it.
//
// The profile content is mirrored from ACX rather than fetched from it; see the
// header of narration.js and ADR 0006 for why there is no polling here.
//
// Voice fields come in `blurb` / `loreBlurb` pairs, the same convention as
// PATHS and KeeperPage. Facts — languages, delivery, the process steps — stay
// single: they read straight in either face.

import React from 'react'
import Rune from './Rune.jsx'
import { Link } from './router.jsx'
import SamplePlayer from './SamplePlayer.jsx'
import { PATHS } from './content.js'
import {
  AUDITION_ENQUIRY,
  BOOKING_ENQUIRY,
  PROFILE,
  samplesBySource,
} from './narration.js'
import './Storyteller.css'

// This page's own row in the crafts table. Looked up rather than duplicated, so
// the hero's trust row and the home page's card cannot drift apart.
const STORYTELLER = PATHS.find((path) => path.id === 'storyteller')

// The process section is written but **not shown**: every step in it is invented
// rather than confirmed, and a section describing a working process nobody has
// agreed to is exactly the kind of proof-that-proves-nothing `SHOW_HOSTED`
// switches off on the Keeper's page. Flip this once the real process is in
// `PROFILE.process`. See DESIGN.md §4.
const SHOW_PROCESS = false

export default function StorytellerPage({ isMystic }) {
  // Resolved once per render rather than at module scope, so a sample dropped
  // into the folder shows up on the next dev-server reload without a restart.
  const groups = samplesBySource()
  const bio = isMystic ? PROFILE.loreBio : PROFILE.bio

  return (
    <main id="top" className="story">
      <section className="story-hero">
        <div className="story-hero-inner">
          <p className="eyebrow">
            <Rune name="ansuz" /> The Storyteller — Audio Narration
          </p>
          <h1>
            {isMystic
              ? 'Ink, until someone says it aloud.'
              : 'Your book, in your characters’ voices.'}
          </h1>

          {/* The owner's own ACX tagline in the light face, unedited — it is his
              line about his own work. Mystic gets the Ansuz reading rather than
              a second attempt at the same sentence, because restating a good
              line in a grander register is how the Lore voice goes wrong. */}
          <p className="hero-sub">
            {isMystic
              ? 'Ansuz is the god-rune of speech — the breath that turns a mark on a page into a thing that happened to someone. A book read aloud is not a copy of the book. It is the book, arriving a second way.'
              : PROFILE.tagline}
          </p>

          <div className="hero-actions">
            <a className="btn btn-primary" href={BOOKING_ENQUIRY}>
              Request a demo
            </a>
            <a className="btn btn-ghost" href="#samples">
              Hear the samples
            </a>
          </div>

          {/* Read from the Storyteller's own `points` rather than retyped. The
              first draft of this row invented four claims — ACX compliance, a
              delivery promise, a corrections policy — none of which the owner
              had made anywhere. These three are already shipped on the home
              page's card, so they are his, and pulling them from the table
              means the page and the card cannot come to disagree. */}
          <ul className="story-hero-trust">
            {STORYTELLER.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* The evidence, and so the first section rather than a gallery at the
          bottom: a narrator who makes you read three paragraphs before you can
          hear anything has buried the only thing you came to check. */}
      <section className="story-section" id="samples" data-reveal>
        <div className="section-head">
          <p className="eyebrow">Samples</p>
          <h2>{isMystic ? 'Listen, then.' : 'Hear it before you ask.'}</h2>
          <p className="section-sub">
            {isMystic
              ? 'Four registers, and the same throat behind all of them. A voice is not one thing; it is what it does when the page asks it to change.'
              : 'Four registers, each a different job. Play them in any order — one at a time, wherever you are on the page.'}
          </p>
        </div>

        {/* One group per source. The heading only appears once there is more
            than one — a lone "ACX" label over the only list on the page is a
            distinction without a difference, and the whole point of grouping is
            that a second listing can arrive without this markup changing. */}
        {groups.map((group) => (
          <div key={group.source.id} className="sample-group">
            {groups.length > 1 && (
              <div className="sample-group-head">
                <h3>{group.source.name}</h3>
                <p>{group.source.blurb}</p>
              </div>
            )}

            <SamplePlayer samples={group.samples} />

            {/* The link-out is deliberate and it is *not* the data source: a
                listing is where a producer can act on what they just heard, so
                it is the destination. A source without a `url` — samples cut
                for this site — simply renders no link. `rel="noopener"` because
                it opens a new tab, and a new tab because leaving the page
                mid-audition is the one thing this section must not cause. */}
            {group.source.url && (
              <p className="story-note">
                {isMystic
                  ? `The full listing lives on ${group.source.name}, where a producer can put a book in front of me.`
                  : `These are the short versions. The full profile and its samples live on ${group.source.name} — ${group.source.blurb}`}{' '}
                <a
                  href={group.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View the full {group.source.name} profile
                </a>
                .
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="story-section" id="narrator" data-reveal>
        <div className="story-split">
          <div className="story-split-copy">
            <p className="eyebrow">{isMystic ? 'The voice' : 'The narrator'}</p>
            <h2>
              {isMystic ? 'Whoever is speaking, it is me.' : 'Who is reading your book.'}
            </h2>

            {/* The professional credit, in the full form the ACX listing uses —
                the name a rights holder would put in the credits, which is not
                the familiar one the home page's About copy uses. */}
            <p className="story-credit">
              <strong>{PROFILE.name}</strong>
              <span className="story-credit-role">{PROFILE.title}</span>
            </p>

            {bio.map((para, i) => (
              // Index keys are safe here and only here: this is a fixed array
              // of prose from a constant, never reordered and never filtered.
              <p key={i} className="story-bio">
                {para}
              </p>
            ))}
          </div>

          <div className="story-split-aside">
            <dl className="story-credentials">
              {PROFILE.credentials.map((item) => (
                <div key={item.label} className="story-credential">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {SHOW_PROCESS && (
      <section className="story-section" id="process" data-reveal>
        <div className="section-head">
          <p className="eyebrow">How it goes</p>
          <h2>{isMystic ? 'The bargain.' : 'What working together looks like.'}</h2>
          <p className="section-sub">
            {isMystic
              ? 'Ask first, read second. Most of what goes wrong in a recording went wrong before anyone pressed record.'
              : 'The expensive mistakes in an audiobook are all made early, so this front-loads the asking.'}
          </p>
        </div>

        {/* An ordered list because the order is the content — these are steps,
            not features, and a screen reader should be told they are numbered. */}
        <ol className="story-process">
          {PROFILE.process.map((item) => (
            <li key={item.step} className="story-step">
              <p className="story-step-name">{item.step}</p>
              <p className="story-step-detail">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      )}

      <section className="cta-band" data-reveal>
        <div className="cta-band-inner">
          <div>
            <h2>
              {isMystic
                ? 'Send me the pages. I will tell you who I hear.'
                : 'Send a chapter and a note about your characters.'}
            </h2>
            {/* An ask, not a promise. An earlier draft committed to auditioning
                from the author's own text — a service guarantee the owner has
                not made anywhere, invented to make the band read better. */}
            <p>
              {isMystic
                ? 'No commitment in it. An audition is only a voice, offered, and either it is theirs or it is not.'
                : 'Tell me what the book is and how you hear the people in it, and we will find out together whether I am the right voice for it.'}
            </p>
          </div>
          <a className="btn btn-primary btn-lg" href={AUDITION_ENQUIRY}>
            Request an audition
          </a>
        </div>
      </section>

      <p className="story-back">
        <Link href="/">← Back to all three crafts</Link>
      </p>
    </main>
  )
}
