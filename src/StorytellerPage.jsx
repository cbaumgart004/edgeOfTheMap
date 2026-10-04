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
import { EditsPage, Region, E } from './edits.jsx'
import './Storyteller.css'


// A stable edit id from data that has no id of its own (a point, a label).
const slugOf = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

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
    <EditsPage page="storyteller">
    <main id="top" className="story">
      <Region id="hero" as="section" label="Hero" className="story-hero">
        <div className="story-hero-inner" data-eotm-wrap="">
          <E id="hero:eyebrow" as="p" rich className="eyebrow">
            <Rune name="ansuz" /> The Storyteller — Audio Narration
          </E>
          <E id={isMystic ? 'hero:title-lore' : 'hero:title'} as="h1">
            {isMystic
              ? 'Ink, until someone says it aloud.'
              : 'Your book, in your characters’ voices.'}
          </E>

          {/* The owner's own ACX tagline in the light face, unedited — it is his
              line about his own work. Mystic gets the Ansuz reading rather than
              a second attempt at the same sentence, because restating a good
              line in a grander register is how the Lore voice goes wrong. */}
          <E id={isMystic ? 'hero:sub-lore' : 'hero:sub'} as="p" className="hero-sub">
            {isMystic
              ? 'Ansuz is the god-rune of speech — the breath that turns a mark on a page into a thing that happened to someone. A book read aloud is not a copy of the book. It is the book, arriving a second way.'
              : PROFILE.tagline}
          </E>

          <E id="hero:actions" as="div" text={false} className="hero-actions">
            <E id="hero:actions:demo" as="a" place={false} className="btn btn-primary" href={BOOKING_ENQUIRY}>
              Request a demo
            </E>
            <E id="hero:actions:samples" as="a" place={false} className="btn btn-ghost" href="#samples">
              Hear the samples
            </E>
          </E>

          {/* Read from the Storyteller's own `points` rather than retyped. The
              first draft of this row invented four claims — ACX compliance, a
              delivery promise, a corrections policy — none of which the owner
              had made anywhere. These three are already shipped on the home
              page's card, so they are his, and pulling them from the table
              means the page and the card cannot come to disagree. */}
          <E id="hero:trust" as="ul" text={false} className="story-hero-trust">
            {STORYTELLER.points.map((point) => (
              <E key={point} id={`hero:trust:${slugOf(point)}`} as="li" place={false}>{point}</E>
            ))}
          </E>
        </div>
      </Region>

      {/* The evidence, and so the first section rather than a gallery at the
          bottom: a narrator who makes you read three paragraphs before you can
          hear anything has buried the only thing you came to check. */}
      <Region id="samples" as="section" domId="samples" label="Samples" className="story-section" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="samples:eyebrow" as="p" className="eyebrow">Samples</E>
          <E id={isMystic ? 'samples:title-lore' : 'samples:title'} as="h2">{isMystic ? 'Listen, then.' : 'Hear it before you ask.'}</E>
          <E id={isMystic ? 'samples:sub-lore' : 'samples:sub'} as="p" className="section-sub">
            {isMystic
              ? 'Four registers, and the same throat behind all of them. A voice is not one thing; it is what it does when the page asks it to change.'
              : 'Four registers, each a different job. Play them in any order — one at a time, wherever you are on the page.'}
          </E>
        </div>

        {/* One group per source. The heading only appears once there is more
            than one — a lone "ACX" label over the only list on the page is a
            distinction without a difference, and the whole point of grouping is
            that a second listing can arrive without this markup changing. */}
        {groups.map((group) => (
          <div key={group.source.id} className="sample-group" data-eotm-wrap="">
            {groups.length > 1 && (
              <E id={`samples:group:${group.source.id}`} as="div" text={false} className="sample-group-head">
                <E id={`samples:group:${group.source.id}:name`} as="h3" place={false}>{group.source.name}</E>
                <E id={`samples:group:${group.source.id}:blurb`} as="p" place={false}>{group.source.blurb}</E>
              </E>
            )}

            {/* The player is a widget, so it moves as one part; its titles,
                tags and notes are editable in place (SamplePlayer.jsx). */}
            <E id={`samples:player:${group.source.id}`} as={SamplePlayer} text={false} samples={group.samples} />

            {/* The link-out is deliberate and it is *not* the data source: a
                listing is where a producer can act on what they just heard, so
                it is the destination. A source without a `url` — samples cut
                for this site — simply renders no link. `rel="noopener"` because
                it opens a new tab, and a new tab because leaving the page
                mid-audition is the one thing this section must not cause. */}
            {group.source.url && (
              <E id={isMystic ? `samples:note-lore:${group.source.id}` : `samples:note:${group.source.id}`} as="p" rich className="story-note">
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
              </E>
            )}
          </div>
        ))}
      </Region>

      <Region id="narrator" as="section" domId="narrator" label="Narrator" className="story-section" data-reveal>
        <div className="story-split" data-eotm-wrap="">
          <div className="story-split-copy" data-eotm-wrap="">
            <E id={isMystic ? 'narrator:eyebrow-lore' : 'narrator:eyebrow'} as="p" className="eyebrow">{isMystic ? 'The voice' : 'The narrator'}</E>
            <E id={isMystic ? 'narrator:title-lore' : 'narrator:title'} as="h2">
              {isMystic ? 'Whoever is speaking, it is me.' : 'Who is reading your book.'}
            </E>

            {/* The professional credit, in the full form the ACX listing uses —
                the name a rights holder would put in the credits, which is not
                the familiar one the home page's About copy uses. */}
            <E id="narrator:credit" as="p" text={false} className="story-credit">
              <E id="narrator:credit:name" as="strong" place={false}>{PROFILE.name}</E>
              <E id="narrator:credit:role" as="span" place={false} className="story-credit-role">{PROFILE.title}</E>
            </E>

            {bio.map((para, i) => (
              // Index keys are safe here and only here: this is a fixed array
              // of prose from a constant, never reordered and never filtered.
              <E key={i} id={isMystic ? `narrator:bio-lore:${i}` : `narrator:bio:${i}`} as="p" className="story-bio">
                {para}
              </E>
            ))}
          </div>

          <div className="story-split-aside" data-eotm-wrap="">
            <E id="narrator:credentials" as="dl" text={false} className="story-credentials">
              {PROFILE.credentials.map((item) => (
                <div key={item.label} className="story-credential">
                  <E id={`narrator:credentials:${slugOf(item.label)}:label`} as="dt" place={false}>{item.label}</E>
                  <E id={`narrator:credentials:${slugOf(item.label)}:value`} as="dd" place={false}>{item.value}</E>
                </div>
              ))}
            </E>
          </div>
        </div>
      </Region>

      {SHOW_PROCESS && (
      <Region id="process" as="section" domId="process" label="Process" className="story-section" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="process:eyebrow" as="p" className="eyebrow">How it goes</E>
          <E id={isMystic ? 'process:title-lore' : 'process:title'} as="h2">{isMystic ? 'The bargain.' : 'What working together looks like.'}</E>
          <E id={isMystic ? 'process:sub-lore' : 'process:sub'} as="p" className="section-sub">
            {isMystic
              ? 'Ask first, read second. Most of what goes wrong in a recording went wrong before anyone pressed record.'
              : 'The expensive mistakes in an audiobook are all made early, so this front-loads the asking.'}
          </E>
        </div>

        {/* An ordered list because the order is the content — these are steps,
            not features, and a screen reader should be told they are numbered. */}
        <E id="process:steps" as="ol" text={false} className="story-process">
          {PROFILE.process.map((item) => (
            <li key={item.step} className="story-step">
              <E id={`process:steps:${slugOf(item.step)}:name`} as="p" place={false} className="story-step-name">{item.step}</E>
              <E id={`process:steps:${slugOf(item.step)}:detail`} as="p" place={false} className="story-step-detail">{item.detail}</E>
            </li>
          ))}
        </E>
      </Region>
      )}

      <Region id="cta" as="section" label="Closing ask" className="cta-band" data-reveal>
        <div className="cta-band-inner" data-eotm-wrap="">
          <div data-eotm-wrap="">
            <E id={isMystic ? 'cta:title-lore' : 'cta:title'} as="h2">
              {isMystic
                ? 'Send me the pages. I will tell you who I hear.'
                : 'Send a chapter and a note about your characters.'}
            </E>
            {/* An ask, not a promise. An earlier draft committed to auditioning
                from the author's own text — a service guarantee the owner has
                not made anywhere, invented to make the band read better. */}
            <E id={isMystic ? 'cta:body-lore' : 'cta:body'} as="p">
              {isMystic
                ? 'No commitment in it. An audition is only a voice, offered, and either it is theirs or it is not.'
                : 'Tell me what the book is and how you hear the people in it, and we will find out together whether I am the right voice for it.'}
            </E>
          </div>
          <E id="cta:button" as="a" className="btn btn-primary btn-lg" href={AUDITION_ENQUIRY}>
            Request an audition
          </E>
        </div>
      </Region>

      <Region id="back" as="p" label="Back link" className="story-back">
        <E id="back:link" as={Link} href="/">← Back to all three crafts</E>
      </Region>
    </main>
    </EditsPage>
  )
}
