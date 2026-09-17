// ============================================================
// THE WALKTHROUGH ITSELF.
//
// A direct port of the approved reference build. It draws the canvas as SVG,
// runs the animation sequences and moves between the nineteen screens. The
// timings, the easing and the order of every beat are the reference's, because
// the sequence IS the approved design: the same screens with different pauses
// are a different thing to sit through.
//
// WHY THIS IS NOT WRITTEN AS REACT COMPONENTS. The drawing is a few hundred
// SVG nodes whose classes change forty times during a single ten second
// sequence, driven by promises that have to be cancellable the instant somebody
// presses Next. Expressed as state and re-renders that is slower, and every
// animation becomes a fight with the reconciler. So the component owns the
// wrapper and this owns everything inside it, which is also what makes it a
// faithful port rather than a re-interpretation.
//
// It touches nothing outside the root element it is handed.
// ============================================================
import { INFO, ORDER, CHIP, SCALE } from './canvas-words'
import { WIDE, TALL, COMPACT_QUERY, type Layout } from './geometry'
import { buildSteps, setupHTML, type Step } from './steps'
import type { WalkthroughContext } from './context'

const NS = 'http://www.w3.org/2000/svg'
const XH = 'http://www.w3.org/1999/xhtml'

/** The fit tag and badge colours, by colour key. */
const FITCOL: Record<string, string> = { cyan: '#70E8E9', gold: '#D9B268', lav: '#B29CD2', slate: '#445C87' }

export type Mode = 'walk' | 'explore' | 'play'
export type Room = 'dark' | 'light'

/** What the screen reports after every change, so a remote can follow it. */
export interface WalkthroughState {
  index: number
  total: number
  name: string
  mode: Mode
  sound: boolean
  room: Room
  /** How slowly the sequences run. 1 is the approved design's own pace. */
  speed: number
  /** True while the sequence is held at the beat it has reached. */
  held: boolean
  /** Whether there is text below the fold on the panel, and above it. */
  more: { down: boolean; up: boolean }
}

/** The three paces, named the way the remote names them. */
export const SPEEDS: { label: string; factor: number }[] = [
  { label: 'Normal', factor: 1 },
  { label: 'Slower', factor: 1.8 },
  { label: 'Slowest', factor: 3 },
]

