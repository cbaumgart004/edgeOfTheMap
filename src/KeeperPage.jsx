// KeeperPage.jsx — /keeper
//
// The Web & Systems pitch. The home page's Keeper card is the one-line version;
// this is the argument behind it.
//
// The shape is borrowed deliberately from what hosted site-builders do, because
// visitors already know how to read it: value proposition, the differentiator,
// capabilities with something to look at, a layout gallery, a vertical page for
// one trade, proof, and a closing ask. What is *not* borrowed is the grammar —
// no gradient hero, no floating drop-shadow cards. DESIGN.md §5 threw those out
// on purpose, and a comparison table set in ruled printed matter is more at home
// on this face than it would be on theirs.
//
// Every field that carries voice comes in pairs — `blurb` / `loreBlurb`, the
// same convention as PATHS — because both faces render this page and letting
// mystic copy through to daylight is the leak DESIGN.md §5 warns about. Fields
// that are *inventory* rather than voice (the API sample, the layout names, the
// ownership table) stay single: they read straight in either face.

import React, { useEffect, useRef, useState } from 'react'
import Rune from './Rune.jsx'
import { Link } from './router.jsx'
import ApiConsole from './ApiConsole.jsx'
import StudioDemo from './StudioDemo.jsx'
import { CONTACT_EMAIL, SITE_HOST, SITE_URL, mailto } from './content.js'
import { EditsPage, Region, E } from './edits.jsx'
import './Keeper.css'

// A stable edit id from data that carries no id of its own (a name or title).
const slug = (s) =>
  s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// The two shipped projects the page argues *from*. Both owners have given their
// yes to being named — and both gave it with the same caveat, which shapes how
// they are used here: each is proud of having a site that looks like **theirs**,
// and neither wants to become a look other people can order.
//
// So they appear as evidence woven into the claims they prove, never as items in
// a gallery, and the layouts section says outright that structure is what gets
// reused and appearance never is. If a future edit turns either of these into a
// "start from this design" tile, it has broken a promise made to a real person.
//
// TODO(confirm): the live URLs. `href` is optional — a project renders as a
// plain name until one is supplied, so this ships honest rather than broken.
const WORK = {
  spiritSeeds: { name: 'Live Spirit Seeds', href: null },
  storyShaped: { name: 'StoryShaped Studios', href: null },
}

function Work({ of }) {
  const project = WORK[of]
  return project.href ? (
    <a href={project.href}>{project.name}</a>
  ) : (
    <strong>{project.name}</strong>
  )
}

const PROJECT_ENQUIRY = mailto('Project enquiry — Web & Systems')
const LAYOUT_ENQUIRY = mailto('Layout enquiry — Web & Systems')
const HEALING_ENQUIRY = mailto('Enquiry — a site for a healing practice')

// The wedge, and the reason this page exists. Stated as a comparison because
// that is the only format in which "you own your data" means anything concrete:
// on its own it is a claim every host makes.
//
// **The right-hand column names no competitor, and must not start to.** It
// describes the common shape of hosted page-builders, which is defensible;
// naming a company turns each row into a factual claim about a product that can
// change its terms next quarter, and leaves the page stating something false
// with nobody watching for it.
const OWNERSHIP = [
  {
    label: 'Your content',
    here: 'Plain records in a database whose schema you have been shown, and can be handed.',
    elsewhere: 'Rows in a private schema you cannot query or inspect.',
  },
  {
    label: 'Getting it out',
    here: 'A full export on demand, in a format that reads without their software.',
    elsewhere: 'A partial CSV, if the plan includes one.',
  },
  {
    label: 'The API',
    here: 'A documented REST API over your own content. Part of the build, not a tier.',
    elsewhere: 'A paid add-on, tightly rate-limited, or simply absent.',
  },
  {
    label: 'Editing',
    here: 'Change the page on the page. What you see is the site, live.',
    elsewhere: 'A separate admin panel that approximates the result.',
  },
  {
    label: 'Where it runs',
    here: 'My hosting or yours. The site is portable either way, and moving it is a normal afternoon.',
    elsewhere: 'Their servers, their terms, their next price rise.',
  },
  {
    label: 'Leaving',
    here: 'Take the export and the source. Nothing here is designed to hold you.',
    elsewhere: 'The content might come with you. The site will not.',
  },
]

