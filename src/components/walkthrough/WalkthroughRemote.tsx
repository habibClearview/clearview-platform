'use client'
// ============================================================
// THE PHONE THAT DRIVES THE PROJECTOR.
//
// The presenter scans the square code on the holding screen, signs in as a
// coach, and this becomes the clicker: the notes for the screen that is up, the
// same four buttons the screen's own header carries, a way to move the reading
// panel that is out of arm's reach, a way to slow the sequences down or hold
// them, and two large buttons at the bottom.
//
// IT NEVER GUESSES WHERE THE SCREEN IS. Every instruction it sends is answered
// by the screen saying what it is now showing, and that answer is what is drawn
// here. So a press that does not arrive shows as nothing happening, rather than
// as a remote that quietly believes it is on screen 12 while the room is
// looking at screen 9.
//
// WHY THE CONTROLS ARE ON THE PAGE AND NOT IN THE MENU. 17 September 2026.
// Habib: "I am unable to select the sound, walkthrough, explore or play button
// on the phone, it doesn't show that bar at all." They were in the menu, which
// is where a thing goes to be unavailable to somebody standing in front of a
// room. The bar is now where it is on the screen: across the top.
//
// ONLY A COACH GETS HERE. The page around this sends anyone else away. Without
// that, the four digit code on the screen would be the only thing between a
// room full of people and control of the projector.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { WALKTHROUGH_CSS } from '@/lib/walkthrough/styles'
import { REMOTE_CSS } from '@/lib/walkthrough/remote-styles'
import { joinAsRemote, type ScreenState, type Pairing } from '@/lib/walkthrough/channel'
import { remoteHeading } from '@/lib/walkthrough/notes'
import { SPEEDS } from '@/lib/walkthrough/engine'

type Status = 'connecting' | 'connected' | 'lost'

/** The pace after this one, so one button cycles through the three. */
function nextSpeed(current: number | undefined): { label: string; factor: number } {
  const at = SPEEDS.findIndex((s) => Math.abs(s.factor - (current ?? 1)) < 0.01)
  return SPEEDS[(at < 0 ? 0 : at + 1) % SPEEDS.length]
}

function speedLabel(current: number | undefined): string {
  const at = SPEEDS.find((s) => Math.abs(s.factor - (current ?? 1)) < 0.01)
  return at ? at.label : 'Normal'
}

export default function WalkthroughRemote({ slug, pairing }: { slug: string; pairing: Pairing | null }) {
  const [status, setStatus] = useState<Status>('connecting')
  const [state, setState] = useState<ScreenState | null>(null)
  const [menu, setMenu] = useState(false)
  const sender = useRef<((m: any) => void) | null>(null)

  useEffect(() => {
    if (!pairing) return
    const link = joinAsRemote(slug, pairing, {
      onState: (s) => setState(s),
      onStatus: (st) => setStatus(st),
    })
    sender.current = link.send
    return () => { link.leave(); sender.current = null }
  }, [slug, pairing])

  const send = (m: any) => { sender.current?.(m) }
  const buzz = () => { try { navigator.vibrate?.(10) } catch {} }
  const tap = (m: any) => { buzz(); send(m) }

  const heading = state
    ? remoteHeading(state.index, state.total, state.name)
    : 'Waiting for the screen'
  const note = useMemo(() => {
    if (!state?.notes) return null
    return state.notes[state.index] || null
  }, [state])

  if (!pairing) {
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

  const mode = state?.mode || 'walk'
  const more = state?.more || { down: false, up: false }

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
          {menu ? 'Close' : 'Screens'}
        </button>
        <span className={`rm-dot ${status}`} aria-label={
          status === 'connected' ? 'Connected to the screen'
            : status === 'connecting' ? 'Connecting' : 'Reconnecting'
        } />
      </header>

      {/* The same four the screen's own header carries, in the same order. */}
      <div className="rm-modes" role="group" aria-label="Mode">
        <button
          type="button"
          className={state?.sound ? 'on' : ''}
          aria-pressed={!!state?.sound}
          onClick={() => tap({ type: 'sound', on: !state?.sound })}
        >
          {state?.sound ? 'Sound on' : 'Sound off'}
        </button>
        <button type="button" className={mode === 'walk' ? 'on' : ''} aria-pressed={mode === 'walk'}
          onClick={() => tap({ type: 'mode', mode: 'walk' })}>Walkthrough</button>
        <button type="button" className={mode === 'explore' ? 'on' : ''} aria-pressed={mode === 'explore'}
          onClick={() => tap({ type: 'mode', mode: 'explore' })}>Explore</button>
        <button type="button" className={mode === 'play' ? 'on' : ''} aria-pressed={mode === 'play'}
          onClick={() => tap({ type: 'mode', mode: 'play' })}>Play</button>
      </div>

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
                onClick={() => { tap({ type: 'goto', index: i }); setMenu(false) }}
              >
                <b>{String(i + 1).padStart(2, '0')}</b> {n}
              </button>
            ))}
          </div>
          <div className="rm-toggles">
            <button type="button" onClick={() => tap({ type: 'room', room: state?.room === 'light' ? 'dark' : 'light' })}>
              {state?.room === 'light' ? 'Light room' : 'Dark room'}
            </button>
            <button type="button" onClick={() => { tap({ type: 'reveal' }); setMenu(false) }}>
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
          {note ? (
            <>
              {!!state?.beats && state.beats > 0 && (state.beat ?? -1) >= 0 && (
                <span className="rm-beat">
                  Item {(state.beat ?? 0) + 1} of {state.beats}
                </span>
              )}
              <p className="rm-note">{note.cue}</p>
              {note.points.length > 0 && (
                <ul className="rm-points">
                  {note.points.map((point, i) => <li key={i}>{point}</li>)}
                </ul>
              )}
              {/* The presenter's own phone is signed in to the platform, so it
                  can open the workspace itself. The laptop's button is the one
                  the room watches. */}
              {state?.workspace && (
                <a className="rm-open" href={state.workspace} target="_blank" rel="noopener noreferrer">
                  Open the workspace on this phone
                </a>
              )}
            </>
          ) : (
            <p className="rm-note">The screen has not said what it is showing yet.</p>
          )}
        </div>
      )}

      {/* Moving the reading panel, holding the sequence, and its pace. */}
      <div className="rm-tools">
        <button
          type="button"
          disabled={!more.up}
          onClick={() => tap({ type: 'scroll', direction: -1 })}
        >
          Text up
        </button>
        <button
          type="button"
          className={more.down ? 'wants' : ''}
          disabled={!more.down}
          onClick={() => tap({ type: 'scroll', direction: 1 })}
        >
          Text down
        </button>
        <button
          type="button"
          className={state?.held ? 'on' : ''}
          aria-pressed={!!state?.held}
          onClick={() => tap({ type: 'hold', held: !state?.held })}
        >
          {state?.held ? 'Carry on' : 'Hold'}
        </button>
        <button
          type="button"
          onClick={() => tap({ type: 'speed', factor: nextSpeed(state?.speed).factor })}
        >
          {speedLabel(state?.speed)}
        </button>
      </div>

      <footer className="rm-foot">
        <button type="button" className="rm-back" onClick={() => tap({ type: 'prev' })}>Back</button>
        <button type="button" className="rm-next" onClick={() => tap({ type: 'next' })}>Next</button>
      </footer>
    </div>
  )
}
