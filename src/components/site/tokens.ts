// ============================================================
// THE APPROVED DESIGN, AS TOKENS AND ONE STYLESHEET.
//
// Sampled from Habib's own brand assets and reviewed. Substituting a value
// here changes the approved design, so do not.
//
// THREE RULES THAT LOOK LIKE PREFERENCES AND ARE NOT.
//
//   Body copy never goes below 17px. It was set after a specific complaint
//   that the text was too small to read.
//
//   No border radius and no shadows anywhere. The design is hard edged and
//   2px gaps between colour blocks; a rounded corner reads as a different
//   site.
//
//   No heading gets a max-width. A width cap in ch units resolves narrower
//   than the display type needs and orphans two word lines. Headings break
//   one sentence per line using a block span instead.
//
// The four canvas column colours carry meaning: gold is internal capability,
// navy the connecting layer, teal the external market, purple the threshold.
//
// #00ffff never returns. Habib's LinkedIn banner uses pure cyan; it fails
// contrast and vibrates against navy. Everything is #00afef.
// ============================================================

export const C = {
  ink: '#12222c',
  inkDeep: '#0b1620',
  navy: '#1b2a41',
  /** Hero only. It is the portrait's own backdrop, and a seam shows if it differs. */
  photoBg: '#121213',
  cyan: '#00afef',
  cream: '#f5f5dc',
  creamWarm: '#fffdf5',
  slate: '#4a5560',
  teal: '#00767a',
  gold: '#c9a84c',
  purple: '#6b4a8b',
  green: '#2e7d32',
} as const

export const SITE_CSS = `
.hb{
  --ink:${C.ink}; --ink-deep:${C.inkDeep}; --navy:${C.navy}; --photo-bg:${C.photoBg};
  --cyan:${C.cyan}; --cream:${C.cream}; --cream-warm:${C.creamWarm}; --slate:${C.slate};
  --teal:${C.teal}; --gold:${C.gold}; --purple:${C.purple}; --green:${C.green};
  --f:'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif;
  background:var(--ink); color:var(--cream);
  font-family:var(--f); line-height:1.5; overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
}
.hb *{box-sizing:border-box}
.hb img{max-width:100%}
.hb a{color:inherit}

/* Layout. 1440 content, 40px gutters, hard edges, 2px between colour blocks. */
.hb .wrap{max-width:1440px;margin:0 auto;padding:0 40px}
.hb section{padding:112px 0}
.hb .band{padding:0}

/* Type scale. The minimums matter. */
.hb h1{font-size:clamp(48px,7.4vw,116px);font-weight:700;letter-spacing:-0.045em;line-height:0.92;margin:0}
.hb h2{font-size:clamp(34px,5.2vw,78px);font-weight:700;letter-spacing:-0.04em;line-height:1.02;margin:0}
.hb h3{font-size:clamp(26px,3.1vw,40px);font-weight:600;letter-spacing:-0.02em;line-height:1.1;margin:0}
.hb h4{font-size:clamp(20px,2vw,26px);font-weight:600;line-height:1.2;margin:0}
.hb p{margin:0;font-size:19px;line-height:1.6}
.hb .lede{font-size:clamp(21px,1.8vw,27px);line-height:1.45}
.hb .eyebrow{font-size:14.5px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin:0}
.hb .small{font-size:17px;line-height:1.6}
.hb .cite{font-size:13.5px;line-height:1.5;opacity:0.62}
.hb .cite a{text-decoration:underline;text-underline-offset:2px}

/* Buttons. No radius. */
.hb .btn{
  display:inline-block;font-family:var(--f);font-size:18px;font-weight:600;
  padding:17px 32px;border:2px solid transparent;cursor:pointer;text-decoration:none;
  background:var(--cyan);color:var(--ink);
}
.hb .btn.ghost{background:transparent;border-color:currentColor}
.hb .btn:focus-visible{outline:3px solid var(--gold);outline-offset:3px}

/* Marquee. Pure CSS, no scroll listeners. */
.hb .mq{overflow:hidden;white-space:nowrap;display:flex}
.hb .mq-track{display:flex;flex:0 0 auto;animation:hbmq 34s linear infinite}
@keyframes hbmq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.hb .mq-item{display:flex;align-items:center;gap:34px;padding:0 34px;flex:0 0 auto}

/* Scroll reveal. Fails open: see useReveal. */
.hb [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}
.hb [data-reveal='in']{opacity:1;transform:none}

@media (prefers-reduced-motion:reduce){
  .hb .mq-track{animation:none}
  .hb [data-reveal]{opacity:1;transform:none;transition:none}
}

@media (max-width:900px){
  .hb .wrap{padding:0 22px}
  .hb section{padding:72px 0}
  .hb p{font-size:18px}
}
@media (max-width:560px){
  .hb .btn{display:block;width:100%;text-align:center}
}
`
