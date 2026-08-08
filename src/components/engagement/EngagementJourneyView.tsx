// @ts-nocheck
'use client'
// ============================================================
// VIEW: the client journey canvas, rendered at /engagement/[slug]
//       and inside the coach dashboard
// The client journey canvas: the Grant-to-Commercial Viability Canvas laid
// out Business Model Canvas style (three coloured column headers, the DP
// boxes with question + bullets + fit tag, the transition row, the full width
// diagnostic spine, the progression path and the live status dots).
//
// The nine-block METHOD content is fixed IP, identical for every engagement
// (the same way INDEPENDENCE_TESTS is a constant). Only the names and the live
// gate status are configuration: the client (beneficiary), the funder and the
// programme come from loadEngagementView, and every status dot is read from
// the real canvas gate status. Nothing here is hardcoded to any one client.
//
// Fees and payments live in a separate, private view and never appear here.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadEngagementView } from '@/lib/engagement-loader'
import { CANVAS_DP_IDS } from '@/lib/engagement-types'
import BlockWorkspace, { hasWorkspace } from '@/components/gtcv/BlockWorkspace'
import { BLOCK } from '@/lib/gtcv-blocks'

// ─── Scoped design CSS (faithful to the approved preview) ────
// Scoped under .gj so the tokens, pseudo-elements and media queries reproduce
// the approved design without touching global styles.
const CSS = `
.gj{
  --paper:#EDE6D6; --card:#FBF7EE; --box:#FFFDF8;
  --ink:#1B2A41; --ink-soft:#4C5A6B; --ink-faint:#8B8272;
  --line:rgba(27,42,65,.18); --line-soft:rgba(27,42,65,.09);
  --gold:#B7791F; --navy:#22344F; --teal:#00767A; --purple:#6B4A8B;
  --good:#2E7D32; --now:#B7791F; --idle:#BDB4A0;
  --spine:#1B2A41; --spine-ink:#EFEADD;
  --shadow:0 1px 2px rgba(27,42,65,.05), 0 10px 30px rgba(27,42,65,.09);
  --fd:Georgia,"Times New Roman",serif;
  --fb:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;
  --fm:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  background:var(--paper);color:var(--ink);font-family:var(--fb);line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .gj{
  --paper:#0B1420; --card:#111E31; --box:#16243A;
  --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
  --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.08);
  --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
  --good:#6FBF73; --now:#E0B15A; --idle:#41505f;
  --spine:#0A1422; --spine-ink:#EDF2F8;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
}}
:root[data-theme="dark"] .gj{
  --paper:#0B1420; --card:#111E31; --box:#16243A;
  --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
  --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.08);
  --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
  --good:#6FBF73; --now:#E0B15A; --idle:#41505f;
  --spine:#0A1422; --spine-ink:#EDF2F8;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
}
.gj *{box-sizing:border-box}
.gj .wrap{max-width:1220px;margin:0 auto;padding:0 20px 64px}
.gj .top{background:var(--spine);color:var(--spine-ink)}
.gj .top-in{max-width:1220px;margin:0 auto;padding:13px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.gj .brand{display:flex;flex-direction:column;line-height:1.1}
.gj .brand .k{font-family:var(--fm);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.gj .brand .w{font-family:var(--fd);font-size:21px}
.gj .tag{font-family:var(--fm);font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;border:1px dashed rgba(239,234,221,.4);border-radius:999px;padding:4px 10px}
.gj .hero{padding:30px 0 8px}
.gj .eyebrow{font-family:var(--fm);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal);margin:0 0 8px}
.gj .hero h1{font-family:var(--fd);font-weight:600;font-size:clamp(26px,4.4vw,40px);line-height:1.06;margin:0;text-wrap:balance}
.gj .hero p{margin:12px 0 0;font-size:15px;color:var(--ink-soft);max-width:64ch}
.gj .hero p b{color:var(--ink)}
.gj .path-scroll{overflow-x:auto;padding:8px 2px 12px;margin-top:20px}
.gj .path{position:relative;display:flex;justify-content:space-between;gap:6px;min-width:640px}
.gj .path::before{content:"";position:absolute;left:15px;right:15px;top:18px;height:3px;background:var(--idle);border-radius:2px}
.gj .path .fill{position:absolute;left:15px;top:18px;height:3px;background:linear-gradient(90deg,var(--gold),var(--teal));border-radius:2px}
.gj .stop{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:40px}
.gj .node{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:2.5px solid var(--idle);color:var(--ink-faint);font-size:16px;font-family:var(--fm);font-weight:700}
.gj .stop.done .node{background:var(--good);border-color:var(--good);color:#fff}
.gj .stop.now .node{border-color:var(--now);color:var(--now);box-shadow:0 0 0 5px rgba(183,121,31,.16);animation:gjpulse 2.4s ease-in-out infinite}
.gj .stop .lab{font-family:var(--fm);font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-faint);text-align:center}
.gj .stop.now .lab{color:var(--now);font-weight:700}
@keyframes gjpulse{0%,100%{box-shadow:0 0 0 5px rgba(183,121,31,.16)}50%{box-shadow:0 0 0 9px transparent}}
@media (prefers-reduced-motion:reduce){.gj .stop.now .node{animation:none}}
.gj .st{display:flex;align-items:baseline;gap:12px;margin:30px 0 10px;flex-wrap:wrap}
.gj .st h2{font-family:var(--fd);font-weight:600;font-size:22px;margin:0}
.gj .st p{margin:0;color:var(--ink-soft);font-size:13.5px}
.gj .canvas-scroll{overflow-x:auto;padding-bottom:8px}
.gj .bmc{min-width:960px;background:var(--card);border:1.5px solid var(--ink);border-radius:14px;box-shadow:var(--shadow);padding:16px;display:flex;flex-direction:column;gap:10px}
.gj .bmc-title{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--line-soft)}
.gj .bmc-title .t{font-family:var(--fd);font-size:22px;font-weight:600}
.gj .bmc-title .s{font-size:12px;color:var(--ink-soft);margin-top:2px}
.gj .bmc-title .meta{font-family:var(--fm);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);text-align:right}
.gj .headbars{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.gj .hb{padding:8px;text-align:center;font-family:var(--fm);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;border-radius:7px}
.gj .hb.internal{background:var(--gold)} .gj .hb.connect{background:var(--navy)} .gj .hb.external{background:var(--teal)}
.gj .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.gj .box{--edge:var(--navy);background:var(--box);border:1px solid var(--line);border-top:3px solid var(--edge);border-radius:9px;padding:11px 12px 12px;display:flex;flex-direction:column}
.gj .c-gold{--edge:var(--gold)} .gj .c-navy{--edge:var(--navy)} .gj .c-teal{--edge:var(--teal)} .gj .c-purple{--edge:var(--purple)}
.gj .tagrow{display:flex;align-items:center;gap:8px}
.gj .dptag{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.05em;color:#fff;background:var(--edge);border-radius:4px;padding:2px 7px}
.gj .sublab{font-family:var(--fm);font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-faint)}
.gj .sdot{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-family:var(--fm);font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}
.gj .sdot i{width:8px;height:8px;border-radius:50%;background:var(--idle)}
.gj .box.done .sdot{color:var(--good)} .gj .box.done .sdot i{background:var(--good)}
.gj .box.now .sdot{color:var(--now)} .gj .box.now .sdot i{background:var(--now)}
.gj .box.blocked .sdot{color:#C62828} .gj .box.blocked .sdot i{background:#C62828}
.gj .box h4{font-family:var(--fd);font-weight:600;font-size:14.5px;margin:9px 0 0;line-height:1.15}
.gj .box .q{font-style:italic;font-size:11.5px;color:var(--ink-soft);margin:6px 0 0;line-height:1.35}
.gj .box ul{margin:9px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.gj .box li{position:relative;padding-left:13px;font-size:11px;color:var(--ink-soft);line-height:1.35}
.gj .box li::before{content:"-";position:absolute;left:0;color:var(--edge);font-weight:700}
.gj .fit{margin-top:11px;font-family:var(--fm);font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--edge);border-radius:4px;padding:4px 8px;align-self:flex-start}
.gj .trans-l{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);text-align:center;padding:6px 0 0}
.gj .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gj .spine-box{background:var(--spine);color:var(--spine-ink);border-radius:10px;padding:14px 16px;border:1px solid var(--line)}
.gj .spine-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.gj .spine-head .dptag{background:var(--teal);color:#04222a}
.gj .spine-lab{font-family:var(--fm);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(239,234,221,.7)}
.gj .spine-box h4{font-family:var(--fd);font-size:16px;margin:8px 0 0}
.gj .spine-box .q{font-style:italic;font-size:12px;color:rgba(239,234,221,.85);margin:5px 0 0}
.gj .stages{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.gj .stage{font-family:var(--fm);font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;padding:4px 9px}
.gj .stage.s1{background:var(--gold);color:#2a1c04} .gj .stage.s2{background:#3E6E72;color:#eafcff}
.gj .stage.s3{background:var(--teal);color:#04222a} .gj .stage.s4{background:#2E7D32;color:#eafce9}
.gj .fits{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}
.gj .fitc{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:9px}
.gj .fitc .fn{font-family:var(--fm);font-size:8.5px;letter-spacing:.06em;color:var(--teal)}
.gj .fitc .ft{font-family:var(--fd);font-size:12px;margin:3px 0 4px}
.gj .fitc .fdz{font-size:10px;color:rgba(239,234,221,.72);line-height:1.35}
.gj .legend{display:flex;flex-wrap:wrap;gap:18px;margin:20px 2px 0;font-size:12.5px;color:var(--ink-soft)}
.gj .legend span{display:inline-flex;align-items:center;gap:8px}
.gj .legend i{width:12px;height:12px;border-radius:50%;display:inline-block}
.gj .foot{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);text-align:center;color:var(--ink-faint);font-size:12px}
.gj .foot .tm{font-family:var(--fd);color:var(--ink-soft)}
@media (max-width:720px){ .gj .fits{grid-template-columns:repeat(2,1fr)} }
`

