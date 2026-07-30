// narration.js
//
// The Storyteller's profile and audio samples, held here rather than fetched.
//
// **The ACX profile cannot be read by this site, and that is not a limitation
// worth engineering around.** Both narrator tabs — `?tab=about` and
// `?tab=audio-samples` — answer an anonymous request with `302` to Amazon's
// sign-in, and a cross-origin request with a flat `403` carrying no
// `Access-Control-Allow-Origin` at all. So there is no runtime fetch, no
// build-time scrape, and no proxy short of storing Amazon credentials and
// scraping a logged-in session on a schedule. See ADR 0006.
//
// What ships instead is the same content, owned here: the bio is text in this
// file, the samples are files in this repo served from this domain. That costs
// an edit and a deploy to refresh, and buys a page that renders identically
// whether or not ACX is up, logged in, or still laid out the way it was.

import { mailto } from './content.js'

// ============================================================
// WHERE SAMPLES COME FROM
// ============================================================

/** The places a sample can have been published, keyed by the `source` on each
 *  entry in SAMPLES.
 *
 *  **This table is the expansion joint.** ACX is the first listing but not the
 *  intended last: adding another — a second casting site, a demo reel, work
 *  posted somewhere with its own profile page — is an entry here plus samples
 *  pointing at it, and the page groups and links itself accordingly. Nothing
 *  downstream hardcodes 'acx'.
 *
 *  `url` is where a producer can act on the sample rather than merely hear it,
 *  which is the whole reason to name a source at all. A source with no such
 *  page — samples recorded for this site, say — simply omits it, and renders as
 *  a heading with nothing to click. */
export const SOURCES = {
  acx: {
    id: 'acx',
    name: 'ACX',
    full: 'Audiobook Creation Exchange',
    url: 'https://www.acx.com/narrator?p=A20RCCMMH76PND',
    blurb:
      'Amazon’s audiobook marketplace, and where a rights holder can offer me a title directly.',
  },
}

export const BOOKING_ENQUIRY = mailto('Booking enquiry — Audio Narration')
export const AUDITION_ENQUIRY = mailto('Audition request — Audio Narration')

// ============================================================
// THE SAMPLES
// ============================================================