// Starting points, not finished sites: a layout is the structure and the
// furniture, and the branding pass is what makes it yours. Named in the
// brand's own register — the crafts are The Keeper, The Storyteller and The
// Wright, so the layouts are "The" nouns too.
//
// No runes here. `Rune` can draw exactly four glyphs and renders *nothing* for
// a name it does not know, with no error to notice (DESIGN.md §4), so a table
// of six decorative runes would be five silent blanks waiting to happen.
const LAYOUTS = [
  {
    name: 'The Practice',
    suits: 'Massage, bodywork, acupuncture, therapy',
    note: 'A service menu with real durations, booking that takes one screen, and intake that lands in your own records.',
  },
  {
    name: 'The Stall',
    suits: 'Multi-vendor marketplaces',
    note: 'Seller accounts, listings, orders and payouts — every vendor with a page of their own under your roof.',
  },
  {
    name: 'The Shopfront',
    suits: 'A single seller with a catalogue',
    note: 'Products, variants, stock and checkout, without the monthly platform tax on every sale.',
  },
  {
    name: 'The Studio',
    suits: 'Portfolios and commissioned work',
    note: 'Galleries that respect the images, case studies with room to explain, and an enquiry form that filters.',
  },
  {
    name: 'The Ledger',
    suits: 'Trades and appointment-led services',
    note: 'Scheduling, quotes, invoices and reminders — the admin half of the business, on the same system as the front.',
  },
  {
    name: 'The Broadsheet',
    suits: 'Writing, teaching, publishing',
    note: 'Essays, an archive that stays navigable past fifty posts, and a mailing list you own the addresses to.',
  },
]

// What a healing-space site has to get right, which is mostly a list of things
// the generic small-business template gets wrong.
const HEALING = [
  {
    title: 'A menu, not a shop',
    body: 'Durations, what the session actually involves, and what to expect the first time. Bodywork is bought on trust and specifics, not on an “Add to cart”.',
  },
  {
    title: 'Booking in one screen',
    body: 'Pick a time, confirm, done — with your cancellation window and deposit rules enforced, because they are yours and not a platform default.',
  },
  {
    title: 'Intake that stays yours',
    body: 'Health history and consent land in your database, not in a form vendor’s inbox. That is the first question anyone asks about records like these, and it should have a straight answer.',
  },
  {
    title: 'Quiet by design',
    body: 'No countdown timers, no urgency banners, no chat bubble ambushing the page. The room is calm; the site should not undo that before they arrive.',
  },
  {
    title: 'Gift certificates that work',
    body: 'Issued, redeemed and tracked against a real balance — the single most requested thing on a practice site and the one most templates fake.',
  },
  {
    title: 'Found by the right people',
    body: 'Modalities, area and availability marked up so search engines and maps show the practice properly, without buying an SEO add-on.',
  },
]

