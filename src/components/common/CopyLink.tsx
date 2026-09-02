// @ts-nocheck
'use client'
// ============================================================
// A link somebody has to get onto another device.
//
// WHY THIS EXISTS AS ONE THING. Every sharing surface in the platform had
// invented its own way of handing over an address, and they were not equally
// usable. The room showed the address and a copy button. The showcase printed
// it into a status message, so the only way to take it was to select the text
// out of a notice that disappears. The field token and the access link were
// different again. Somebody sitting in a session, trying to get a link onto
// their laptop, should not find that the answer depends on which screen they
// happen to be looking at.
//
// A QR CODE IS NOT ENOUGH ON ITS OWN. Scanning puts the link on a phone. Plenty
// of people want it in the browser on their laptop, where they are actually
// going to work, and the only routes there are copying it or typing it. So the
// address is always shown, always selectable, always breakable across lines so
// it cannot push a page sideways, and there is always a button.
//
// WHAT THE BUTTON DOES WHEN IT CANNOT. Copying needs a permission the browser
// can refuse, and it always fails when a page is not served over a secure
// connection. Rather than a button that silently does nothing, it selects the
// address and says to copy it by hand, which is the thing the person was going
// to do anyway.
// ============================================================

import { useEffect, useRef, useState } from 'react'

export default function CopyLink({ url, label, hint, compact = false }) {
  const [state, setState] = useState('idle')
  const boxRef = useRef(null)
  const timer = useRef(null)

  // Clearing the timer on unmount, because setting state on a component that
  // has gone is a warning in the console and a real leak on a screen the coach
  // is opening and closing all day.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function flash(next) {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }

  function selectIt() {
    const node = boxRef.current
    if (!node || typeof window === 'undefined') return
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      flash('copied')
    } catch {
      selectIt()
      flash('select')
    }
  }

  const box = {
    fontFamily: 'var(--cv-font-mono)',
    fontSize: compact ? '0.78rem' : '0.82rem',
    // Long addresses break inside the box rather than forcing the page wider
    // than the window, which is what produced sideways scrolling elsewhere.
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
    color: 'var(--cv-navy)',
    background: 'var(--cv-bg-2)',
    border: '1px solid var(--cv-border)',
    borderRadius: 6,
    padding: '0.45rem 0.55rem',
    userSelect: 'all',
    minWidth: 0,
  }
  const button = {
    fontFamily: 'var(--cv-font-mono)',
    fontSize: '0.82rem',
    padding: '0.4rem 0.75rem',
    border: '1px solid var(--cv-teal)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--cv-teal)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }

  return (
    <div style={{ minWidth: 0 }}>
      {label ? (
        <div style={{
          fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--cv-slate)', marginBottom: '0.3rem',
        }}>{label}</div>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap', minWidth: 0 }}>
        <div ref={boxRef} style={{ ...box, flex: '1 1 260px' }}>{url}</div>
        <button type="button" style={button} onClick={copy}>
          {state === 'copied' ? 'Copied' : state === 'select' ? 'Copy it by hand' : 'Copy'}
        </button>
      </div>

      {state === 'select' ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--cv-slate)', margin: '0.4rem 0 0' }}>
          This browser would not let the page copy for you. The address is selected, so press the copy
          keys on your keyboard now.
        </p>
      ) : hint ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--cv-slate)', margin: '0.4rem 0 0', maxWidth: '70ch' }}>{hint}</p>
      ) : null}
    </div>
  )
}