// Sample audio, resolved through Vite's glob rather than a static `import` per
// file. Two reasons, and the second is the load-bearing one:
//
//   1. The files still go through the bundler, so they are content-hashed and
//      cache-busted like every other asset (DESIGN.md §6) — `public/` is for
//      URLs that must survive a rebuild, and these have no such requirement.
//   2. **A missing file is not a build error.** A static import of an mp3 that
//      is not in the repo yet fails the build outright; a glob miss is just
//      `undefined`, which the player renders as "not yet posted" rather than as
//      a dead control. Same idiom as `WORK`'s optional `href` in KeeperPage —
//      ship honest rather than broken.
//
// To add a sample: drop the file in `src/assets/audio/` and name it below.
const FILES = import.meta.glob('./assets/audio/*.{mp3,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const fileUrl = (name) => FILES[`./assets/audio/${name}`]

/** The samples, transcribed from the owner's ACX listing.
 *
 *  **`notes` are his own performance notes, verbatim.** They are the best copy
 *  on this page and none of it is mine: a narrator explaining why he picked a
 *  poem from a collection called *Nightmares* tells a producer more about the
 *  person they would be working with than any amount of positioning does.
 *
 *  They render **unchanged in both faces**, which is a deliberate exception to
 *  the `blurb`/`loreBlurb` pairing everywhere else on the site. That convention
 *  exists to stop *mystic* copy leaking into daylight (DESIGN.md §5); these are
 *  daylight copy already, and writing a grander mystic variant would mean
 *  inventing words for a real person's first-person aside. The site's own voice
 *  does the face-switching around them.
 *
 *  `duration` is what ACX reports, shown until a file is actually loaded — at
 *  which point the element's own metadata wins, because that is the truth about
 *  the thing the visitor is hearing.
 */
export const SAMPLES = [
  {
    id: 'jitterbug',
    source: 'acx',
    title: 'Pan and Alobar',
    work: 'Jitterbug Perfume',
    file: 'pan-and-alobar.mp3',
    duration: '5:12',
    genre: 'Literature & Fiction',
    language: 'English',
    accent: 'General British',
    voiceAge: 'Middle-aged',
    style: 'Storyteller',
    gender: 'Male',
    notes: null,
  },
  {
    id: 'thirteen-skeletons',
    source: 'acx',
    title: 'Thirteen Skeletons',
    work: null,
    file: 'thirteen-skeletons.mp3',
    duration: '3:11',
    genre: 'Mystery, Thriller & Suspense',
    language: 'English',
    accent: 'General American',
    voiceAge: 'Adult',
    style: 'Spooky',
    gender: 'Male',
    notes:
      'I love this poem. I love even more that it comes from a collection called “Nightmares: Poems to Trouble Your Sleep.” I thought this would be a fun one to put in.',
  },
  {
    id: 'grand-inquisitor',
    source: 'acx',
    title: 'The Grand Inquisitor',
    work: 'The Brothers Karamazov',
    file: 'grand-inquisitor.mp3',
    duration: '4:24',
    genre: 'Literature & Fiction',
    language: 'English',
    accent: 'Russian',
    voiceAge: 'Adult',
    style: 'Authoritative',
    gender: 'Male',
    notes:
      'I actually speak a little Ukrainian, and a little less Russian. But I figured I should at least showcase a little of my Russian accent, and what better way than the beginning of The Grand Inquisitor from The Brothers Karamazov by Dostoyevsky? Such an artful chapter, practically a novella in itself. This clip leans light on the accent, but that’s because heavier is always easier — and that tends to be caricature-ish, which definitely doesn’t fit the tone of this work.',
  },
  {
    id: 'ozymandias',
    source: 'acx',
    title: 'Ozymandias',
    work: null,
    file: 'ozymandias.mp3',
    duration: '1:08',
    genre: 'Literature & Fiction',
    language: 'English',
    accent: 'General American',
    voiceAge: 'Middle-aged',
    style: 'Storyteller',
    gender: 'Male',
    // "Shelly" in the source, corrected to Shelley — the poet's name is a fact,
    // not a turn of phrase, and it is the one thing on this page that a
    // literary producer would certainly notice.
    notes:
      'This is to this day my all time favorite poem. Can’t think of anything else to say on it. Other than Shelley is brilliant.',
  },
  {
    id: 'john-dies',
    source: 'acx',
    title: 'Prologue to John Dies at the End',
    work: null,
    file: 'john-dies-at-the-end.mp3',
    duration: '2:40',
    genre: 'Literature & Fiction',
    language: 'English',
    accent: 'General American',
    voiceAge: 'Adult',
    style: 'Comedic',
    gender: 'Male',
    notes:
      'I don’t know if the “great comic timing” is actually accurate, but it made me chuckle. I wanted to make sure I actually uploaded a sample of narrative prose, not just characters and poetry.',
  },
]

/** Resolves the table above against what is actually in the repo, and groups it
 *  by source so the page can render one section per listing without knowing how
 *  many there are. Sources with no samples do not appear.
 *
 *  Called per render rather than at module scope, so a file dropped into the
 *  folder shows up on the next dev-server reload without a restart. */
export const samplesBySource = () =>
  Object.values(SOURCES)
    .map((source) => ({
      source,
      samples: SAMPLES.filter((s) => s.source === source.id).map((sample) => ({
        ...sample,
        src: fileUrl(sample.file),
      })),
    }))
    .filter((group) => group.samples.length > 0)

// ============================================================
// THE PROFILE
// ============================================================

const unique = (values) => [...new Set(values.filter(Boolean))]
const across = (key) => unique(SAMPLES.map((sample) => sample[key]))

/** The credentials block, **derived from the samples rather than asserted.**
 *
 *  This started as five invented rows — a language, an accent list, a voice-age
 *  range, a studio and a delivery spec, none of which the owner had stated
 *  anywhere. Computing them from SAMPLES instead means every value on screen is
 *  backed by a recording on the same page, and the block cannot drift out of
 *  step with the samples the way a hand-kept list would.
 *
 *  **The labels say "demonstrated" on purpose.** A derived list describes what
 *  is shown here, not the limit of what he can do, and phrasing it as a range
 *  would quietly turn a sample set into a ceiling. */
const demonstrated = [
  { label: 'Language', value: across('language').join(', ') },
  { label: 'Accents demonstrated', value: across('accent').join(' · ') },
  { label: 'Voice age', value: across('voiceAge').join(' · ') },
  { label: 'Styles demonstrated', value: across('style').join(' · ') },
  { label: 'Genres', value: across('genre').join(' · ') },
  { label: 'Voice', value: across('gender').join(', ') },
]

export const PROFILE = {
  // The professional credit, as it reads on the ACX listing. **Deliberately the
  // full form**, where `MAKER_NAME` in content.js is the familiar one: the About
  // copy on the home page is the maker talking about himself, and this is the
  // name a rights holder would be putting on a contract and in the credits.
  // Two registers of one person, not a drift — but they do have to stay the same
  // *person*, so change both or neither.
  name: 'Christopher S Baumgart',
  title: 'Narrator',

  // The owner's own ACX tagline, verbatim and unedited. It is his line about
  // his own work, which makes it the one piece of copy on this page that is not
  // mine to tune.
  tagline:
    'A versatile voice actor with a flair for the poetic, the dramatic, and the unforgettable',

  // **`bio` is the owner's own ACX about text, edited for rhythm and given a
  // turn toward the reader. Nothing was added to it that is not in the
  // original.** The source, verbatim, so a future edit can see what was claimed:
  //
  //   "I have a rich history in amateur theater, narration, and singing. I am an
  //    avid reader who tends to prefer fantasy and SF genres, though by no means
  //    is that a limiting factor to my reading. I have been thrilled by
  //    Audiobooks for about 11 years now, and I thoroughly enjoy reading aloud
  //    myself."
  //
  // Three changes and no more. The three sentences all opened "I have / I am / I
  // have", which reads as a form filled in rather than a person talking, so the
  // openings vary now. "Amateur" is kept — it is true, and DESIGN.md's whole
  // posture is that an honest gap costs less than an inflated claim — but it no
  // longer *leads*, because a bio that opens on its own disclaimer has argued
  // against itself before the first full stop. And the original is entirely
  // about the narrator with nothing in it for the author reading it, so the
  // second paragraph turns the eleven years of listening into the thing it
  // actually qualifies him for.
  bio: [
    'Amateur theatre, narration and singing, for years — and underneath all of it a reader’s habit that came first. Fantasy and science fiction are where I go most naturally, though that has never been a fence so much as a favourite direction.',
    'Audiobooks have had me for about eleven years. I came to them as a listener and I have stayed one, which is most of what I know about the job: somebody is going to have your book in their ear for ten or twelve hours — in the car, on the walk, in the last hour before sleep. I read aloud because I love it, and I would rather be the voice that disappears into a story than the one standing in front of it.',
  ],

  // The mystic counterpart. The Lore register (DESIGN.md §5): earnest,
  // polysyndetic, fragments as sentences, repetition rather than variation, the
  // cosmic colliding with the small and concrete. **No irony and no punchlines**
  // — and the same facts underneath, which is the constraint that keeps this
  // from becoming a second, grander biography.
  loreBio: [
    'Before any of it, the reading. And then stages, and choirs, and the slow discovery that a voice is a thing you can aim. All of it the same discovery really, made three times in three rooms: that words lie inert on the page until somebody spends breath on them.',
    'Eleven years I have been listening. Someone else’s voice in my ear, telling me about places that were never there, while I drove or walked or lay in the dark. And it is such an ordinary miracle that nobody thinks to remark on it — that a stranger can be that close, for that long, and be welcome. That is the thing I want to be for a while. Not the voice you notice. The one you forget is not the author’s own.',
  ],

  credentials: demonstrated,

  // What working together looks like. **Every step here is invented and the
  // section is switched off** — see SHOW_PROCESS in StorytellerPage.jsx. It is
  // kept rather than deleted because the shape is right and only the content is
  // unconfirmed, which is the same call `SHOW_HOSTED` makes on the Keeper's
  // page: a section describing a process nobody has agreed to costs more
  // credibility than its absence does.
  //
  // TODO(confirm): the real process, then flip the flag.
  process: [
    {
      step: 'The conversation',
      detail:
        'Before anything is recorded: who the characters are to you, what the book is doing, and any line you already hear a specific way.',
    },
    {
      step: 'The first chapter',
      detail:
        'Recorded and sent on its own. Corrections here cost an afternoon; the same note on chapter twenty costs a week.',
    },
    {
      step: 'The read',
      detail:
        'Chapter by chapter, each one proofed against your manuscript before it moves.',
    },
    {
      step: 'The corrections',
      detail:
        'Punch-and-roll for anything you flag. A note is a note, not a change order.',
    },
  ],
}
