'use client'
// ============================================================
// THE PHONE THAT DRIVES THE PROJECTOR.
//
// The presenter scans the square code on the holding screen, signs in as a
// coach, and this becomes the clicker: the notes for the screen that is up, the
// whole screen list to jump to, and two large buttons at the bottom.
//
// IT NEVER GUESSES WHERE THE SCREEN IS. Every instruction it sends is answered
// by the screen saying what it is now showing, and that answer is what is drawn
// here. So a press that does not arrive shows as nothing happening, rather than
// as a remote that quietly believes it is on screen 12 while the room is
// looking at screen 9.
//
// ONLY A COACH GETS HERE. The page around this sends anyone else away. Without
// that, the four digit code on the screen would be the only thing between a
// room full of people and control of the projector.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { WALKTHROUGH_CSS } from '@/lib/walkthrough/styles'
import { REMOTE_CSS } from '@/lib/walkthrough/remote-styles'
import { joinAsRemote, type ScreenState } from '@/lib/walkthrough/channel'
import { remoteHeading } from '@/lib/walkthrough/notes'

type Status = 'connecting' | 'connected' | 'lost'

export default function WalkthroughRemote({ slug, code }: { slug: string; code: string }) {
  const [status, setStatus] = useState<Status>('connecting')
  const [state, setState] = useState<ScreenState | null>(null)
  const [menu, setMenu] = useState(false)
  const sender = useRef<((m: any) => void) | null>(null)

  useEffect(() => {
    if (!code) return
    const link = joinAsRemote(slug, code, {
      onState: (s) => setState(s),
      onStatus: (st) => setStatus(st),
    })
    sender.current = link.send
    return () => { link.leave(); sender.current = null }
  }, [slug, code])

  const send = (m: any) => { sender.current?.(m) }
  const buzz = () => { try { navigator.vibrate?.(10) } catch {} }

  const heading = state
    ? remoteHeading(state.index, state.total, state.name)
    : 'Waiting for the screen'
  const note = useMemo(() => {
    if (!state?.notes) return ''
    return state.notes[state.index] || ''
  }, [state])

  if (!code) {
    return (
      <div className="gtcvw gtcvw-remote" data-room="dark">
        <style dangerouslySetInnerHTML={{ __html: WALKTHROUGH_CSS + REMOTE_CSS }} />
        <div className="rm-body">
          <p className="rm-note">
            This page needs the presenter code from the screen. Scan the square code in the
            corner of the holding screen with this phone, and it will open with the code in it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="gtcvw gtcvw-remote" data-room="dark">
      <style dangerouslySetInnerHTML={{ __html: WALKTHROUGH_CSS + REMOTE_CSS }} />

      <header className="rm-top">
        <div className="rm-where">{heading}</div>
        <button
          type="button"
          className="rm-menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          {menu ? 'Close' : 'Menu'}
        </button>
        <span className={`rm-dot ${status}`} aria-label={
          status === 'connected' ? 'Connected to the screen'
            : status === 'connecting' ? 'Connecting' : 'Reconnecting'
        } />
      </header>

      {status === 'lost' && (
        <p className="rm-warn">
          The link to the screen dropped. It is trying again. The screen still works from its
          own keyboard and buttons.
        </p>
      )}

      {menu ? (
        <div className="rm-body">
          <div className="rm-list">
            {(state?.names || []).map((n, i) => (
              <button
                type="button"
                key={n + i}
                className={i === state?.index ? 'on' : ''}
                onClick={() => { buzz(); send({ type: 'goto', index: i }); setMenu(false) }}
              >
                <b>{String(i + 1).padStart(2, '0')}</b> {n}
              </button>
            ))}
          </div>
          <div className="rm-toggles">
            <button type="button" onClick={() => send({ type: 'sound', on: !state?.sound })}>
              {state?.sound ? 'Sound on' : 'Sound off'}
            </button>
            <button type="button" onClick={() => send({ type: 'room', room: state?.room === 'light' ? 'dark' : 'light' })}>
              {state?.room === 'light' ? 'Light room' : 'Dark room'}
            </button>
            <button type="button" onClick={() => { send({ type: 'reveal' }); setMenu(false) }}>
              Show workspace
            </button>
          </div>
          <p className="rm-note quiet">
            Show workspace highlights the button on the laptop. Click it there: a browser will
            not open a tab on the laptop because this phone asked it to.
          </p>
        </div>
      ) : (
        <div className="rm-body">
          <p className="rm-note">{note || 'The screen has not said what it is showing yet.'}</p>
        </div>
      )}

      <footer className="rm-foot">
        <button type="button" className="rm-back" onClick={() => { buzz(); send({ type: 'prev' }) }}>Back</button>
        <button type="button" className="rm-next" onClick={() => { buzz(); send({ type: 'next' }) }}>Next</button>
      </footer>
    </div>
  )
}
