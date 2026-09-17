'use client'
// ============================================================
// THE WALKTHROUGH ON A SCREEN.
//
// This component owns the wrapper, the header, the footer and the two areas the
// engine draws into. The engine (src/lib/walkthrough/engine.ts) owns everything
// inside them. That split is deliberate: the markup React is good at stays in
// React, and the several hundred SVG nodes whose classes change forty times
// during one animation stay out of it.
//
// The walkthrough works on its own. The keyboard, a presentation clicker, the
// Back and Next buttons and a swipe all drive it whether the phone remote ever
// connects or not, which is why the pairing code below can fail quietly.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { WALKTHROUGH_CSS, WALKTHROUGH_PAIRING_CSS, WALKTHROUGH_ROOM_CSS } from '@/lib/walkthrough/styles'
import { mount, type Controller } from '@/lib/walkthrough/engine'
import { speakerNotes } from '@/lib/walkthrough/notes'
import type { WalkthroughContext } from '@/lib/walkthrough/context'
import {
  joinAsScreen, presenterPairing, CONNECT_TIMEOUT_MS,
  type RemoteMessage, type Pairing,
} from '@/lib/walkthrough/channel'

export default function Walkthrough({
  ctx,
  slug,
  remoteUrl,
}: {
  ctx: WalkthroughContext
  /** Which walkthrough this is, for the pairing channel. */
  slug: string
  /** The whole address the square code sends the phone to, on the platform
   *  rather than the public site, because that is where a coach is signed in.
   *  Empty turns pairing off. */
  remoteUrl: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const ctrlRef = useRef<Controller | null>(null)
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [ready, setReady] = useState(0)
  /** Set once the phone is connected, so the square is not put back again. */
  const pairedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ctrl = mount(root, ctx)
    ctrlRef.current = ctrl
    setReady((n) => n + 1)
    // The same handle the reference build exposes, so a screen can be jumped to
    // with no animation. It is what the screenshot check drives, and what a
    // presenter's browser console can use if a sequence ever hangs mid-room.
    ;(window as any).__gtcv = {
      go: (i: number) => ctrl.go(i),
      count: ctrl.steps().length,
      names: ctrl.steps().map((s) => s.name),
      // The same things the phone can do, for a presenter whose phone has gone
      // flat and who has the browser console open, and for the checks.
      speed: (factor: number) => ctrl.setSpeed(factor),
      hold: (on: boolean) => ctrl.setHeld(on),
      scroll: (direction: 1 | -1) => ctrl.scrollPanel(direction),
      state: () => ctrl.state(),
    }
    return () => {
      ctrl.destroy()
      ctrlRef.current = null
      try { delete (window as any).__gtcv } catch {}
    }
  }, [ctx])

  // ── the pairing corner, and the phone that uses it ───────
  useEffect(() => {
    const root = rootRef.current
    const ctrl = ctrlRef.current
    if (!root || !ctrl || !remoteUrl) return

    const mine = presenterPairing(slug)
    setPairing(mine)
    let connected = false

    const status = (text: string, isReady: boolean) => {
      const t = root.querySelector('#holdStatusText')
      if (t) t.textContent = text
      const dot = root.querySelector('#holdStatus i') as HTMLElement | null
      if (dot && isReady) { dot.style.background = '#82BC7B'; dot.style.animation = 'none' }
    }
    const hidePairing = () => {
      pairedRef.current?.()
      root.querySelector('#pairing')?.classList.add('gone')
    }

    const notes = speakerNotes(ctx)
    const names = ctrl.steps().map((s) => s.name)

    const link = joinAsScreen(slug, mine, {
      onMessage: (m: RemoteMessage) => {
        if (!connected) { connected = true; status('Ready', true); hidePairing() }
        if (m.type === 'goto') ctrl.go(m.index)
        else if (m.type === 'next') ctrl.next()
        else if (m.type === 'prev') ctrl.prev()
        else if (m.type === 'mode') ctrl.setMode(m.mode)
        else if (m.type === 'sound') ctrl.setSound(m.on)
        else if (m.type === 'room') ctrl.setRoom(m.room)
        else if (m.type === 'speed') ctrl.setSpeed(m.factor)
        else if (m.type === 'hold') ctrl.setHeld(m.held)
        else if (m.type === 'scroll') ctrl.scrollPanel(m.direction)
        else if (m.type === 'reveal') {
          // A browser will not let a message from another device open a tab, so
          // the phone cannot do this for the presenter. It asks the screen to
          // make the button unmissable instead, and the phone says who clicks.
          const btn = root.querySelector('#revealBtn') as HTMLAnchorElement | null
          if (btn) { btn.focus(); btn.style.outline = '3px solid #F5F5DC'; btn.style.outlineOffset = '4px' }
        }
        link.publish({ type: 'state', ...ctrl.state(), notes, names })
      },
      onReady: () => {},
      onLost: () => { if (!connected) status('Use the arrow keys', false) },
    })
    const off = ctrl.onState((s) => { link.publish({ type: 'state', ...s, notes, names }) })
    const timer = setTimeout(() => { if (!connected) status('Use the arrow keys', false) }, CONNECT_TIMEOUT_MS)
    return () => { off(); link.leave(); clearTimeout(timer) }
  }, [ctx, slug, remoteUrl, ready])

  // ── the square code itself ───────────────────────────────
  //
  // IT HAS TO BE PUT BACK EVERY TIME. The holding screen is redrawn whenever it
  // is returned to, which throws away whatever was inside it, so the square is
  // built once and re-attached each time the screen comes back to number one.
  // Built into the page instead, it vanished the second time anybody pressed
  // Home or clicked the first dot.
  useEffect(() => {
    const root = rootRef.current
    const ctrl = ctrlRef.current
    if (!root || !ctrl || !pairing || !pairing.key || !remoteUrl) return
    let cancelled = false
    let corner: HTMLElement | null = null
    let paired = false

    const attach = () => {
      if (!corner) return
      const holder = root.querySelector('#pairing') as HTMLElement | null
      if (!holder || holder.firstChild || paired) return
      holder.appendChild(corner)
      holder.removeAttribute('hidden')
    }

    // The four digits are printed under the square. The key is only inside it.
    const url = `${remoteUrl}?s=${pairing.code}&k=${encodeURIComponent(pairing.key)}`
    // Loaded only when a walkthrough actually draws one, so the code that turns
    // a web address into a square is not shipped to every other page.
    import('qrcode').then((QR) => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      QR.toCanvas(canvas, url, {
        width: 96, margin: 0,
        color: { dark: '#F5F5DC', light: '#00000000' },
      }, (err: unknown) => {
        if (err || cancelled) return
        corner = document.createElement('div')
        corner.appendChild(canvas)
        const lab = document.createElement('div')
        lab.className = 'code'
        lab.textContent = `Presenter code ${pairing.code}`
        corner.appendChild(lab)
        attach()
      })
    }).catch(() => {})

    const off = ctrl.onState((s) => { if (s.index === 0) attach() })
    pairedRef.current = () => { paired = true }
    return () => { cancelled = true; off(); pairedRef.current = null }
  }, [pairing, remoteUrl, ready])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: WALKTHROUGH_CSS + WALKTHROUGH_PAIRING_CSS + WALKTHROUGH_ROOM_CSS }} />
      <div className="gtcvw" ref={rootRef} data-room="dark" data-kind="scene">
        <header className="top">
          <div className="brand">
            <img className="logo cream" alt="Habib Onifade" src="/site/walkthrough-logo-cream.png" />
            <img className="logo navy" alt="Habib Onifade" src="/site/walkthrough-logo-navy.png" />
            <div className="rule" />
            <div className="name">
              <b>Grant-to-Commercial Viability Canvas™</b>
              <span>{ctx.prepared}</span>
            </div>
          </div>
          <div className="tools">
            <button className="tbtn" id="sound" aria-pressed="false" title="Sound (S)" type="button">
              <svg viewBox="0 0 24 24">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path id="waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" opacity=".35" />
              </svg>
              <span id="soundLab">Sound off</span>
            </button>
            <div className="modes" role="group" aria-label="Mode">
              <button id="mWalk" aria-pressed="true" type="button">Walkthrough</button>
              <button id="mExplore" aria-pressed="false" type="button">Explore</button>
              <button id="mPlay" aria-pressed="false" type="button">Play</button>
            </div>
          </div>
        </header>

        <main className="stage" id="stage">
          <div className="canvas-wrap" id="cwrap">
            <svg id="cv" role="img" aria-label="The Grant-to-Commercial Viability Canvas with eleven decision points" />
          </div>
          <aside className="narr" id="narr" aria-live="polite" />
        </main>
        <section className="scene" id="scene" aria-live="polite" />

        <footer className="ctrl">
          <div className="nav">
            <button className="nb" id="prev" type="button">Back</button>
            <span className="stepnum" id="stepnum" />
            <button className="nb primary" id="next" type="button">Next</button>
            <div className="dots" id="dots" aria-label="Screens" />
          </div>
          <div className="keys">
            <kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>E</kbd> explore · <kbd>P</kbd> play · <kbd>S</kbd> sound · <kbd>L</kbd> light room · <kbd>F</kbd> full screen
          </div>
          <div className="foot">© Habib Onifade · The Canvas Coach · habibonifade.com</div>
        </footer>
      </div>
    </>
  )
}
