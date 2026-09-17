'use client'
// ============================================================
// THE LINK, AND THE THREE THINGS ANYONE DOES WITH IT.
//
// Copy it, open it, or send it. It is shown in full because a link somebody is
// about to put in front of a funder should be readable before it is sent, not a
// button that promises something.
//
// WHY COPY IS WRITTEN TWICE OVER. navigator.clipboard is refused outright on an
// older iPhone and on any page a browser does not consider secure, and Habib
// presents from a phone. So the modern way is tried, the old hidden-box way is
// the fallback, and if both are refused the link is put on screen selected with
// "Press and hold to copy", which is the one thing that always works.
//
// Share only appears where the device has it, because a Share button that does
// nothing on a laptop is worse than no button.
//
// It uses the application's own buttons. The walkthrough's styles stay on the
// walkthrough's own pages.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { onSolid } from '@/lib/ink'

const COPIED_MS = 2000
export const COPY_DONE = 'Link copied. Paste it into WhatsApp, email or a message.'
export const COPY_FAILED = 'Press and hold to copy.'

function btn(fill: string) {
  return {
    fontFamily: 'var(--cv-font-mono)', fontSize: '0.95rem', fontWeight: 600,
    padding: '0.4rem 0.9rem', borderRadius: 6, border: fill === 'transparent' ? '1px solid var(--cv-border)' : 'none',
    background: fill, color: fill === 'transparent' ? 'var(--cv-navy)' : onSolid(fill), cursor: 'pointer',
  } as const
}

/** Put text on the clipboard, by whichever means this browser allows. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the old way */ }
  try {
    const box = document.createElement('textarea')
    box.value = text
    box.setAttribute('readonly', '')
    box.style.position = 'fixed'
    box.style.top = '-1000px'
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(box)
    return ok
  } catch {
    return false
  }
}

export default function WalkthroughLink({
  url,
  label,
  note,
  extra,
}: {
  /** The whole address, as it will be pasted. */
  url: string
  label: string
  note?: string
  /** Anything else this link needs beside it, such as Open remote. */
  extra?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const field = useRef<HTMLInputElement | null>(null)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function')
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [])

  async function onCopy() {
    const ok = await copyText(url)
    setCopied(ok)
    setFailed(!ok)
    setToast(ok ? COPY_DONE : COPY_FAILED)
    if (!ok) { field.current?.focus(); field.current?.select() }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setCopied(false); setToast('') }, COPIED_MS)
  }

  async function onShare() {
    try { await (navigator as any).share({ url, title: label }) } catch { /* they closed it */ }
  }

  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '1.01rem', fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
      {note && <p style={{ fontSize: '1.01rem', color: 'var(--cv-slate)', margin: '0 0 0.5rem' }}>{note}</p>}
      <input
        ref={field}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        style={{
          width: '100%', fontFamily: 'var(--cv-font-mono)', fontSize: '0.95rem',
          padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--cv-border)',
          background: 'var(--cv-card)', color: 'var(--cv-navy)', marginBottom: '0.5rem',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" style={btn('var(--cv-cyan)')} onClick={onCopy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btn('transparent'), textDecoration: 'none' }}>Open</a>
        {canShare && <button type="button" style={btn('transparent')} onClick={onShare}>Share</button>}
        {extra}
      </div>
      {toast && (
        <p role="status" style={{ fontSize: '1.01rem', color: failed ? 'var(--cv-amber)' : 'var(--cv-green)', margin: '0.5rem 0 0' }}>
          {toast}
        </p>
      )}
    </div>
  )
}