// ─── Method content (fixed IP, client-agnostic) ─────────────
// The nine building blocks in their real canvas positions. Same for every
// engagement; only names and gate status are configuration.
const STOPS = [
  { id: 'setup', lab: 'Set up', kind: 'symbol' },
  { id: 'phase_0', lab: 'Clear ground', kind: 'symbol' },
  { id: 'dp01', lab: 'Audit', glyph: '1' },
  { id: 'dp02', lab: 'Customer', glyph: '2' },
  { id: 'dp03', lab: 'Value', glyph: '3' },
  { id: 'dp04', lab: 'Viability', glyph: '4' },
  { id: 'dp05', lab: 'Market', glyph: '5' },
  { id: 'dp06', lab: 'Identity', glyph: '6' },
  { id: 'dp07', lab: 'Pilot', glyph: '7' },
  { id: 'dp08', lab: 'Scale', glyph: '8' },
  { id: 'dp09', lab: 'Readiness', glyph: '9' },
  { id: 'handover', lab: 'Hand over', glyph: '★' },
]


const SPINE = {
  title: 'Commercial Readiness Diagnostic',
  q: 'Where does this organisation sit on the journey from grant-dependency to commercial viability, right now?',
  stages: [
    { c: 's1', label: 'Grant-dependent' },
    { c: 's2', label: 'Commercially aware' },
    { c: 's3', label: 'Market-ready' },
    { c: 's4', label: 'Commercially viable' },
  ],
  fits: [
    { n: 'Fit 01', t: 'Problem-Provider Fit', d: 'Do we have the capability and credibility to own this problem in this market?' },
    { n: 'Fit 02', t: 'Problem-Solution Fit', d: 'Does the service solve the problem as the client experiences it, not as we describe it?' },
    { n: 'Fit 03', t: 'Solution-Problem Owner Fit', d: 'Is it designed to reach a decision-maker with budget, not the beneficiary without it?' },
    { n: 'Fit 04', t: 'Solution-Pilot Fit', d: 'Is the service testable in a real client environment within the engagement timeline?' },
    { n: 'Fit 05', t: 'Solution-Market Fit', d: 'Is there willingness to pay at a price that covers full delivery cost?' },
    { n: 'Fit 06', t: 'Solution-Scale Channel Fit', d: 'Are there channels and partnerships to carry this beyond the founding clients?' },
  ],
}