const CAPABILITIES = [
  {
    id: 'marketplaces',
    title: 'Marketplace builds',
    blurb:
      'More than one seller under one roof: accounts, listings, orders, commission splits and payouts. The hard parts are the money and the permissions, and they are the parts a template cannot give you.',
    loreBlurb:
      'A market is a hundred people agreeing to trust the same table. And someone has to build the table, and rule who may set out goods on it, and count what changes hands. That is not decoration. That is the whole of it.',
  },
  // Branding is not in this grid: it earned a section of its own once there was
  // shipped work to point at. A cell here as well would be the same claim twice.
  {
    // Not `hosting` — that id belongs to the "Currently hosting" section below,
    // and two nodes with one id means every anchor to it resolves to whichever
    // comes first in the document, silently.
    id: 'keeping',
    title: 'Hosting and keeping',
    blurb:
      'Certificates, backups, dependency updates and uptime. It runs on my infrastructure or on yours — and either way you get told when something breaks, rather than finding out from a customer.',
    loreBlurb:
      'The keeping is the unglamorous half and the half that matters. Nothing stays standing by having been built well once. Someone has to come back, and check, and mend, and come back again.',
  },
  {
    id: 'migrations',
    title: 'Getting out of somewhere',
    blurb:
      'Moving off a page-builder or a host that has stopped serving you: content extracted, URLs preserved so the search results survive, and redirects for the ones that cannot be.',
    loreBlurb:
      'Leaving is the part they design against. But everything can be carried if you are willing to go through it a row at a time, and I am willing to go through it a row at a time.',
  },
]

// **Off until the entries are real.** One placeholder card is worse than no
// section: a proof section that proves nothing costs more credibility than the
// gap does. Flip this to `true` once HOSTED below is filled in — the section and
// its markup stay wired up, so it is one line, not a rebuild.
const SHOW_HOSTED = false

// TODO(confirm): the real list. Two nameable sites, per the owner — replace the
// placeholders and, for anything that is a client's, get their say-so before it
// ships. A live link is also a live liability: if they redesign off you, this
// section starts advertising someone else's work.
//
// `href` is optional on purpose — a site can be named and described without
// being linked, which is often what a client will agree to.
const HOSTED = [
  {
    name: 'Edge of the Map',
    href: SITE_URL,
    label: SITE_HOST,
    note: 'This one. Built, branded and hosted here — including the part where the whole page burns away.',
  },
  {
    name: 'TODO — first site',
    note: 'TODO(confirm): what it is, who it is for, and what it does that a template would not have.',
  },
  {
    name: 'TODO — second site',
    note: 'TODO(confirm): as above. Drop this entry rather than pad it if there is only one.',
  },
]


/** The live-editing claim, demonstrated instead of described.
 *
 *  The two fields below are genuinely editable — this is the interaction the
 *  section is selling, and a screenshot of it would be a worse argument than
 *  three seconds of typing in it.
 *
 *  **Uncontrolled on purpose.** The text children are constant strings, so
 *  React never writes to these nodes after mount and the visitor's typing
 *  survives every re-render, including the mode toggle. Wiring them to state
 *  would fight the caret on every keystroke for no gain — nothing here is
 *  persisted and nothing else reads it. */
function LiveEditDemo() {
  const [status, setStatus] = useState('idle')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleInput = () => {
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('saved'), 600)
  }

  return (
    <div className="edit-demo">
      <div className="edit-demo-bar">
        <span className="edit-demo-dot" aria-hidden="true" />
        <span className="edit-demo-title">Your page — editing</span>
        <span className={`edit-demo-status is-${status}`} role="status">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Click the text'}
        </span>
      </div>

      <div className="edit-demo-body">
        <h3
          className="edit-demo-field"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Demo heading — editable"
          onInput={handleInput}
        >
          Stillwater Massage
        </h3>
        <p
          className="edit-demo-field"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Demo paragraph — editable"
          onInput={handleInput}
        >
          Ninety minutes of deep tissue work, in a quiet room, by appointment.
        </p>
      </div>
    </div>
  )
}

