import React, { useEffect, useRef, useState } from 'react'

// ⓘ: a small circled i beside a control or heading; a tap shows what it is
// for, a second tap, Escape or a tap elsewhere hides it. The help is a sentence
// or a list of [term, what it does].

export function InfoButton({ open, onToggle, label = 'What is this?' }) {
  return (
    <button type="button" className={`eotm-info${open ? ' is-on' : ''}`} aria-label={label} aria-expanded={open} title={label}
      // Inside a fold's heading the tap explains, it does not fold.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle() }}>i</button>
  )
}

export function InfoPanel({ open, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') onClose() }
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.eotm-info')) onClose() }
    addEventListener('keydown', key)
    addEventListener('pointerdown', down, true)
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', down, true) }
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} className="eotm-info-panel" role="note"
      onClick={(e) => { e.stopPropagation(); if (e.currentTarget.closest('summary')) e.preventDefault() }}>
      {Array.isArray(children) && children.every(Array.isArray)
        ? <dl>{children.map(([term, text]) => <React.Fragment key={term}><dt>{term}</dt><dd>{text}</dd></React.Fragment>)}</dl>
        : <p>{children}</p>}
    </div>
  )
}

// Button and panel side by side; the parent lets the panel take a line of its own.
export default function Info({ children, label }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton open={open} onToggle={() => setOpen((o) => !o)} label={label} />
      <InfoPanel open={open} onClose={() => setOpen(false)}>{children}</InfoPanel>
    </>
  )
}