export interface Controller {
  go(index: number, animate?: boolean): void
  next(): void
  prev(): void
  setMode(mode: Mode): void
  setSound(on: boolean): void
  setRoom(room: Room): void
  /** Slow the sequences down, or put them back to the approved pace. */
  setSpeed(factor: number): void
  /** Hold the sequence where it is, or let it carry on. */
  setHeld(held: boolean): void
  /** Move the reading panel, because on some screens it has more than fits. */
  scrollPanel(direction: 1 | -1): void
  state(): WalkthroughState
  /** Told after every change. Returns a function that stops listening. */
  onState(fn: (s: WalkthroughState) => void): () => void
  steps(): Step[]
  destroy(): void
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Start the walkthrough inside `root`, which must contain the markup the
 * component renders. Everything is looked up inside that element, never by
 * document id, so two of these on one page could not collide.
 */
export function mount(root: HTMLElement, ctx: WalkthroughContext): Controller {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T | null
  const app = root
  const svg = $<SVGSVGElement>('#cv')!
  const narr = $('#narr')!
  const scene = $('#scene')!
  const dots = $('#dots')!
  const stage = $('#stage')!
  const STEPS = buildSteps(ctx)
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── sound, off by default ────────────────────────────────
  let actx: AudioContext | null = null
  let soundOn = false
  /** The shapes the reference's tones use. Written out so the file needs no
   *  browser type declarations to lint. */
  type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle'
  function tone(f: number, dur: number, o: { type?: Wave; gain?: number; at?: number; to?: number } = {}) {
    if (!soundOn || !actx) return
    const { type = 'sine', gain = 0.06, at = 0, to = null } = o as any
    const t = actx.currentTime + at
    const osc = actx.createOscillator()
    const g = actx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f, t)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(actx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
  const SFX = {
    beat: () => tone(1320, 0.07, { type: 'triangle', gain: 0.025 }),
    sign: () => { tone(784, 0.16, { gain: 0.05 }); tone(1175, 0.32, { gain: 0.045, at: 0.08 }) },
    travel: () => tone(330, 0.35, { gain: 0.018, to: 520 }),
    reopen: () => { tone(523, 0.2, { gain: 0.05 }); tone(415, 0.38, { gain: 0.05, at: 0.14 }) },
    step: () => tone(660, 0.05, { type: 'triangle', gain: 0.018 }),
    finale: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, { gain: 0.035, at: i * 0.09 })) },
  }
  function setSound(on: boolean) {
    soundOn = on
    if (on && !actx) {
      try { actx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() } catch { soundOn = false }
    }
    if (actx && actx.state === 'suspended') actx.resume()
    $('#sound')?.setAttribute('aria-pressed', String(soundOn))
    const lab = $('#soundLab'); if (lab) lab.textContent = soundOn ? 'Sound on' : 'Sound off'
    $('#waves')?.setAttribute('opacity', soundOn ? '1' : '.35')
    if (soundOn) SFX.sign()
    tell()
  }

  // ── drawing ──────────────────────────────────────────────
  let L: Layout | null = null
  let GE: Record<string, { grp: SVGGElement; pips: SVGCircleElement[]; status: SVGTextElement | null }> = {}
  let RC: Record<string, SVGGElement> = {}
  let regEls: SVGRectElement[] = []
  let ownFill: SVGRectElement | null = null
  let readings: SVGGElement[] = []
  let arc: SVGPathElement | null = null
  let token: SVGGElement | null = null
  let setupEl: SVGGElement | null = null
  let recwrap: SVGGElement | null = null

  function el<T extends Element>(tag: string, attrs: Record<string, any>, parent?: Element): T {
    const e = document.createElementNS(NS, tag) as unknown as T
    for (const a in attrs) e.setAttribute(a, String(attrs[a]))
    if (parent) parent.appendChild(e)
    return e
  }
  function txt(parent: Element, attrs: Record<string, any>, t: string) {
    const e = el<SVGTextElement>('text', attrs, parent)
    e.textContent = t
    return e
  }
  function html(tag: string, cls?: string, text?: string) {
    const e = document.createElementNS(XH, tag) as HTMLElement
    if (cls) e.setAttribute('class', cls)
    if (text != null) e.textContent = text
    return e
  }
  function ctr(k: string) {
    const [x, y, w, h] = L!.G[k]
    return k === 'd9' ? { x: x + (L!.compact ? 80 : 260), y: y + h / 2 } : { x: x + w / 2, y: y + h / 2 }
  }

  function build(layout: Layout) {
    L = layout
    svg.innerHTML = ''
    GE = {}
    RC = {}
    svg.setAttribute('viewBox', '0 0 ' + L.vb.join(' '))
    svg.classList.toggle('compact', L.compact)
    const defs = el<SVGDefsElement>('defs', {}, svg)
    const mk = el<SVGMarkerElement>('marker', {
      id: 'arrowHead', viewBox: '0 0 10 10', refX: '6', refY: '5',
      markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse',
    }, defs)
    el('path', { d: 'M0 0 L10 5 L0 10 z', class: 'arrowHead' }, mk)

    setupEl = el<SVGGElement>('g', {
      class: 'setup', tabindex: '0', role: 'button',
      'aria-label': 'Set up: three questions and the Engagement Charter',
    }, svg)
    const [sx, sy, sw, sh] = L.setup
    el('rect', { class: 'box', x: sx, y: sy, width: sw, height: sh, rx: 4 }, setupEl)
    txt(setupEl, { class: 't1', x: L.setupT.t1[0], y: L.setupT.t1[1], 'font-size': L.setupT.t1[2] }, 'SET UP')
    txt(setupEl, { class: 't2', x: L.setupT.t2[0], y: L.setupT.t2[1], 'font-size': L.setupT.t2[2] }, L.setupT.t2[3])
    setupEl.addEventListener('click', showSetup)
    setupEl.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); showSetup() }
    })

    L.headers.forEach(([t, x, w, bg, ink]) => {
      const g = el<SVGGElement>('g', { class: 'colbar' }, svg)
      el('rect', { x, y: L!.hdrY, width: w, height: L!.hdrH, rx: 3, fill: bg }, g)
      txt(g, {
        x: x + w / 2, y: L!.hdrY + L!.hdrH / 2 + L!.hdrSize * 0.36,
        'text-anchor': 'middle', 'font-size': L!.hdrSize, fill: ink,
      }, t)
    })

    const gatesG = el<SVGGElement>('g', { id: 'gates' }, svg)
    ORDER.forEach((k, idx) => {
      const [x, y, w, h] = L!.G[k]
      const I = INFO[k]
      const spine = k === 'd9'
      const book = k === 'cg' || k === 'ho'
      const strip = L!.compact && book
      const narrow = !L!.compact && w < 200
      const grp = el<SVGGElement>('g', {
        class: 'gate' + (narrow ? ' narrow' : '') + (strip ? ' strip' : ''),
        tabindex: '0', role: 'button', 'aria-label': I.name,
      }, gatesG)
      grp.style.animationDelay = (idx * 55) + 'ms'
      el('rect', { class: 'box', x, y, width: w, height: h, rx: 4 }, grp)
      if (I.c) el('rect', { class: 'fitbar', x: x + 1, y: y + 1, width: w - 2, height: L!.compact ? 3 : 4, fill: FITCOL[I.c] }, grp)
      let fw = w
      let fh = h - (L!.compact ? 14 : 40)
      if (spine) { fw = L!.compact ? 160 : 380; fh = h - (L!.compact ? 14 : 10) }
      if (narrow) { fh = h - 50 }
      if (strip) { fw = 260; fh = h }
      const fo = el<SVGForeignObjectElement>('foreignObject', { x, y, width: fw, height: fh }, grp)
      const d = html('div', 'gtxt' + (I.kind === 'Transition' ? ' tr' : '')
        + (!L!.compact && !narrow && I.name.length > 22 ? ' nm2' : ''))
      const numEl = html('span', 'g-num ' + (book ? 'slate' : (I.c || 'cyan')),
        L!.compact ? I.num.replace('At close', 'Close') : I.num)
      const head = html('div')
      head.appendChild(numEl)
      if (I.kind && !L!.compact && I.kind !== 'Threshold') head.appendChild(html('span', 'g-kind', I.kind))
      d.appendChild(head)
      d.appendChild(html('div', 'g-name', L!.compact ? (I.tiny || I.name) : I.name))
      if (!L!.compact && I.short) d.appendChild(html('div', 'g-q', I.short))
      fo.appendChild(d)
      if (!L!.compact && I.fit) {
        const ff = el<SVGForeignObjectElement>('foreignObject', { x: x + 14, y: y + h - 32, width: w - 28, height: 26 }, grp)
        ff.appendChild(html('span', 'fit ' + I.fit[1], I.fit[0]))
      }
      const pips: SVGCircleElement[] = []
      let px: number, py: number, pr: number, ps: number
      if (L!.compact) {
        pr = 3.4; ps = 10
        if (strip) { px = x + w - 80; py = y + h / 2 } else if (spine) { px = x + 9; py = y + h - 8 } else { px = x + 9; py = y + h - 9 }
      } else {
        pr = 5; ps = 16
        if (spine) { px = x + 270; py = y + 20 } else if (narrow) { px = x + 14; py = y + h - 16 } else { px = x + w - 104; py = y + 20 }
      }
      for (let i = 0; i < 4; i++) pips.push(el<SVGCircleElement>('circle', { class: 'pip', cx: px + i * ps, cy: py, r: pr }, grp))
      let status: SVGTextElement | null = null
      if (!L!.compact) {
        if (narrow) status = txt(grp, { class: 'status', x: x + 12, y: y + h - 36, 'font-size': 10.5 }, '')
        else if (spine) status = txt(grp, { class: 'status', x: x + 330, y: y + 24, 'font-size': 10.5 }, '')
      }
      const sr = L!.compact ? 7 : 11
      const scx = L!.compact ? (strip || spine ? x + w - 14 : x + w - 11) : x + w - 20
      const scy = L!.compact ? (strip || spine ? y + h / 2 : y + 12) : y + 20
      const stamp = el<SVGGElement>('g', { class: 'stamp' }, grp)
      el('circle', { cx: scx, cy: scy, r: sr }, stamp)
      const s = sr / 11
      el('path', {
        d: `M ${scx - 5 * s} ${scy} L ${scx - 1.5 * s} ${scy + 3.8 * s} L ${scx + 5.2 * s} ${scy - 4 * s}`,
        'stroke-width': L!.compact ? 1.8 : 2.4,
      }, stamp)
      if (spine) {
        const S = L!.scale
        const sg = el<SVGGElement>('g', { class: 'scale' }, grp)
        SCALE.forEach(([lab, fill, ink], i) => {
          el('rect', { x: S.x + i * S.w, y: S.y, width: S.w - 2, height: S.h, fill, rx: 2 }, sg)
          if (S.labels) {
            txt(sg, {
              x: S.x + i * S.w + (S.w - 2) / 2, y: S.y + S.h / 2 + (S.fs || 0) * 0.36,
              'text-anchor': 'middle', 'font-size': S.fs, fill: ink,
            }, lab.toUpperCase())
          }
        })
        readings = L!.readX.map(([rx, t]) => {
          const r = el<SVGGElement>('g', { class: 'reading' }, grp)
          if (L!.compact) el('circle', { cx: rx, cy: S.y + S.h / 2, r: 5 }, r)
          else {
            el('circle', { cx: rx, cy: S.y + S.h + 11, r: 6 }, r)
            txt(r, { x: rx, y: S.y + S.h + 33, 'text-anchor': 'middle', 'font-size': 9.5 }, t)
          }
          return r
        })
      }
      grp.addEventListener('click', () => showDetail(k))
      grp.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); showDetail(k) }
      })
      GE[k] = { grp, pips, status }
    })

    const regG = el<SVGGElement>('g', {}, svg)
    regEls = L.regions.map(([x, y, w, h]) => el<SVGRectElement>('rect', { class: 'region', x, y, width: w, height: h, rx: 4 }, regG))

    const R = L.rec
    txt(svg, { class: 'rec-label', x: R.label[0], y: R.label[1], 'font-size': R.label[2] }, R.label[3])
    recwrap = el<SVGGElement>('g', { class: 'recwrap' }, svg)
    ORDER.forEach((k, i) => {
      const x = R.x + i * (R.w + R.gap)
      const c = el<SVGGElement>('g', { class: 'rchip' }, recwrap!)
      el('rect', { x, y: R.y, width: R.w, height: R.h, rx: 3 }, c)
      txt(c, { x: x + R.w / 2, y: R.y + R.h / 2 + R.fs * 0.36, 'text-anchor': 'middle', 'font-size': R.fs }, CHIP[k])
      RC[k] = c
    })
    const O = L.own
    txt(svg, { class: 'rec-label', x: O.label[0], y: O.label[1], 'font-size': O.label[2] }, O.label[3])
    el('rect', { class: 'own-track', x: O.x, y: O.y, width: O.w, height: O.h }, svg)
    ownFill = el<SVGRectElement>('rect', { class: 'own-fill', x: O.x, y: O.y, width: 0, height: O.h }, svg)
    if (O.l1) txt(svg, { class: 'own-lab', x: O.l1[0], y: O.l1[1], 'font-size': O.fs }, O.l1[2])
    if (O.l2) txt(svg, { class: 'own-lab', x: O.l2[0], y: O.l2[1], 'text-anchor': 'end', 'font-size': O.fs }, O.l2[2])

    arc = el<SVGPathElement>('path', { class: 'arc', d: L.arc, 'stroke-width': L.arcW, 'marker-end': 'url(#arrowHead)' }, svg)
    token = el<SVGGElement>('g', { id: 'token' }, svg)
    el('circle', { class: 'halo', r: L.compact ? 12 : 20 }, token)
    el('circle', { class: 'core', r: L.compact ? 5.5 : 9 }, token)
  }
  function setOwner(r: number) { ownFill?.setAttribute('width', String(L!.own.w * r)) }

  // ── the canvas state at each screen ──────────────────────
  interface CanvasState {
    signed: Set<string>; active: string[]; pips: Record<string, number>
    readings: number; owner: number; v2: boolean; setup: boolean
    dim: boolean; reg: number; rec: boolean; started: boolean
  }
  function stateFor(i: number): CanvasState {
    const s: CanvasState = {
      signed: new Set(), active: [], pips: {}, readings: 0, owner: 0,
      v2: false, setup: false, dim: false, reg: -1, rec: false, started: i >= 3,
    }
    const add = (...ks: string[]) => ks.forEach((k) => { s.signed.add(k); s.pips[k] = 4 })
    if (i === 1) { s.setup = true; s.dim = true }
    if (i >= 3) { add('cg'); s.readings = 1; s.owner = 0.08 }
    if (i >= 4) { add('d1'); s.owner = 0.15 }
    if (i >= 5) { add('d2'); s.owner = 0.22 }
    if (i >= 6) { add('d3', 'd4', 'd5', 'd6'); s.readings = 2; s.owner = 0.5 }
    if (i === 7) { s.pips.d7 = 2; s.owner = 0.62 }
    if (i >= 8) { add('d7'); s.v2 = true; s.owner = 0.72 }
    if (i >= 9) { add('d8', 'd9'); s.readings = 3; s.owner = 0.88 }
    if (i >= 10) { add('ho'); s.owner = 1 }
    if (i >= 11) s.rec = true
    s.active = ({ 3: ['cg'], 4: ['d1'], 5: ['d2'], 6: ['d6'], 7: ['d7'], 8: ['d4'], 9: ['d9'], 10: ['ho'] } as Record<number, string[]>)[i] || []
    return s
  }
  const statusText = (k: string, signed: boolean, active: boolean, started: boolean, v2: boolean) =>
    signed ? (k === 'd4' && v2 ? 'SIGNED V2' : 'SIGNED') : (active ? 'OPEN' : (started ? 'LOCKED' : ''))

  function render(s: CanvasState) {
    ORDER.forEach((k) => {
      const e = GE[k]
      const signed = s.signed.has(k)
      const active = s.active.includes(k)
      e.grp.classList.toggle('signed', signed)
      e.grp.classList.toggle('active', active)
      e.grp.classList.remove('reopened', 'wave')
      e.grp.classList.toggle('v2', k === 'd4' && s.v2)
      e.grp.classList.toggle('locked', (s.dim && !active) || (s.started && !signed && !active))
      setPips(k, s.pips[k] || 0)
      if (e.status) e.status.textContent = statusText(k, signed, active, s.started, s.v2)
      RC[k].classList.toggle('signed', signed)
      RC[k].classList.toggle('v2', k === 'd4' && s.v2)
    })
    setupEl?.classList.toggle('active', s.setup)
    readings.forEach((r, i) => r.classList.toggle('on', i < s.readings))
    setOwner(s.owner)
    regEls.forEach((r, i) => r.classList.toggle('on', i === s.reg))
    recwrap?.classList.toggle('glow', s.rec)
    if (arc) arc.style.opacity = '0'
    if (token) token.style.opacity = '0'
  }
  function setPips(k: string, n: number) { GE[k].pips.forEach((p, i) => p.classList.toggle('on', i < n)) }
  function setStatus(k: string, t: string) { if (GE[k].status) GE[k].status!.textContent = t }

  // ── animation ────────────────────────────────────────────
  //
  // HOW FAST, AND WHETHER AT ALL. 17 September 2026. Habib, watching the
  // sequence move between the boxes: "it moves really fast but I can talk to
  // it ... it may be useful to have a level of control on the speed."
  //
  // So every pause in every sequence is multiplied by one number, and one flag
  // holds the sequence where it is. The hold takes effect at the end of the
  // beat that is running rather than in the middle of it, because a signature
  // stamp frozen half drawn looks like a fault, and a presenter who has just
  // pressed hold is about to talk for a minute anyway.
  let run = 0
  let speedFactor = 1
  let held = false
  let releases: (() => void)[] = []
  class Cancel {}

  function setSpeed(factor: number) {
    speedFactor = Number.isFinite(factor) && factor > 0 ? factor : 1
    tell()
  }
  function setHeld(on: boolean) {
    held = !!on
    if (!held) { const waiting = releases; releases = []; waiting.forEach((r) => r()) }
    tell()
  }
  /** Resolves at once unless the sequence is being held. */
  function untilReleased(my: number) {
    if (!held) return Promise.resolve()
    return new Promise<void>((res, rej) => {
      releases.push(() => (my === run ? res() : rej(new Cancel())))
    })
  }
  const waiter = (my: number) => async (ms: number) => {
    await new Promise<void>((res, rej) =>
      setTimeout(() => (my === run ? res() : rej(new Cancel())), reduced ? 0 : ms * speedFactor))
    await untilReleased(my)
  }

  function travel(my: number, a: string, b: string, msAtFullSpeed: number) {
    if (reduced) return Promise.resolve()
    const ms = msAtFullSpeed * speedFactor
    const p0 = ctr(a); const p1 = ctr(b)
    token!.style.opacity = '1'
    SFX.travel()
    return new Promise<void>((res, rej) => {
      const t0 = performance.now()
      function f(t: number) {
        if (my !== run) { rej(new Cancel()); return }
        let u = Math.min(1, (t - t0) / ms)
        u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        token!.setAttribute('transform', `translate(${p0.x + (p1.x - p0.x) * u},${p0.y + (p1.y - p0.y) * u})`)
        if (u < 1) requestAnimationFrame(f)
        else { setTimeout(() => { token!.style.opacity = '0' }, 120); res() }
      }
      requestAnimationFrame(f)
    })
  }
  function openGate(k: string) {
    const e = GE[k]
    e.grp.classList.remove('locked')
    e.grp.classList.add('active')
    setStatus(k, 'OPEN')
  }
  function sign(k: string) {
    const e = GE[k]
    e.grp.classList.add('signed')
    e.grp.classList.remove('reopened')
    setStatus(k, e.grp.classList.contains('v2') ? 'SIGNED V2' : 'SIGNED')
    RC[k].classList.add('signed')
    SFX.sign()
  }
  const deactivate = (k: string) => GE[k].grp.classList.remove('active')

  async function beats(my: number, k: string, ms: number, sync?: boolean) {
    const w = waiter(my)
    for (let i = 1; i <= 4; i++) {
      setPips(k, i)
      SFX.beat()
      if (sync) root.querySelectorAll('#beatList li').forEach((li, j) => li.classList.toggle('on', j < i))
      await w(ms)
    }
    sign(k)
  }

  const ANIM: Record<number, (my: number) => Promise<void>> = {
    2: async (my) => {
      const w = waiter(my)
      const lis = Array.from(root.querySelectorAll('#syncList li'))
      for (let i = 0; i < 5; i++) {
        regEls.forEach((r, j) => r.classList.toggle('on', j === i))
        lis.forEach((l, j) => l.classList.toggle('on', j === i))
        SFX.step()
        await w(1500)
      }
      regEls.forEach((r) => r.classList.remove('on'))
      lis.forEach((l) => l.classList.add('on'))
    },
    3: async (my) => {
      const w = waiter(my)
      ORDER.forEach((k) => { GE[k].grp.classList.add('locked'); setStatus(k, 'LOCKED') })
      openGate('cg'); await w(500); await beats(my, 'cg', 420); await w(300)
      readings[0].classList.add('on'); setOwner(0.08)
    },
    4: async (my) => {
      const w = waiter(my)
      deactivate('cg'); await travel(my, 'cg', 'd1', 800); openGate('d1'); await w(400)
      await beats(my, 'd1', 1400, true); setOwner(0.15)
    },
    5: async (my) => {
      const w = waiter(my)
      deactivate('d1'); await travel(my, 'd1', 'd2', 700); openGate('d2'); await w(300)
      await beats(my, 'd2', 380); setOwner(0.22)
    },
    6: async (my) => {
      const w = waiter(my)
      deactivate('d2')
      let prev = 'd2'
      for (const k of ['d3', 'd4', 'd5', 'd6']) {
        await travel(my, prev, k, 650); openGate(k); await beats(my, k, 190); await w(150)
        if (k !== 'd6') deactivate(k)
        prev = k
        setOwner(({ d3: 0.3, d4: 0.38, d5: 0.45, d6: 0.5 } as Record<string, number>)[k])
      }
      await w(250); readings[1].classList.add('on')
    },
    7: async (my) => {
      const w = waiter(my)
      deactivate('d6'); await travel(my, 'd6', 'd7', 750); openGate('d7'); await w(300)
      setPips('d7', 1); SFX.beat(); await w(500); setPips('d7', 2); SFX.beat(); setOwner(0.62)
    },
    8: async (my) => {
      const w = waiter(my)
      deactivate('d7')
      arc!.style.transition = 'none'
      arc!.style.opacity = '1'
      const len = arc!.getTotalLength()
      arc!.style.strokeDasharray = String(len)
      arc!.style.strokeDashoffset = String(len)
      arc!.getBoundingClientRect()
      arc!.style.transition = 'stroke-dashoffset .9s ease, opacity .4s'
      arc!.style.strokeDashoffset = '0'
      SFX.reopen(); await w(1000)
      const e = GE.d4
      e.grp.classList.remove('signed')
      e.grp.classList.add('reopened', 'active')
      setStatus('d4', 'REOPENED')
      setPips('d4', 0)
      RC.d4.classList.remove('signed')
      await w(1300)
      e.grp.classList.add('v2')
      RC.d4.classList.add('v2')
      for (let i = 1; i <= 4; i++) { setPips('d4', i); SFX.beat(); await w(420) }
      sign('d4'); await w(500)
      arc!.style.opacity = '0'
      deactivate('d4')
      openGate('d7'); setPips('d7', 3); await w(350); setPips('d7', 4); sign('d7'); deactivate('d7'); setOwner(0.72)
    },
    9: async (my) => {
      const w = waiter(my)
      deactivate('d4'); await travel(my, 'd7', 'd8', 700); openGate('d8'); await beats(my, 'd8', 260); deactivate('d8')
      await travel(my, 'd8', 'd9', 600); openGate('d9'); await w(300)
      readings[2].classList.add('on'); SFX.step(); await w(500); await beats(my, 'd9', 260); setOwner(0.88)
    },
    10: async (my) => {
      const w = waiter(my)
      deactivate('d9'); await travel(my, 'd9', 'ho', 900); openGate('ho'); await w(300)
      await beats(my, 'ho', 380); setOwner(1); await w(400); deactivate('ho'); SFX.finale()
      for (const k of ORDER) { GE[k].grp.classList.add('wave'); await w(70) }
      await w(300)
      ORDER.forEach((k) => GE[k].grp.classList.remove('wave'))
    },
  }

  // ── moving between screens ───────────────────────────────
  let cur = 0
  let mode: Mode = 'walk'
  let playTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<(s: WalkthroughState) => void>()

  STEPS.forEach((s, i) => {
    const b = document.createElement('button')
    b.setAttribute('aria-label', (i + 1) + ': ' + s.name)
    b.title = s.name
    b.addEventListener('click', () => { setMode('walk', true); go(i) })
    dots.appendChild(b)
  })

  function chrome(i: number) {
    Array.from(dots.children).forEach((d, j) => {
      if (j === i) d.setAttribute('aria-current', 'step')
      else d.removeAttribute('aria-current')
    })
    const prevBtn = $<HTMLButtonElement>('#prev')
    if (prevBtn) prevBtn.disabled = i === 0
    const nextBtn = $('#next')
    if (nextBtn) nextBtn.textContent = i === STEPS.length - 1 ? 'Start again' : 'Next'
    const num = $('#stepnum')
    if (num) num.textContent = `${pad(i + 1)} / ${pad(STEPS.length)}`
  }
  function paint(i: number) {
    const s = STEPS[i]
    chrome(i)
    if (s.kind === 'scene') {
      app.dataset.kind = 'scene'
      scene.innerHTML = s.scene!()
      scene.scrollTop = 0
      return
    }
    app.dataset.kind = 'canvas'
    const t = s.title!
    narr.innerHTML = `<p class="eyebrow">${s.kicker}<span class="count">${pad(i + 1)} / ${pad(STEPS.length)}</span></p>`
      + `<h2>${t[0]}<em>${t[1]}</em></h2>${s.html!()}`
  }
  async function go(i: number, animate?: boolean) {
    if (i < 0 || i >= STEPS.length) return
    const S = STEPS[i]
    const prevS = STEPS[i - 1]
    const forward = (animate !== false) && i === cur + 1 && !reduced
      && S.kind === 'canvas' && prevS && prevS.kind === 'canvas' && !!ANIM[S.cs!]
    const my = ++run
    cur = i
    paint(i)
    tell()
    if (S.kind === 'canvas') {
      if (forward) {
        render(stateFor(prevS.cs!))
        try { await ANIM[S.cs!](my) } catch (e) { if (!(e instanceof Cancel)) console.error(e) }
        if (my !== run) return
      }
      render(stateFor(S.cs!))
      root.querySelectorAll('#beatList li,#syncList li').forEach((li) => li.classList.add('on'))
    }
    if (my === run && mode === 'play') schedule()
  }
  function next() { SFX.step(); if (cur === STEPS.length - 1) go(0, false); else go(cur + 1) }
  function prev() { go(cur - 1, false) }
  function schedule() {
    if (playTimer) clearTimeout(playTimer)
    playTimer = setTimeout(
      () => { if (mode === 'play' && !held) next() },
      (STEPS[cur].kind === 'scene' ? 5000 : 5200) * speedFactor,
    )
  }

  function setMode(m: Mode, quiet?: boolean) {
    mode = m
    if (playTimer) clearTimeout(playTimer)
    ;([['walk', '#mWalk'], ['explore', '#mExplore'], ['play', '#mPlay']] as [Mode, string][])
      .forEach(([x, id]) => $(id)?.setAttribute('aria-pressed', String(x === m)))
    tell()
    if (quiet) return
    if (m === 'explore') {
      run++
      app.dataset.kind = 'canvas'
      render(stateFor(0))
      narr.innerHTML = `<p class="eyebrow">Explore</p><h2>Select any<em>decision point.</em></h2>`
        + `<p>Each one shows its central question, what it produces, who leads it, and what ${ctx.funder} sees on the record.</p>`
        + `<p class="quiet">Select Set Up at the top for the three questions and the charter.</p>`
        + `<button class="back" id="toWalk">Return to the walkthrough</button>`
      const b = $<HTMLButtonElement>('#toWalk'); if (b) b.onclick = backToWalk
    }
    if (m === 'play') go(cur === STEPS.length - 1 ? 0 : cur, false)
  }
  function backToWalk() { setMode('walk', true); go(cur, false) }
  function detailFrame(inner: string) {
    app.dataset.kind = 'canvas'
    narr.innerHTML = inner + `<button class="back" id="toWalk">Return to the walkthrough</button>`
    const b = $<HTMLButtonElement>('#toWalk'); if (b) b.onclick = backToWalk
    if (L?.compact) narr.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }
  function showDetail(k: string) {
    if (mode !== 'explore') setMode('explore', true)
    run++
    render(stateFor(0))
    ORDER.forEach((x) => GE[x].grp.classList.toggle('active', x === k))
    SFX.step()
    const g = INFO[k]
    detailFrame(`<p class="eyebrow">${g.num || g.name} · ${g.col}</p><h2>${g.name}</h2>`
      + `<span class="tag">${g.lead}</span>${g.fit ? ` <span class="fit ${g.fit[1]}">${g.fit[0]}</span>` : ''}
   <div class="block"><h3>Central question</h3><p>${g.q}</p></div>
   <div class="block"><h3>What it produces</h3><p>${g.out}</p></div>
   <div class="block"><h3>How it closes</h3><p>Evidence, then a written decision, then the chief executive's signature, then the record.</p></div>
   <div class="block"><h3>What ${ctx.funder} receives</h3><p>A report in your inbox once it is signed, and the same record online with the evidence behind it.</p></div>`)
  }
  function showSetup() {
    if (mode !== 'explore') setMode('explore', true)
    run++
    render(stateFor(0))
    setupEl?.classList.add('active')
    SFX.step()
    detailFrame(`<p class="eyebrow">Set up</p><h2>Three questions<em>and the charter.</em></h2>${setupHTML(ctx)}`)
  }

  // ── the controls on the page ─────────────────────────────
  const onNext = () => { if (mode !== 'walk') setMode('walk', true); next() }
  const onPrev = () => { if (mode !== 'walk') setMode('walk', true); prev() }
  $<HTMLButtonElement>('#next')!.onclick = onNext
  $<HTMLButtonElement>('#prev')!.onclick = onPrev
  $<HTMLButtonElement>('#mWalk')!.onclick = backToWalk
  $<HTMLButtonElement>('#mExplore')!.onclick = () => setMode('explore')
  $<HTMLButtonElement>('#mPlay')!.onclick = () => setMode('play')
  $<HTMLButtonElement>('#sound')!.onclick = () => setSound(!soundOn)

  let sx0: number | null = null
  let sy0: number | null = null
  const touchStart = (e: any) => {
    if (e.touches.length !== 1) return
    sx0 = e.touches[0].clientX
    sy0 = e.touches[0].clientY
  }
  const touchEnd = (e: any) => {
    if (sx0 === null) return
    const t = e.changedTouches[0]
    const dx = t.clientX - sx0
    const dy = t.clientY - (sy0 as number)
    sx0 = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (mode !== 'walk') setMode('walk', true)
      if (dx < 0) next(); else prev()
    }
  }
  const swipeAreas = [stage, scene]
  swipeAreas.forEach((area) => {
    area.addEventListener('touchstart', touchStart, { passive: true })
    area.addEventListener('touchend', touchEnd, { passive: true })
  })

  /**
   * The panel on the right, and the scene when a scene is showing. Some
   * screens hold more than fits, and the presenter is at the other end of the
   * room with a phone rather than beside the laptop with a mouse.
   */
  function panel(): HTMLElement {
    return (app.dataset.kind === 'scene' ? scene : narr) as HTMLElement
  }
  function scrollPanel(direction: 1 | -1) {
    const el = panel()
    const step = Math.max(120, Math.round(el.clientHeight * 0.7))
    el.scrollBy({ top: step * direction, behavior: reduced ? 'auto' : 'smooth' })
    // The remote's own arrows light up from this, so it is told straight away
    // rather than after the smooth scroll has finished.
    setTimeout(tell, reduced ? 0 : 420)
  }
  /** Whether there is anything to scroll to, in either direction. */
  function moreToRead() {
    const el = panel()
    const room = el.scrollHeight - el.clientHeight
    return { down: room > 4 && el.scrollTop < room - 4, up: room > 4 && el.scrollTop > 4 }
  }

  function setRoom(r: Room) {
    app.dataset.room = r
    try { localStorage.setItem('gtcv-room', r) } catch {}
    tell()
  }
  try {
    const r = localStorage.getItem('gtcv-room')
    if (r === 'light' || r === 'dark') app.dataset.room = r
  } catch {}

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    const target = e.target as HTMLElement | null
    const onControl = target && target.closest && target.closest('button,.gate,.setup')
    if ((k === 'ArrowRight' || k === 'PageDown') || (k === ' ' && !onControl)) {
      e.preventDefault(); if (mode !== 'walk') setMode('walk', true); next()
    } else if (k === 'ArrowLeft' || k === 'PageUp') {
      e.preventDefault(); if (mode !== 'walk') setMode('walk', true); prev()
    } else if (k === 'Home') { setMode('walk', true); go(0, false) }
    else if (k === 'e' || k === 'E') setMode('explore')
    else if (k === 'p' || k === 'P') setMode(mode === 'play' ? 'walk' : 'play')
    else if (k === 's' || k === 'S') setSound(!soundOn)
    else if (k === 'Escape' && mode !== 'walk') backToWalk()
    else if (k === 'l' || k === 'L') setRoom(app.dataset.room === 'light' ? 'dark' : 'light')
    else if (k === 'f' || k === 'F') {
      try {
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen()
      } catch {}
    }
  }
  document.addEventListener('keydown', onKey)

  const mq = typeof matchMedia === 'function' ? matchMedia(COMPACT_QUERY) : null
  function applyLayout() {
    const want = mq && mq.matches ? TALL : WIDE
    if (L === want) return
    build(want)
    if (mode === 'explore') render(stateFor(0))
    else { run++; go(cur, false) }
  }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', applyLayout)
    else (mq as any).addListener(applyLayout)
  }

  build(mq && mq.matches ? TALL : WIDE)
  if (!reduced) {
    svg.classList.add('intro')
    setTimeout(() => svg.classList.remove('intro'), 1400)
  }
  go(0, false)

  function current(): WalkthroughState {
    return {
      index: cur, total: STEPS.length, name: STEPS[cur]?.name || '',
      mode, sound: soundOn, room: (app.dataset.room === 'light' ? 'light' : 'dark'),
      speed: speedFactor, held, more: moreToRead(),
    }
  }
  function tell() {
    const s = current()
    listeners.forEach((fn) => { try { fn(s) } catch {} })
  }

  // Somebody scrolling the panel with a finger or a wheel changes what the
  // remote should be offering, so the panel says when it has been moved.
  const onScroll = () => tell()
  narr.addEventListener('scroll', onScroll, { passive: true })
  scene.addEventListener('scroll', onScroll, { passive: true })

  return {
    go: (i, animate) => { setMode('walk', true); go(i, animate === undefined ? false : animate) },
    next: onNext,
    prev: onPrev,
    setMode: (m) => (m === 'walk' ? backToWalk() : setMode(m)),
    setSound,
    setRoom,
    setSpeed,
    setHeld,
    scrollPanel,
    state: current,
    onState: (fn) => { listeners.add(fn); fn(current()); return () => { listeners.delete(fn) } },
    steps: () => STEPS,
    destroy() {
      run++
      held = false
      releases = []
      narr.removeEventListener('scroll', onScroll)
      scene.removeEventListener('scroll', onScroll)
      if (playTimer) clearTimeout(playTimer)
      document.removeEventListener('keydown', onKey)
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', applyLayout)
        else (mq as any).removeListener(applyLayout)
      }
      swipeAreas.forEach((area) => {
        area.removeEventListener('touchstart', touchStart)
        area.removeEventListener('touchend', touchEnd)
      })
      listeners.clear()
    },
  }
}
