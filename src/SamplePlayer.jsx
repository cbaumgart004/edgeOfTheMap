// SamplePlayer.jsx
//
// The audio samples on /storyteller, played in place.
//
// **One `<audio>` element for the whole list, not one per sample.** That is what
// makes "only one sample plays at a time" true by construction rather than by
// remembering to pause the others — switching samples is a `src` assignment, and
// there is never a second element that could still be running. It also means one
// set of listeners instead of one per row.
//
// **Not `<audio controls>`.** The native widget is a browser-styled grey pill
// that takes no tokens at all: it would land in both faces unchanged, ignoring
// `--radius`, `--accent` and the serif alike, and read as a piece of another
// website dropped into this one. DESIGN.md §5 is explicit that the two faces are
// the product; a control that cannot change with them is the one thing on the
// page that would prove the toggle superficial. So the transport is ours and the
// element underneath is headless.
//
// Samples with no file resolved (DESIGN.md — `resolvedSamples`) render as listed
// but unplayable rather than as a player that does nothing when pressed.

import React, { useEffect, useRef, useState } from 'react'

/** mm:ss, and `--:--` until the metadata says otherwise. `Math.floor` on a NaN
 *  duration would print `NaN:NaN` for the whole time a file is loading. */
function clock(seconds) {
  if (!Number.isFinite(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// No `isMystic`: everything this component renders is either the owner's own
// words or casting metadata, and both read straight in either face. The face
// switching happens in the tokens around it. If a field here ever needs a
// mystic variant, it takes the `blurb`/`loreBlurb` pairing like the rest of the
// site — not a branch in here.
export default function SamplePlayer({ samples }) {
  const audioRef = useRef(null)
  // The sample currently loaded into the one audio element — not the one
  // playing. A paused sample stays selected so its scrubber keeps its position.
  const [currentId, setCurrentId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(NaN)

  // All transport state comes from the element's own events rather than from
  // the calls that caused them. `play()` returns a promise that can reject —
  // an autoplay block, a file that 404s — and a `setIsPlaying(true)` next to
  // the call would leave the button showing "pause" for audio that never
  // started. Listening to `play`/`pause` means the UI cannot disagree with the
  // element.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onTime = () => setTime(el.currentTime)
    const onMeta = () => setDuration(el.duration)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setTime(0)
    }
    // A missing or unplayable file: drop the selection so the row goes back to
    // its resting state instead of sitting at a stuck 0:00 mid-play.
    const onError = () => {
      setIsPlaying(false)
      setCurrentId(null)
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
    }
  }, [])

  const toggle = (sample) => {
    const el = audioRef.current
    if (!el || !sample.src) return

    if (currentId === sample.id) {
      if (el.paused) el.play().catch(() => {})
      else el.pause()
      return
    }

    // A different sample: reset the readout before the new metadata lands, or
    // the previous file's duration is briefly printed against the new title.
    setCurrentId(sample.id)
    setTime(0)
    setDuration(NaN)
    el.src = sample.src
    el.play().catch(() => {})
  }

  const seek = (value) => {
    const el = audioRef.current
    if (!el || !Number.isFinite(duration)) return
    el.currentTime = value
    setTime(value)
  }

  return (
    <div className="samples">
      {/* Headless: every control below drives this. No `controls` attribute,
          so it is not focusable and does not appear in the tab order twice. */}
      <audio ref={audioRef} preload="none" />

      <ul className="sample-list">
        {samples.map((sample) => {
          const isCurrent = currentId === sample.id
          const playable = Boolean(sample.src)

          return (
            <li
              key={sample.id}
              className={`sample ${isCurrent ? 'is-current' : ''} ${
                playable ? '' : 'is-pending'
              }`}
            >
              <button
                type="button"
                className="sample-play"
                onClick={() => toggle(sample)}
                disabled={!playable}
                aria-label={
                  playable
                    ? `${isCurrent && isPlaying ? 'Pause' : 'Play'} — ${sample.title}`
                    : `${sample.title} — sample not yet posted`
                }
              >
                {/* Two glyphs, drawn rather than typed: the unicode play and
                    pause characters sit on wildly different baselines across
                    the two faces' fonts, and one of them is an emoji on some
                    platforms. */}
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {isCurrent && isPlaying ? (
                    <>
                      <rect x="7" y="5" width="4" height="14" />
                      <rect x="13" y="5" width="4" height="14" />
                    </>
                  ) : (
                    <path d="M8 5l11 7-11 7z" />
                  )}
                </svg>
              </button>

              <div className="sample-body">
                <p className="sample-title">
                  {sample.title}
                  {/* The work it is drawn from, where the title is not itself
                      the work. Cited rather than folded into the title so the
                      title stays the thing you scan for. */}
                  {sample.work && (
                    <span className="sample-work"> — {sample.work}</span>
                  )}
                </p>

                {/* Casting metadata, in the order a producer reads it: what it
                    sounds like first, what shelf it belongs on last. `gender`
                    is in the data but not here — it is an ACX filter field, and
                    on his own site it is a tag nobody is searching by. */}
                <ul className="sample-tags">
                  <li>{sample.accent}</li>
                  <li>{sample.voiceAge}</li>
                  <li>{sample.style}</li>
                  <li className="sample-tag-genre">{sample.genre}</li>
                  {/* The declared runtime, shown until the file itself is
                      loaded — at which point the transport's own clock takes
                      over, because that is the truth about what is playing. */}
                  {!isCurrent && sample.duration && <li>{sample.duration}</li>}
                </ul>

                {sample.notes && (
                  // The owner's own performance notes, verbatim and in both
                  // faces — see the header of narration.js for why these are
                  // the one thing here without a mystic variant.
                  <p className="sample-notes">{sample.notes}</p>
                )}

                {isCurrent && (
                  <div className="sample-transport">
                    <input
                      className="sample-scrub"
                      type="range"
                      min="0"
                      max={Number.isFinite(duration) ? duration : 0}
                      step="0.1"
                      value={time}
                      onChange={(e) => seek(Number(e.target.value))}
                      aria-label={`Seek — ${sample.title}`}
                    />
                    <p className="sample-time">
                      <span>{clock(time)}</span>
                      <span aria-hidden="true"> / </span>
                      <span>{clock(duration)}</span>
                    </p>
                  </div>
                )}

                {!playable && (
                  <p className="sample-pending">Sample not yet posted.</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