export default function KeeperPage({ isMystic }) {
  return (
    <EditsPage page="keeper">
    <main id="top" className="keeper">
      <Region id="hero" as="section" label="Hero" className="keeper-hero">
        <div className="keeper-hero-inner" data-eotm-wrap="">
          <E id="hero:eyebrow" as="p" rich className="eyebrow">
            <Rune name="othala" /> The Keeper — Web &amp; Systems
          </E>
          {isMystic ? (
            <E id="hero:title-lore" as="h1">The homestead you keep.</E>
          ) : (
            <E id="hero:title" as="h1">Websites you own outright.</E>
          )}
          {isMystic ? (
            <E id="hero:sub-lore" as="p" className="hero-sub">
              Othala is the inherited ground — the thing that is yours because someone kept it, and stays yours because you do. A system is the same bargain. I build ground you can stand on and hand to somebody else.
            </E>
          ) : (
            <E id="hero:sub" as="p" className="hero-sub">
              Built, branded and hosted by one person. Your content stays yours, there is a real API underneath it, and you can edit the live page yourself without going through me.
            </E>
          )}

          <E id="hero:actions" as="div" text={false} className="hero-actions">
            <E id="hero:actions:start" as="a" place={false} className="btn btn-primary" href={PROJECT_ENQUIRY}>
              Start a project
            </E>
            <E id="hero:actions:layouts" as="a" place={false} className="btn btn-ghost" href="#layouts">
              See the layouts
            </E>
          </E>

          <E id="hero:trust" as="ul" text={false} className="keeper-hero-trust">
            <E id="hero:trust:data" as="li" place={false}>Your data, exportable</E>
            <E id="hero:trust:api" as="li" place={false}>Documented API</E>
            <E id="hero:trust:edit" as="li" place={false}>Edit it yourself</E>
            <E id="hero:trust:hosted" as="li" place={false}>Hosted and kept</E>
          </E>
        </div>
      </Region>

      <Region id="ownership" as="section" label="Ownership" className="keeper-section" domId="ownership" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="ownership:eyebrow" as="p" className="eyebrow">Ownership</E>
          <E id="ownership:title" as="h2">Your data is your own.</E>
          <E id="ownership:sub" as="p" className="section-sub">
            Every host says this. Here is the version with specifics, which is
            the only version that means anything.
          </E>
        </div>

        {/* A table, and deliberately a real one: this is tabular data, and a
            grid of divs would read the same to a sighted visitor and as noise
            to a screen reader. The mobile layout is handled in CSS by turning
            each row into a stacked block — the markup does not change. */}
        <E id="ownership:table" as="div" text={false} className="compare-wrap">
          <table className="compare">
            <caption className="visually-hidden">
              How a build here compares with a hosted page-builder
            </caption>
            <thead>
              <tr>
                <th scope="col">&nbsp;</th>
                <E id="ownership:table:here" as="th" place={false} scope="col">Built here</E>
                <E id="ownership:table:else" as="th" place={false} scope="col">Typical hosted builder</E>
              </tr>
            </thead>
            <tbody>
              {OWNERSHIP.map((row) => (
                <tr key={row.label}>
                  <E id={`ownership:table:${slug(row.label)}:label`} as="th" place={false} scope="row">{row.label}</E>
                  {/* data-label is what the stacked mobile layout prints above
                      each cell — with the thead hidden, the cells would
                      otherwise be two unlabelled paragraphs. */}
                  <E id={`ownership:table:${slug(row.label)}:here`} as="td" place={false} className="compare-here" data-label="Built here">
                    {row.here}
                  </E>
                  <E id={`ownership:table:${slug(row.label)}:else`} as="td" place={false} className="compare-else" data-label="Typical hosted builder">
                    {row.elsewhere}
                  </E>
                </tr>
              ))}
            </tbody>
          </table>
        </E>

        {isMystic ? (
          <E id="ownership:note-lore" as="p" className="keeper-note">
            A thing you cannot carry out is not a thing you own. It is a thing you are being allowed to hold.
          </E>
        ) : (
          <E id="ownership:note" as="p" className="keeper-note">
            The test is simple: if you and I stopped working together tomorrow, could you walk away with everything and stand it up somewhere else? The answer here is yes, and I will show you how before you ask.
          </E>
        )}
      </Region>

      <Region id="editing" as="section" label="Real-time editing" className="keeper-section" domId="editing" data-reveal>
        <div className="keeper-split" data-eotm-wrap="">
          <div className="keeper-split-copy" data-eotm-wrap="">
            <E id="editing:eyebrow" as="p" className="eyebrow">Real-time editing</E>
            <E id="editing:title" as="h2">Change the page on the page.</E>
            {isMystic ? (
              <E id="editing:sub-lore" as="p" className="section-sub">
                The word and the thing it names, in the same place at the same moment. No incantation typed into one window to alter another.
              </E>
            ) : (
              <E id="editing:sub" as="p" className="section-sub">
                Sign in and the site becomes editable in place. Click a heading and type. Prices, hours, a paragraph that went out of date — you change what you can see, and it is live when you stop typing.
              </E>
            )}
            <E id="editing:list" as="ul" text={false} className="keeper-list">
              <E id="editing:list:panel" as="li" place={false}>No separate admin panel to learn or keep in sync</E>
              <E id="editing:list:size" as="li" place={false}>What you are editing is the page itself, at its real size</E>
              <E id="editing:list:history" as="li" place={false}>Revision history, so a bad edit is undone rather than retyped</E>
              <E id="editing:list:roles" as="li" place={false}>Roles, so a receptionist can change hours but not pricing</E>
            </E>
            <E id="editing:aside" as="p" rich className="keeper-aside">
              Try it — the panel is real. Nothing is saved; it is a
              demonstration. On <Work of="spiritSeeds" /> the same idea goes
              further: every page is a content file the owner edits herself, so
              adding a page to that site is not a job she has to send me.
            </E>
          </div>

          <E id="editing:demo" as="div" text={false} className="keeper-split-visual">
            <LiveEditDemo />
          </E>
        </div>
      </Region>

      <Region id="api" as="section" label="API access" className="keeper-section" domId="api" data-reveal>
        <div className="keeper-split is-reversed" data-eotm-wrap="">
          <div className="keeper-split-copy" data-eotm-wrap="">
            <E id="api:eyebrow" as="p" className="eyebrow">API access</E>
            <E id="api:title" as="h2">A real API, documented, included.</E>
            {isMystic ? (
              <E id="api:sub-lore" as="p" className="section-sub">
                A door in the side of the thing, with a key that is yours, because one day you will want in and I may not be reachable.
              </E>
            ) : (
              <E id="api:sub" as="p" className="section-sub">
                Everything the site stores is reachable over HTTP with a token you hold. Pull your bookings into a spreadsheet, push products from your own system, wire it to whatever you already use.
              </E>
            )}
            <E id="api:list" as="ul" text={false} className="keeper-list">
              <E id="api:list:rest" as="li" place={false}>REST over JSON, with cursor pagination and honest error codes</E>
              <E id="api:list:tokens" as="li" place={false}>Tokens you issue and revoke yourself, scoped per integration</E>
              <E id="api:list:webhooks" as="li" place={false}>Webhooks out, so other systems hear about changes as they happen</E>
              <E id="api:list:docs" as="li" place={false}>Written docs for your data, not a generic schema dump</E>
            </E>
            {/* The StoryShaped citation is pulled for now — its inventory API
                has no auth on the admin routes yet, so pointing at it as the
                production proof invites a look nobody wants taken. The claim
                stands on the console beside it, which is real code. Put the
                sentence back once that endpoint is gated. */}
            <E id="api:aside" as="p" className="keeper-aside">
              The panel is live — every response is computed when you press the
              button, not written out in advance. The write really does change
              the data, so press it twice.
            </E>
          </div>

          <E id="api:console" as="div" text={false} className="keeper-split-visual">
            <ApiConsole />
          </E>
        </div>
      </Region>

      <Region id="layouts" as="section" label="Layouts" className="keeper-section" domId="layouts" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="layouts:eyebrow" as="p" className="eyebrow">Layouts</E>
          <E id="layouts:title" as="h2">Structure to start from. Never a look to share.</E>
          {isMystic ? (
            <E id="layouts:sub-lore" as="p" className="section-sub">
              Bones are bones. Every creature that ever walked had four limbs and a spine and not one of them was mistaken for another. What is shared is the frame. What is yours is everything laid over it.
            </E>
          ) : (
            <E id="layouts:sub" as="p" className="section-sub">
              A layout is the skeleton — what the site has to keep track of, what a visitor can do, and in what order. It is not the appearance. The appearance is made for you, once, and it is the part I will not reuse.
            </E>
          )}
        </div>

        {/* The promise this section exists to make, and it is a promise to real
            people: both owners named on this page said yes on the condition
            that their site does not become a look someone else can order. */}
        <E id="layouts:pledge" as="p" rich className="keeper-pledge">
          Two of the sites behind this page — a bodywork practice and a uranium
          glass marketplace — share a builder and nothing else. Not a palette,
          not a typeface, not a grid. Their owners are proud of having a site
          that looks like <em>theirs</em>, and that is the whole job. You are
          buying the structure below and a look that stops with you.
        </E>

        <E id="layouts:grid" as="div" text={false} className="layout-grid">
          {LAYOUTS.map((layout, i) => (
            /* `card` as well as `layout-card`: these are the same object as the
               home page's filing cards — same keyline, same hover, same
               wholesale removal of the affordance in mystic — so they reuse
               that class rather than restating it and drifting from it. */
            <E
              key={layout.name}
              id={`layouts:grid:${slug(layout.name)}`}
              as="article"
              text={false}
              place={false}
              className="card layout-card"
              data-reveal
              style={{ '--reveal-index': i }}
            >
              <E id={`layouts:grid:${slug(layout.name)}:name`} as="h3" place={false}>{layout.name}</E>
              <E id={`layouts:grid:${slug(layout.name)}:suits`} as="p" place={false} className="layout-suits">{layout.suits}</E>
              <E id={`layouts:grid:${slug(layout.name)}:note`} as="p" place={false} className="layout-note">{layout.note}</E>
            </E>
          ))}
        </E>

        <E id="layouts:note" as="p" rich className="keeper-note">
          Not sure which fits?{' '}
          <a href={LAYOUT_ENQUIRY}>Describe the business</a> and I will tell you
          which one I would start from, and what I would change about it.
        </E>
      </Region>

      <Region id="studio" as="section" label="Try it" className="keeper-section" domId="studio" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="studio:eyebrow" as="p" className="eyebrow">Try it</E>
          <E id="studio:title" as="h2">Structure, type and colour — three separate choices.</E>
          {isMystic ? (
            <E id="studio:sub-lore" as="p" className="section-sub">
              The same words, three times, and three different pages. Turn the dials and watch one assemble itself. It is not a picture of a page. It is a page, deciding what it is.
            </E>
          ) : (
            <E id="studio:sub" as="p" className="section-sub">
              This is the chooser, working. One practice, one set of words, three structures — and the structures move the furniture, not just the paint: where the picture goes, whether there is one, how the nav sits, how the services line up. Set a face per level of type and take the colour anywhere. Nothing here is a screenshot.
            </E>
          )}
        </div>

        {/* StudioDemo takes no props, so it moves as one part inside a plain
            block of its own; in flow that box renders exactly as before. */}
        <E id="studio:demo" as="div" text={false}>
          <StudioDemo />
        </E>

        <E id="studio:note" as="p" className="keeper-note">
          Three structures here; a real build starts from one and then stops
          being a structure. What you cannot do in this panel — and what most of
          the work actually is — is everything after: your photography, your
          words, the shape your business needs that no skeleton anticipated.
        </E>
      </Region>

      <Region id="branding" as="section" label="Branding" className="keeper-section" domId="branding-range" data-reveal>
        <div className="keeper-split" data-eotm-wrap="">
          <div className="keeper-split-copy" data-eotm-wrap="">
            <E id="branding:eyebrow" as="p" className="eyebrow">Branding</E>
            <E id="branding:title" as="h2">A look that belongs to one business.</E>
            {isMystic ? (
              <E id="branding:sub-lore" as="p" className="section-sub">
                A name is a small spell, and a mark is the same trick done with ink. It should fit the one who carries it and no one else, or it is not a mark, only a label.
              </E>
            ) : (
              <E id="branding:sub" as="p" className="section-sub">
                A wordmark, a palette that survives a screen and a printed card, and type that is chosen rather than defaulted. If you already have a brand, the build matches it. If you do not, this is where it starts.
              </E>
            )}
            <E id="branding:list" as="ul" text={false} className="keeper-list">
              <E id="branding:list:seasons" as="li" rich place={false}>
                On <Work of="spiritSeeds" />: four seasonal palettes crossed with
                four distinct looks, switchable by the owner, with a preview mode
                for trying one against live content before publishing it
              </E>
              <E id="branding:list:tagline" as="li" rich place={false}>
                Her tagline artwork arrived as a 26 MB export with the lettering
                flattened to outlines. It ships as three separate layers under
                150 KB, with the lettering as real paths that take the page&rsquo;s
                own colour — so it re-tints with every season instead of being a
                picture of one
              </E>
              <E id="branding:list:uv" as="li" rich place={false}>
                On <Work of="storyShaped" />: a daylight and blacklight mode,
                because the glass itself only does its trick under UV. The site
                does what the product does
              </E>
            </E>
          </div>

          <E id="branding:quote" as="div" text={false} className="keeper-split-visual">
            <div className="keeper-quote">
              <E id="branding:quote:text" as="p" place={false}>
                Neither of those two ideas would transplant. A season switcher
                would be noise on a glass shop, and a UV mode would be strange in
                a treatment room. That is the argument for building the look
                rather than picking it.
              </E>
            </div>
          </E>
        </div>
      </Region>

      <Region id="healing" as="section" label="Healing spaces" className="keeper-section keeper-vertical" domId="healing" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="healing:eyebrow" as="p" className="eyebrow">Built for healing spaces</E>
          <E id="healing:title" as="h2">Massage, bodywork, and the quiet trades.</E>
          {isMystic ? (
            <E id="healing:sub-lore" as="p" className="section-sub">
              These are rooms where people put themselves in someone else’s hands for an hour. The page in front of that hour should be as careful as the room is.
            </E>
          ) : (
            <E id="healing:sub" as="p" className="section-sub">
              A practice does not need the same site as a restaurant, and it very much does not need the same site as a startup. This is the layout I have thought hardest about, because I have built it — Live Spirit Seeds is a working bodywork practice, and everything below is a thing that came up while making it.
            </E>
          )}
        </div>

        <E id="healing:grid" as="div" text={false} className="healing-grid">
          {HEALING.map((item, i) => (
            <E
              key={item.title}
              id={`healing:grid:${slug(item.title)}`}
              as="article"
              text={false}
              place={false}
              className="healing-item"
              data-reveal
              style={{ '--reveal-index': i }}
            >
              <E id={`healing:grid:${slug(item.title)}:title`} as="h3" place={false}>{item.title}</E>
              <E id={`healing:grid:${slug(item.title)}:body`} as="p" place={false}>{item.body}</E>
            </E>
          ))}
        </E>

        <E id="healing:callout" as="div" text={false} className="keeper-callout">
          <E id="healing:callout:text" as="p" rich place={false}>
            <strong>On records and compliance:</strong> intake answers living in
            your own database rather than a third party&rsquo;s is the
            structural half of the problem, and it is the half I can solve in
            the build. Whether your practice needs more than that depends on
            your jurisdiction and what you record — bring it up early and we
            will scope it honestly rather than putting a badge on the footer.
          </E>
          <E id="healing:callout:cta" as="a" place={false} className="btn btn-primary" href={HEALING_ENQUIRY}>
            Talk about a practice site
          </E>
        </E>
      </Region>

      <Region id="capabilities" as="section" label="Also" className="keeper-section" domId="capabilities" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="capabilities:eyebrow" as="p" className="eyebrow">Also</E>
          <E id="capabilities:title" as="h2">The rest of what this covers.</E>
        </div>

        <E id="capabilities:cards" as="div" text={false} className="cards">
          {CAPABILITIES.map((cap, i) => (
            <E
              key={cap.id}
              id={`capabilities:cards:${cap.id}`}
              as="article"
              domId={cap.id}
              text={false}
              place={false}
              className="card"
              data-reveal
              style={{ '--reveal-index': i }}
            >
              <E id={`capabilities:cards:${cap.id}:title`} as="h3" place={false}>{cap.title}</E>
              {isMystic ? (
                <E id={`capabilities:cards:${cap.id}:blurb-lore`} as="p" place={false} className="card-blurb">
                  {cap.loreBlurb}
                </E>
              ) : (
                <E id={`capabilities:cards:${cap.id}:blurb`} as="p" place={false} className="card-blurb">
                  {cap.blurb}
                </E>
              )}
            </E>
          ))}
        </E>
      </Region>

      {SHOW_HOSTED && (
      <Region id="hosting" as="section" label="Currently hosting" className="keeper-section" domId="hosting" data-reveal>
        <div className="section-head" data-eotm-wrap="">
          <E id="hosting:eyebrow" as="p" className="eyebrow">Currently hosting</E>
          <E id="hosting:title" as="h2">Sites running on this, right now.</E>
          <E id="hosting:sub" as="p" className="section-sub">
            A short list rather than a long one. Every site here is one I built,
            brand and all, and still keep running.
          </E>
        </div>

        <E id="hosting:list" as="ul" text={false} className="hosted-list">
          {HOSTED.map((site, i) => (
            <E
              key={site.name}
              id={`hosting:list:${slug(site.name)}`}
              as="li"
              text={false}
              place={false}
              className="hosted-item"
              data-reveal
              style={{ '--reveal-index': i }}
            >
              <E id={`hosting:list:${slug(site.name)}:name`} as="h3" place={false}>{site.name}</E>
              <E id={`hosting:list:${slug(site.name)}:note`} as="p" place={false}>{site.note}</E>
              {site.href && (
                <E id={`hosting:list:${slug(site.name)}:link`} as="a" rich place={false} className="hosted-link" href={site.href}>
                  {site.label ?? site.href}
                  <span aria-hidden="true">→</span>
                </E>
              )}
            </E>
          ))}
        </E>
      </Region>
      )}

      <Region id="cta" as="section" label="Closing ask" className="cta-band" data-reveal>
        <div className="cta-band-inner" data-eotm-wrap="">
          <div data-eotm-wrap="">
            {isMystic ? (
              <E id="cta:title-lore" as="h2">Ground to stand on.</E>
            ) : (
              <E id="cta:title" as="h2">Tell me what you need built.</E>
            )}
            {isMystic ? (
              <E id="cta:sub-lore" as="p">
                Say what it must do, and who inherits it, and we will begin there.
              </E>
            ) : (
              <E id="cta:sub" as="p">
                What the business does, what the site has to handle, and roughly when. No pricing pages here — the number depends on the work, and I would rather quote the real thing.
              </E>
            )}
          </div>
          <E id="cta:button" as="a" className="btn btn-primary btn-lg" href={PROJECT_ENQUIRY}>
            {CONTACT_EMAIL}
          </E>
        </div>
      </Region>

      <Region id="back" as="p" label="Back link" className="keeper-back">
        <E id="back:link" as={Link} href="/">← Back to all three crafts</E>
      </Region>
    </main>
    </EditsPage>
  )
}
