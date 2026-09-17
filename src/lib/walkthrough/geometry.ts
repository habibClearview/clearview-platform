// ============================================================
// WHERE EVERY BOX SITS.
//
// Copied coordinate for coordinate from the approved reference. Two layouts:
// the wide one for a projector and a laptop, and the tall one for a phone or a
// tablet held upright. Nothing here is calculated, because the approved design
// is these numbers and a formula that produced nearly the same numbers would be
// a different design.
//
// The column bar labels and the readiness stage names are not here. They come
// from ClearView, through canvas-words.ts, so renaming a column in ClearView
// renames it on the walkthrough.
// ============================================================
import { COLUMN_BARS } from './canvas-words'

export interface Layout {
  /** The SVG view box: everything below is in these units. */
  vb: [number, number]
  compact: boolean
  /** x, y, width, height for each of the eleven boxes. */
  G: Record<string, [number, number, number, number]>
  setup: [number, number, number, number]
  setupT: { t1: [number, number, number]; t2: [number, number, number, string] }
  headers: [string, number, number, string, string][]
  hdrY: number
  hdrH: number
  hdrSize: number
  regions: [number, number, number, number][]
  arc: string
  arcW: number
  rec: { label: [number, number, number, string]; x: number; y: number; w: number; h: number; gap: number; fs: number }
  own: {
    label: [number, number, number, string]
    x: number; y: number; w: number; h: number
    l1?: [number, number, string]
    l2?: [number, number, string]
    fs: number
  }
  scale: { x: number; y: number; w: number; h: number; fs?: number; labels: boolean }
  readX: [number, string][]
}

/** The column bars: ClearView's names, the reference's colours and widths. */
const wideHeaders = (): [string, number, number, string, string][] => [
  [COLUMN_BARS[0][0].toUpperCase(), 170, 280, COLUMN_BARS[0][1], COLUMN_BARS[0][2]],
  [COLUMN_BARS[1][0].toUpperCase(), 460, 280, COLUMN_BARS[1][1], COLUMN_BARS[1][2]],
  [COLUMN_BARS[2][0].toUpperCase(), 750, 280, COLUMN_BARS[2][1], COLUMN_BARS[2][2]],
]

/**
 * On a phone the three bars are 120 wide, so they carry the first word of each
 * column name rather than a squeezed version of the whole one.
 */
const tallHeaders = (): [string, number, number, string, string][] => [
  [COLUMN_BARS[0][0].split(' ')[0].toUpperCase(), 8, 120, COLUMN_BARS[0][1], COLUMN_BARS[0][2]],
  [COLUMN_BARS[1][0].split(' ')[0].toUpperCase(), 140, 120, COLUMN_BARS[1][1], COLUMN_BARS[1][2]],
  [COLUMN_BARS[2][0].split(' ')[0].toUpperCase(), 272, 120, COLUMN_BARS[2][1], COLUMN_BARS[2][2]],
]

export const WIDE: Layout = {
  vb: [1200, 780],
  compact: false,
  G: {
    cg: [20, 74, 130, 586], d1: [170, 104, 280, 160], d2: [460, 104, 280, 160], d3: [750, 104, 280, 160],
    d4: [170, 274, 280, 160], d6: [460, 274, 280, 160], d5: [750, 274, 280, 160],
    d7: [170, 446, 425, 120], d8: [605, 446, 425, 120], d9: [170, 578, 860, 82], ho: [1050, 74, 130, 586],
  },
  setup: [20, 14, 1160, 44],
  setupT: {
    t1: [40, 41, 12],
    t2: [122, 42, 15, 'Three questions for the chief executive  ·  Engagement Charter, signed at inception'],
  },
  headers: wideHeaders(),
  hdrY: 70, hdrH: 26, hdrSize: 11,
  regions: [[164, 66, 292, 374], [454, 66, 292, 374], [744, 66, 292, 374], [164, 440, 872, 132], [164, 572, 872, 94]],
  arc: 'M 214 520 C 128 505, 128 372, 204 356',
  arcW: 3.5,
  rec: { label: [20, 696, 11, 'THE RECORD · SIGNED DECISIONS'], x: 20, y: 708, w: 48, h: 30, gap: 8, fs: 11 },
  own: {
    label: [680, 696, 11, 'WHO LEADS THE WORK'],
    x: 680, y: 712, w: 500, h: 16,
    l1: [680, 752, 'COACH LEADS'], l2: [1180, 752, 'ORGANISATION LEADS'], fs: 10.5,
  },
  scale: { x: 562, y: 596, w: 108, h: 20, fs: 7.6, labels: true },
  readX: [[615, 'KICK-OFF'], [723, 'MID-POINT'], [831, 'CLOSE']],
}

export const TALL: Layout = {
  vb: [400, 598],
  compact: true,
  G: {
    cg: [8, 46, 384, 40], d1: [8, 106, 120, 100], d2: [140, 106, 120, 100], d3: [272, 106, 120, 100],
    d4: [8, 214, 120, 100], d6: [140, 214, 120, 100], d5: [272, 214, 120, 100],
    d7: [8, 322, 188, 70], d8: [204, 322, 188, 70], d9: [8, 400, 384, 50], ho: [8, 458, 384, 40],
  },
  setup: [8, 6, 384, 32],
  setupT: { t1: [18, 27, 9], t2: [74, 27, 11, 'Three questions  ·  Engagement Charter'] },
  headers: tallHeaders(),
  hdrY: 91, hdrH: 12, hdrSize: 7,
  regions: [[4, 92, 128, 226], [136, 92, 128, 226], [268, 92, 128, 226], [4, 318, 392, 78], [4, 396, 392, 58]],
  arc: 'M 34 352 C 6 336, 6 290, 30 272',
  arcW: 3,
  rec: { label: [8, 520, 8, 'THE RECORD'], x: 8, y: 526, w: 31, h: 22, gap: 4, fs: 8.5 },
  own: {
    label: [8, 572, 8, 'WHO LEADS'],
    x: 8, y: 580, w: 384, h: 10,
    l2: [392, 572, 'COACH  →  ORGANISATION'], fs: 8,
  },
  scale: { x: 168, y: 420, w: 50, h: 10, labels: false },
  readX: [[182, ''], [235, ''], [305, '']],
}

/** When the tall layout takes over. Copied from the reference. */
export const COMPACT_QUERY = '(max-width: 720px), (orientation: portrait) and (max-width: 1100px)'