// The status word shown in each DP box, from the live gate status.
function statusWord(s) {
  return s === 'complete' ? 'Done' : s === 'in_progress' ? 'Now' : s === 'blocked' ? 'Blocked' : 'Not yet'
}
// Extra box class from the live gate status (drives the coloured status dot).
function boxStateClass(s, isCurrent) {
  if (s === 'complete') return 'done'
  if (s === 'in_progress' || isCurrent) return 'now'
  if (s === 'blocked') return 'blocked'
  return ''
}

function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#EDE6D6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: '1.1rem', color: '#1B2A41' }}>
      Loading the journey...
    </div>
  )
}

function Message({ title, body }) {
  return (
    <div style={{ minHeight: '100vh', background: '#EDE6D6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI',system-ui,sans-serif", padding: '2rem' }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.3rem', fontWeight: 700, color: '#1B2A41', marginBottom: '0.6rem' }}>{title}</div>
        <div style={{ color: '#4C5A6B', fontSize: '0.95rem' }}>{body}</div>
      </div>
    </div>
  )
}

export default function EngagementJourneyView({ slugOverride }: any = {}) {
  const params = useParams()
  const slug = (slugOverride || params?.slug) as string
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [view, setView] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // Which block the coach has opened, and the in flight gate change.
  const [openDp, setOpenDp] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  async function setGate(dpId, status, label) {
    setSaving(status)
    setFlash(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/gate-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ clientId: view.client.id, dpId, status, label }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out?.error || 'Could not update this block')
      const v = await loadEngagementView(slug)
      setView(v)
      setFlash('Saved.')
    } catch (e: any) {
      setFlash(e?.message || 'Could not update this block')
    } finally {
      setSaving(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setHasSession(false); setChecking(false); return }
      setHasSession(true)
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single()
      if (cancelled) return
      setRole(profile?.role || null)
      const v = await loadEngagementView(slug)
      if (cancelled) return
      setView(v)
      setChecking(false)
    }
    init().catch((e) => { if (!cancelled) { setError(e?.message || 'Something went wrong'); setChecking(false) } })
    return () => { cancelled = true }
  }, [slug])

  if (checking) return <Loading />
  if (!hasSession) return <Message title="Please sign in" body="Open this journey from your Clearview dashboard, or sign in to view it." />
  if (error) return <Message title="Could not load this journey" body={error} />
  if (!view) return <Message title="Journey not found" body="This engagement could not be found, or you do not have access to it." />

  const beneficiary = view.client?.name || 'the organisation'
  const funderParty = (view.parties || []).find((p) => p.party_role === 'client_funder') || (view.parties || []).find((p) => p.party_role === 'funder_rep')
  const funder = funderParty?.organisation || funderParty?.name || null
  const programme = view.programme_name || null
  const metaLine = [beneficiary, programme].filter(Boolean).join(' · ')
  const termPrefix = view.config?.terminology === 'zone' ? 'ZONE' : 'DP'

  const gs = view.gate_status || {}
  const currentId = view.current_dp_id

  // Progression path: done count + fill width up to the current/last-done stop.
  const doneCount = CANVAS_DP_IDS.filter((id) => gs[id] === 'complete').length
  let fillIdx = STOPS.findIndex((s) => s.id === currentId)
  if (fillIdx < 0) {
    // No explicit "now" stop: fill to the last completed stop.
    for (let i = STOPS.length - 1; i >= 0; i--) { if (gs[STOPS[i].id] === 'complete') { fillIdx = i; break } }
  }
  const fillPct = fillIdx <= 0 ? (doneCount > 0 ? 4 : 0) : (fillIdx / (STOPS.length - 1)) * 100

  const box = (dpId) => {
    const b = BLOCK[dpId]
    const s = gs[dpId] || 'not_started'
    const isCurrent = dpId === currentId
    const cls = ['box', b.color, boxStateClass(s, isCurrent)].filter(Boolean).join(' ')
    const label = `${termPrefix} ${dpId.replace('dp', '')}`
    return (
      <article
        className={cls}
        role="button"
        tabIndex={0}
        title="Open this block"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpenDp(dpId)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenDp(dpId) } }}
      >
        <div className="tagrow">
          <span className="dptag">{label}</span>
          <span className="sublab">{b.sublab}</span>
          <span className="sdot"><i></i>{statusWord(s)}</span>
        </div>
        <h4>{b.title}</h4>
        <p className="q">&quot;{b.q}&quot;</p>
        <ul>{b.bullets.map((li, i) => <li key={i}>{li}</li>)}</ul>
        <span className="fit">{b.fit}</span>
      </article>
    )
  }

  const spineState = gs['dp09'] || 'not_started'

  return (
    <div className="gj">
      {view.load_errors && view.load_errors.length > 0 ? (
          <div role="status" style={{
            margin: '0 auto 14px', maxWidth: 1180, padding: '10px 14px', borderRadius: 10,
            border: '1px solid #B7791F', background: '#FFF8E8', color: '#5A4412',
            fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: 13.5,
          }}>
            Part of this engagement could not be loaded ({view.load_errors.join(', ')}), so what you
            see below may be incomplete. Reload before treating it as the record.
          </div>
        ) : null}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="top">
        <div className="top-in">
          <div className="brand"><span className="k">The Canvas Coach</span><span className="w">The Journey</span></div>
          {funder ? <span className="tag">With {funder}</span> : null}
        </div>
      </header>

      <div className="wrap">

        <section className="hero">
          <p className="eyebrow">The engagement, on one canvas</p>
          <h1>{beneficiary}&rsquo;s journey from grant-funded to standing on its own.</h1>
          <p>
            A shared, visual picture for everyone involved, <b>{beneficiary}</b>&rsquo;s team walking the path
            {funder ? <> and <b>{funder}</b> watching it progress</> : null}. The nine blocks are worked in order; each is a decision gate that only opens once the work behind it is real.
          </p>
        </section>

        <div className="path-scroll"><div className="path">
          <span className="fill" style={{ width: `${fillPct}%` }}></span>
          {STOPS.map((s) => {
            const st = gs[s.id] || 'not_started'
            const done = st === 'complete'
            const now = s.id === currentId
            const cls = ['stop', done ? 'done' : '', now ? 'now' : ''].filter(Boolean).join(' ')
            const content = s.kind === 'symbol' ? (done ? '✓' : '·') : s.glyph
            return (
              <div className={cls} key={s.id}>
                <span className="node">{content}</span>
                <span className="lab">{s.lab}</span>
              </div>
            )
          })}
        </div></div>

        <div className="st"><h2>The canvas</h2><p>the nine building blocks in their real positions, worked in order, each with its decision gate</p></div>

        <div className="canvas-scroll">
          <div className="bmc">

            <div className="bmc-title">
              <div>
                <div className="t">Grant-to-Commercial Viability Canvas&trade;</div>
                <div className="s">A structured route from grant-funded organisation to commercial sustainability</div>
              </div>
              <div className="meta">{metaLine}<br />The Canvas Coach · habibonifade.com</div>
            </div>

            <div className="headbars">
              <div className="hb internal">&larr; Internal capability</div>
              <div className="hb connect">Connecting layer</div>
              <div className="hb external">External market &rarr;</div>
            </div>

            <div className="row3">{box('dp01')}{box('dp02')}{box('dp03')}</div>
            <div className="row3">{box('dp04')}{box('dp06')}{box('dp05')}</div>

            <div className="trans-l">Transition row · where the model is tested with real customers, then extended</div>
            <div className="row2">{box('dp07')}{box('dp08')}</div>

            <div className={['spine-box', boxStateClass(spineState, false)].filter(Boolean).join(' ')}>
              <div className="spine-head">
                <div>
                  <span className="dptag">{termPrefix} 09</span>
                  <span className="spine-lab">&nbsp;Diagnostic spine · full width · kick-off · mid-point · close</span>
                  <h4>{SPINE.title}</h4>
                  <p className="q">&quot;{SPINE.q}&quot;</p>
                </div>
              </div>
              <div className="stages">
                {SPINE.stages.map((s) => <span className={`stage ${s.c}`} key={s.c}>{s.label}</span>)}
              </div>
              <div className="fits">
                {SPINE.fits.map((f) => (
                  <div className="fitc" key={f.n}>
                    <div className="fn">{f.n}</div>
                    <div className="ft">{f.t}</div>
                    <div className="fdz">{f.d}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <div className="legend" aria-label="What the colours mean">
          <span><i style={{ background: 'var(--good)' }}></i> Done, gate cleared</span>
          <span><i style={{ background: 'var(--now)' }}></i> In progress, where we are now</span>
          <span><i style={{ background: 'var(--idle)' }}></i> Not started yet</span>
        </div>

        <div className="foot">
          <p className="tm">Grant-to-Commercial Viability Canvas&trade; · The Canvas Coach · habibonifade.com</p>
          <p>Click any block to open it. The same canvas serves any client, names and content are configuration. Fees and payments live in a separate, private view and never appear here.</p>
        </div>

      </div>

      {openDp ? (() => {
        const b = BLOCK[openDp]
        const s = gs[openDp] || 'not_started'
        const canManage = role === 'super_coach' || role === 'coach'
        // The evidence this gate must produce, from the confirmed mapping.
        const evidence = (view.gate_map || []).filter((m) => m.dp_id === openDp)
        const OPTIONS = [
          ['not_started', 'Not started'],
          ['in_progress', 'In progress'],
          ['evidence_submitted', 'Evidence submitted'],
          ['complete', 'Complete'],
          ['needs_revisiting', 'Needs revisiting'],
        ]
        const closeDrawer = () => { setOpenDp(null); setFlash(null) }
        return (
          // The overlay is a backdrop, not a control, so it is marked
          // presentational and the dialog beside it carries the role. Escape
          // closes it, because a drawer a keyboard user cannot dismiss is a
          // drawer that traps them.
          <div
            role="presentation"
            onClick={closeDrawer}
            onKeyDown={(e) => { if (e.key === 'Escape') closeDrawer() }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(11,20,32,.55)', zIndex: 60,
              display: 'flex', justifyContent: 'flex-end',
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${b.title}, decision block`}
              tabIndex={-1}
              ref={(el) => { if (el) el.focus() }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Escape') closeDrawer() }}
              style={{
                outline: 'none',
                width: 'min(560px, 100%)', height: '100%', overflowY: 'auto',
                background: 'var(--card)', color: 'var(--ink)', padding: '22px 24px 40px',
                boxShadow: '-12px 0 40px rgba(0,0,0,.25)', fontFamily: 'var(--fb)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dptag" style={{ background: 'var(--navy)' }}>
                  {termPrefix} {openDp.replace('dp', '')}
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  {statusWord(s)}
                </span>
                <button
                  type="button"
                  onClick={() => { setOpenDp(null); setFlash(null) }}
                  style={{ marginLeft: 'auto', border: '1px solid var(--line)', background: 'var(--box)', color: 'var(--ink)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
                >Close</button>
              </div>

              <h2 style={{ fontFamily: 'var(--fd)', fontSize: 24, margin: '14px 0 0', lineHeight: 1.15 }}>{b.title}</h2>
              <p style={{ fontStyle: 'italic', color: 'var(--ink-soft)', margin: '8px 0 0', fontSize: 15 }}>&quot;{b.q}&quot;</p>

              <h3 style={{ fontFamily: 'var(--fm)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--teal)', margin: '22px 0 8px' }}>What this block does</h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6 }}>
                {b.bullets.map((li, i) => <li key={i}>{li}</li>)}
              </ul>

              <h3 style={{ fontFamily: 'var(--fm)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--teal)', margin: '22px 0 8px' }}>Evidence this gate needs</h3>
              {evidence.length === 0 ? (
                <p style={{ color: 'var(--ink-faint)', fontSize: 13.5, margin: 0 }}>No evidence mapped to this block yet.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6 }}>
                  {evidence.map((m) => <li key={m.id}>{m.required_evidence || 'Evidence to be defined'}</li>)}
                </ul>
              )}

              <h3 style={{ fontFamily: 'var(--fm)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--teal)', margin: '22px 0 8px' }}>Fit test</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>{b.fit}</p>

              {hasWorkspace(openDp) ? (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontFamily: 'var(--fm)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 10px' }}>Do the work</h3>
                  <BlockWorkspace dpId={openDp} clientId={view.client.id} canManage={canManage} />
                </div>
              ) : null}

              {canManage ? (
                <>
                  <h3 style={{ fontFamily: 'var(--fm)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--gold)', margin: '24px 0 8px' }}>Move this gate</h3>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-faint)' }}>Moving a gate is the coaching team&apos;s, and /api/gate-status enforces the same rule when it saves. The next block opens once this one is complete.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {OPTIONS.map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        disabled={!!saving || s === val}
                        onClick={() => setGate(openDp, val, b.title)}
                        style={{
                          border: '1px solid var(--line)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                          cursor: s === val ? 'default' : 'pointer',
                          background: s === val ? 'var(--teal)' : 'var(--box)',
                          color: s === val ? '#fff' : 'var(--ink)',
                          opacity: saving && saving !== val ? .6 : 1,
                        }}
                      >{saving === val ? 'Saving...' : lab}</button>
                    ))}
                  </div>
                </>
              ) : null}

              {flash ? (
                <p style={{ marginTop: 14, fontSize: 13.5, color: flash === 'Saved.' ? 'var(--good)' : 'var(--now)' }}>{flash}</p>
              ) : null}

              <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <a
                  href={`/engagement/${slug}/charter`}
                  style={{ color: 'var(--teal)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
                >Open the Engagement Charter</a>
              </div>
            </div>
          </div>
        )
      })() : null}
    </div>
  )
}
