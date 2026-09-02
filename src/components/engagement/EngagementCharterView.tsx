// @ts-nocheck
'use client'
// ============================================================
// VIEW: the Engagement Charter, rendered at /engagement/[slug]/charter
//       and inside the coach dashboard
// The Engagement Charter, reproduced faithfully from the approved design
// (evidence chain, commitment section, per party responsibilities, ground
// rules, IP, signatures, and the review-before-signature comment mechanism).
//
// The method copy is fixed IP, identical for every engagement. The names,
// parties, the adjustable commitment specifics, the comments and the
// signatures are all configuration, read from loadEngagementView. Nothing is
// hardcoded to any one client.
//
// The consultant edit toolbar shows ONLY when the viewer is the lead
// consultant (their party.user_id) or a super_coach. Everyone else opens the
// same Charter in read-only "Review & sign" mode: they can comment, suggest
// and sign, but not change the wording.
//
// The client-side actions (comment, suggest, resolve, sign, re-issue, send
// email) are wired in a later step; this page renders the full document and
// gates the toolbar by role.
//
// Fees and payments live in a separate, private agreement and never appear here.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadEngagementView } from '@/lib/engagement-loader'
import { DEFAULT_VALIDATION_MIN_PER_SEGMENT, PARTY_ROLE_LABELS } from '@/lib/engagement-types'
import {
  addCharterComment, resolveCharterComment, signCharter, sendEngagementEmail,
} from '@/lib/engagement-actions'
import { COMMITMENT, EVIDENCE_CHAIN } from '@/lib/charter-copy'

const CSS = `
.gc{
  --paper:#EDE6D6; --card:#FBF7EE; --box:#FFFDF8;
  --ink:#1B2A41; --ink-soft:#4C5A6B; --ink-faint:#8B8272;
  --line:rgba(27,42,65,.18); --line-soft:rgba(27,42,65,.09);
  --gold:#B7791F; --navy:#22344F; --teal:#00767A; --purple:#6B4A8B;
  --good:#2E7D32; --good-wash:rgba(46,125,50,.12);
  --amber:#9E6B10; --amber-wash:rgba(158,107,16,.14);
  --crit:#C62828; --crit-wash:rgba(198,40,40,.12);
  --spine:#1B2A41; --spine-ink:#EFEADD;
  --shadow:0 1px 2px rgba(27,42,65,.05), 0 10px 30px rgba(27,42,65,.09);
  --fd:var(--cv-font);
  --fb:var(--cv-font);
  --fm:var(--cv-font);
  background:var(--paper);color:var(--ink);font-family:var(--fb);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .gc{
  --paper:#0B1420; --card:#111E31; --box:#16243A;
  --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
  --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.08);
  --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
  --good:#6FBF73; --good-wash:rgba(111,191,115,.14);
  --amber:#E0B15A; --amber-wash:rgba(224,177,90,.16);
  --crit:#E57373; --crit-wash:rgba(229,115,115,.14);
  --spine:#0A1422; --spine-ink:#EDF2F8;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
}}
:root[data-theme="dark"] .gc{
  --paper:#0B1420; --card:#111E31; --box:#16243A;
  --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
  --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.08);
  --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
  --good:#6FBF73; --good-wash:rgba(111,191,115,.14);
  --amber:#E0B15A; --amber-wash:rgba(224,177,90,.16);
  --crit:#E57373; --crit-wash:rgba(229,115,115,.14);
  --spine:#0A1422; --spine-ink:#EDF2F8;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
}
.gc *{box-sizing:border-box}
.gc .wrap{max-width:940px;margin:0 auto;padding:0 22px 66px}
.gc .top{background:var(--spine);color:var(--spine-ink)}
.gc .top-in{max-width:940px;margin:0 auto;padding:13px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.gc .brand{display:flex;flex-direction:column;line-height:1.1}
.gc .brand .k{font-family:var(--fm);font-size:12.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.gc .brand .w{font-family:var(--fd);font-size:21px}
.gc .tag{font-family:var(--fm);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;border:1px dashed rgba(239,234,221,.4);border-radius:999px;padding:4px 10px}
.gc .doc{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);margin-top:26px;overflow:hidden}
.gc .doc-h{background:var(--spine);color:var(--spine-ink);padding:28px}
.gc .doc-h .eyebrow{font-family:var(--fm);font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin:0 0 8px}
.gc .doc-h h1{font-family:var(--fd);font-weight:600;font-size:clamp(25px,4.4vw,36px);margin:0;line-height:1.1;text-wrap:balance}
.gc .doc-h .meta{margin:14px 0 0;font-size:13.5px;color:rgba(239,234,221,.82)}
.gc .doc-h .meta b{color:#fff}
.gc .doc-b{padding:26px 28px}
.gc section+section{margin-top:30px}
.gc .sh{font-family:var(--fm);font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);display:flex;align-items:center;gap:10px;margin:0 0 12px}
.gc .sh::after{content:"";flex:1;height:1px;background:var(--line-soft)}
.gc .lead{font-size:15.5px;color:var(--ink-soft);margin:0}
.gc .lead b{color:var(--ink)}
.gc .p{font-size:14px;color:var(--ink-soft);margin:10px 0 0}
.gc .p b{color:var(--ink)}
.gc .evidence{background:linear-gradient(180deg,rgba(0,118,122,.10),transparent 70%),var(--box);border:1px solid var(--teal);border-radius:14px;padding:18px 20px;margin-top:2px}
.gc .evidence .big{font-family:var(--fd);font-size:19px;color:var(--ink);margin:0 0 4px;line-height:1.25}
.gc .chain{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin:14px 0 4px}
.gc .clink{flex:1;min-width:150px;background:var(--card);border:1px solid var(--line);border-top:3px solid var(--edge);border-radius:10px;padding:10px 12px}
.gc .clink .cn{font-family:var(--fm);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--edge);font-weight:700}
.gc .clink .ct{font-family:var(--fd);font-size:14px;margin:3px 0 3px}
.gc .clink .cd{font-size:12.5px;color:var(--ink-soft);line-height:1.4}
.gc .c1{--edge:var(--teal)} .gc .c2{--edge:var(--gold)} .gc .c3{--edge:var(--navy)} .gc .c4{--edge:var(--purple)}
.gc .chevron{align-self:center;color:var(--ink-faint);font-size:18px;flex:none}
.gc .evnote{font-size:13px;color:var(--ink-soft);margin:12px 0 0;padding-left:14px;border-left:3px solid var(--teal)}
.gc .evnote b{color:var(--ink)}
.gc .commit-intro{background:var(--amber-wash);border:1px solid rgba(158,107,16,.3);border-radius:12px;padding:13px 16px;font-size:14px;color:var(--ink);margin-bottom:14px}
.gc .commit-intro b{color:var(--amber)}
.gc .ctable{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.gc .crow{display:grid;grid-template-columns:180px 1fr;gap:0;border-top:1px solid var(--line-soft)}
.gc .crow:first-child{border-top:none}
.gc .crole{background:var(--box);padding:12px 14px;font-family:var(--fd);font-size:14.5px;font-weight:600;border-right:1px solid var(--line-soft)}
.gc .cwhat{padding:12px 14px;font-size:13px;color:var(--ink-soft)}
.gc .cwhat b{color:var(--ink);font-weight:600}
.gc .flags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.gc .flag{font-size:12.5px;color:var(--ink-soft);background:var(--box);border:1px solid var(--line);border-radius:999px;padding:5px 11px}
.gc .flag b{color:var(--ink)}
.gc .party{border:1px solid var(--line);border-left:4px solid var(--edge);border-radius:12px;padding:15px 17px;background:var(--box);margin-top:12px;--edge:var(--navy)}
.gc .party.p-client{--edge:var(--navy)} .gc .party.p-lsp{--edge:var(--teal)} .gc .party.p-lead{--edge:var(--gold)} .gc .party.p-co{--edge:var(--purple)}
.gc .party .pr{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.gc .party .role{font-family:var(--fm);font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--edge);font-weight:700}
.gc .party .who{font-family:var(--fd);font-size:18px}
.gc .party .cfg{font-family:var(--fm);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line);border-radius:999px;padding:2px 7px}
.gc .subrole{font-family:var(--fm);font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--edge);margin:12px 0 4px;font-weight:700}
.gc .party ul{margin:8px 0 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.gc .party li{position:relative;padding-left:17px;font-size:13.5px;color:var(--ink-soft);line-height:1.5}
.gc .party li::before{content:"";position:absolute;left:2px;top:9px;width:6px;height:6px;border-radius:50%;background:var(--edge)}
.gc .party li b{color:var(--ink);font-weight:600}
.gc .sub{font-size:12.5px;color:var(--ink-faint);margin:10px 0 0;font-style:italic}
.gc .gov{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.gc .gcard{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--box)}
.gc .gcard h4{font-family:var(--fd);font-size:16px;margin:0 0 6px}
.gc .gcard p{margin:0;font-size:13px;color:var(--ink-soft)}
.gc .moments{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.gc .moment{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--ink-soft)}
.gc .mchip{font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:3px 9px;white-space:nowrap;flex:none;margin-top:1px}
.gc .m-green{background:var(--good-wash);color:var(--good)} .gc .m-amber{background:var(--amber-wash);color:var(--amber)} .gc .m-red{background:var(--crit-wash);color:var(--crit)}
.gc .ip{background:var(--box);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:13.5px;color:var(--ink-soft)}
.gc .ip b{color:var(--ink)}
.gc .sig{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.gc .sigcard{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--box);display:flex;flex-direction:column;gap:2px}
.gc .sigcard .sname{font-family:var(--fd);font-size:16px}
.gc .sigcard .srole{font-family:var(--fm);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
.gc .sigline{margin-top:12px;border-top:1.5px solid var(--line);padding-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.gc .signed{font-family:var(--fd);font-style:italic;font-size:18px;color:var(--teal)}
.gc .signdate{font-family:var(--fm);font-size:12.5px;color:var(--ink-faint)}
.gc .signbtn{font-family:var(--fb);font-size:12.5px;font-weight:600;color:#fff;background:var(--teal);border:none;border-radius:8px;padding:8px 14px;cursor:pointer}
.gc .signbtn[disabled]{opacity:.5;cursor:not-allowed}
.gc .status-sm{font-family:var(--fm);font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;border-radius:999px;padding:3px 8px;align-self:flex-start;margin-top:2px}
.gc .st-signed{background:var(--good-wash);color:var(--good)} .gc .st-await{background:var(--amber-wash);color:var(--amber)}
.gc .ack{margin-top:16px;font-size:13px;color:var(--ink-soft);background:var(--box);border:1px dashed var(--line);border-radius:10px;padding:12px 14px}
.gc .review-banner{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;background:var(--amber-wash);border:1px solid rgba(158,107,16,.32);border-radius:12px;padding:13px 16px;margin-bottom:24px}
.gc .state-pill{font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:var(--amber);color:#2a1c04;border-radius:999px;padding:4px 10px;white-space:nowrap;flex:none}
.gc .review-banner .rb{font-size:13px;color:var(--ink-soft);flex:1;min-width:220px}
.gc .review-banner .rb b{color:var(--ink)}
.gc .adjustable{font-family:var(--fm);font-size:12.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--teal);border:1px solid var(--teal);border-radius:999px;padding:2px 7px;font-weight:700;vertical-align:middle}
.gc .adj-note{font-size:12.5px;color:var(--ink-faint);margin:10px 0 0;font-style:italic}
.gc .comments{margin-top:16px;border:1px dashed var(--line);border-radius:12px;padding:12px 15px;background:var(--box)}
.gc .comments .ch{font-family:var(--fm);font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 8px;display:flex;align-items:center;gap:8px}
.gc .cmt{display:flex;gap:11px;padding:11px 0;border-top:1px solid var(--line-soft)}
.gc .cmt:first-of-type{border-top:none}
.gc .av{width:30px;height:30px;border-radius:50%;flex:none;display:grid;place-items:center;font-family:var(--fd);font-size:13px;color:#fff;background:var(--navy)}
.gc .cmt .body{flex:1}
.gc .cwho{font-size:12.5px}.gc .cwho b{color:var(--ink)}.gc .cwho .cr{color:var(--ink-faint);font-size:12.5px}
.gc .sugg-pill{font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:2px 7px;background:var(--amber-wash);color:var(--amber);margin-left:6px}
.gc .done-pill{background:var(--good-wash);color:var(--good)}
.gc .decl-pill{background:var(--crit-wash);color:var(--crit)}
.gc .ctext{font-size:13px;color:var(--ink-soft);margin:3px 0 0}
.gc .cact{margin-top:7px;display:flex;gap:7px;flex-wrap:wrap}
.gc .mini{font-family:var(--fb);font-size:12.5px;font-weight:600;border-radius:7px;padding:5px 10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.gc .mini.pri{background:var(--teal);color:#fff;border-color:var(--teal)}
.gc .mini[disabled]{opacity:.5;cursor:not-allowed}
.gc .addcmt{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.gc .addcmt input{flex:1;min-width:180px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:var(--card);color:var(--ink);font-family:var(--fb);font-size:12.5px}
.gc .consult-tag{font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold);border-radius:999px;padding:2px 7px}
.gc .cbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card);border:1px solid var(--gold);border-left:4px solid var(--gold);border-radius:12px;padding:11px 15px;margin-top:26px;box-shadow:var(--shadow)}
.gc .cbar .vu{font-family:var(--fm);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
.gc .cbar .vu b{color:var(--gold)}
.gc .cbar .sp{flex:1;min-width:8px}
.gc .cbar .ver{font-family:var(--fm);font-size:12.5px;color:var(--ink-faint)}
.gc .cbar button{font-family:var(--fb);font-size:12.5px;font-weight:600;border-radius:8px;padding:7px 12px;border:1px solid var(--line);background:var(--box);color:var(--ink);cursor:pointer}
.gc .cbar button.pri{background:var(--teal);color:#fff;border-color:var(--teal)}
.gc .cbar button[disabled]{opacity:.5;cursor:not-allowed}
.gc .cbar .hint{width:100%;font-size:12.5px;color:var(--ink-faint);margin-top:2px}
.gc .foot{margin-top:22px;text-align:center;color:var(--ink-faint);font-size:12.5px}
.gc .foot .tm{font-family:var(--fd);color:var(--ink-soft)}
.gc .msg{font-size:12.5px;margin:8px 0 0}
.gc .msg.ok{color:var(--good)} .gc .msg.err{color:var(--crit)}
@media (max-width:660px){ .gc .gov{grid-template-columns:1fr} .gc .sig{grid-template-columns:1fr} .gc .crow{grid-template-columns:1fr} .gc .crole{border-right:none;border-bottom:1px solid var(--line-soft)} .gc .chevron{transform:rotate(90deg)} }
`

// ─── Method copy (fixed IP, client-agnostic) ────────────────
// The evidence chain and the commitment table are the method's own fixed words.
// They live in src/lib/charter-copy.ts because the Charter can now be
// downloaded as well as read here, and a copy that says something different
// from the screen somebody signed is worse than no copy at all. One definition,
// read by the screen and by the document.
const CHAIN = EVIDENCE_CHAIN.map((c, i) => ({
  c: `c${i + 1}`, cn: c.step, ct: c.does, cd: c.detail,
}))

function statusPill(status) {
  if (status === 'accepted') return { cls: 'done-pill', label: 'Accepted' }
  if (status === 'declined') return { cls: 'decl-pill', label: 'Declined' }
  if (status === 'noted') return { cls: 'done-pill', label: 'Noted' }
  return { cls: '', label: 'Suggested change' }
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '' }
}

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#EDE6D6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--cv-font)', fontSize: '1.1rem', color: '#1B2A41' }}>Loading the Charter...</div>
}
function Message({ title, body }) {
  return (
    <div style={{ minHeight: '100vh', background: '#EDE6D6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--cv-font)", padding: '2rem' }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.3rem', fontWeight: 700, color: '#1B2A41', marginBottom: '0.6rem' }}>{title}</div>
        <div style={{ color: '#4C5A6B', fontSize: '0.95rem' }}>{body}</div>
      </div>
    </div>
  )
}

export default function EngagementCharterView({ slugOverride }: any = {}) {
  const params = useParams()
  const slug = (slugOverride || params?.slug) as string
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [view, setView] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Action state: busy blocks double submits, notice reports the outcome in
  // plain language just above the document.
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  // Toolbar panels: the adjustable specifics editor and the version list.
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [draft, setDraft] = useState<any>(null)

  // The specifics the Charter says are adjustable per engagement. They live
  // in the charter content so they belong to the version that was agreed.
  // Take a copy of the agreement away with you.
  //
  // Until this existed, three parties signed a Charter and none of them could
  // hold it: it lived on this screen behind a login. The Executive Director who
  // signed had nothing to file and the funder had nothing to attach. It is
  // offered to everybody who can read the Charter, not only the coach, because
  // a party who cannot obtain the agreement they signed is being asked to take
  // it on trust.
  async function downloadCharter() {
    setBusy('download'); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(
        `/api/charter-document?clientId=${encodeURIComponent(view.client.id)}${charter?.id ? `&charterId=${encodeURIComponent(charter.id)}` : ''}`,
        { headers: { ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) } },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Could not produce the Charter document')
      }
      const blob = await res.blob()
      const name = (res.headers.get('content-disposition') || '')
        .split('filename=')[1]?.replace(/"/g, '') || 'engagement-charter.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setNotice({ tone: 'ok', text: 'Charter downloaded.' })
    } catch (e: any) {
      setNotice({ tone: 'warn', text: e.message || 'Could not produce the Charter document' })
    }
    setBusy(null)
  }

  async function saveSpecifics(next) {
    const { data } = await supabase.auth.getSession()
    const res = await fetch('/api/charter-version', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: JSON.stringify({
        clientId: view.client.id,
        charterId: view.charter.id,
        content: { ...(view.charter.content || {}), commitment: next },
      }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(out?.error || 'Could not save')
  }

  async function loadVersions() {
    const { data } = await supabase
      .from('engagement_charters')
      .select('id,version,status,issued_at,created_at')
      .eq('client_id', view.client.id)
      .order('version', { ascending: false })
    setVersions(data || [])
  }
  useEffect(() => { if (showHistory && view?.client?.id) loadVersions() }, [showHistory, view?.client?.id])

  // Re-read the engagement after an action so the page shows the saved state.
  async function reload() {
    try {
      const v = await loadEngagementView(slug)
      setView(v)
    } catch (e: any) {
      setNotice({ tone: 'warn', text: e?.message || 'Could not refresh the Charter' })
    }
  }

  // One wrapper so every action reports the same way: busy while it runs, a
  // plain message afterwards, and a refresh so the saved result is visible.
  async function run(key: string, fn: () => Promise<any>, okText: string) {
    setBusy(key)
    setNotice(null)
    try {
      await fn()
      await reload()
      setNotice({ tone: 'ok', text: okText })
    } catch (e: any) {
      setNotice({ tone: 'warn', text: e?.message || 'That did not work. Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setHasSession(false); setChecking(false); return }
      setHasSession(true)
      setUserId(session.user.id)
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
  if (!hasSession) return <Message title="Please sign in" body="Open this Charter from your Clearview dashboard, or sign in to view it." />
  if (error) return <Message title="Could not load this Charter" body={error} />
  if (!view) return <Message title="Charter not found" body="This engagement could not be found, or you do not have access to it." />

  const parties = view.parties || []
  const client = view.client?.name || 'the organisation'
  const funderParty = parties.find((p) => p.party_role === 'client_funder') || parties.find((p) => p.party_role === 'funder_rep')
  const funder = funderParty?.organisation || funderParty?.name || null
  const leadParty = parties.find((p) => p.party_role === 'lead_consultant')
  const coParty = parties.find((p) => p.party_role === 'co_implementer')
  const programme = view.programme_name || null

  // Role gate: only the lead consultant (matched by their party.user_id) or a
  // super_coach sees the edit toolbar and the manager-only comment actions.
  const isSuperCoach = role === 'super_coach'
  const isLead = !!leadParty?.user_id && leadParty.user_id === userId
  const canEdit = isSuperCoach || isLead

  const charter = view.charter
  const version = charter?.version || 1
  const status = charter?.status || 'draft'
  const statusLabel = status === 'draft' ? 'Draft' : status === 'issued' ? 'Issued' : status === 'signed' ? 'Signed' : 'Superseded'
  const engWindow = (charter?.content && charter.content.window) || null
  const minConv = view.config?.validation_min_per_segment ?? DEFAULT_VALIDATION_MIN_PER_SEGMENT

  const metaParts = [client, programme].filter(Boolean).join(' · ')
  const metaTail = [funder ? `with ${funder}` : null, engWindow].filter(Boolean).join(' · ')

  // Signatories: parties flagged is_signatory. A signature record (by party_id)
  // marks a card as signed.
  const signatories = parties.filter((p) => p.is_signatory)
  const sigByParty = new Map((view.signatures || []).map((s) => [s.party_id, s]))

  const comments = view.charter_comments || []

  return (
    <div className="gc">
      {view.load_errors && view.load_errors.length > 0 ? (
          <div role="status" style={{
            margin: '0 auto 14px', maxWidth: 1180, padding: '10px 14px', borderRadius: 10,
            border: '1px solid #B7791F', background: '#FFF8E8', color: '#5A4412',
            fontFamily: "var(--cv-font)", fontSize: 13.5,
          }}>
            Part of this engagement could not be loaded ({view.load_errors.join(', ')}), so what you
            see below may be incomplete. Reload before treating it as the record.
          </div>
        ) : null}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="top">
        <div className="top-in">
          <div className="brand"><span className="k">The Canvas Coach</span><span className="w">Engagement Charter</span></div>
          <span className="tag">{canEdit ? 'Edit access' : 'Review & sign'}</span>
        </div>
      </header>

      <div className="wrap">

        {/* Everybody who can read the Charter can take a copy of it, whatever
            their role. It is their agreement too. */}
        <div className="cbar" style={{ justifyContent: 'flex-end' }}>
          <span className="vu">Version v{version} · {statusLabel}</span>
          <span className="sp"></span>
          <button
            type="button"
            className="pri"
            disabled={busy === 'download' || !charter?.id}
            title={!charter?.id ? 'There is no Charter on this engagement yet' : 'Download a Word copy of this Charter, including who has signed it'}
            onClick={downloadCharter}
          >{busy === 'download' ? 'Preparing...' : 'Download a copy'}</button>
        </div>

        {canEdit ? (
          <div className="cbar">
            <span className="vu">Viewing as: <b>{isSuperCoach ? 'Super Coach' : 'Lead Consultant'}</b> · edit access</span>
            <span className="sp"></span>
            <span className="ver">Version v{version} · {statusLabel}</span>
            <button
              type="button"
              onClick={() => { setShowHistory(!showHistory); setNotice(null) }}
            >{showHistory ? 'Hide history' : 'Version history'}</button>
            <button
              type="button"
              disabled={!charter?.id || charter?.status !== 'draft'}
              title={charter?.status !== 'draft'
                ? 'This version has been issued. Re-issue to change the wording.'
                : 'Edit the adjustable specifics'}
              onClick={() => { setEditing(!editing); setNotice(null) }}
            >{editing ? 'Close editor' : 'Edit charter'}</button>
            <button
              className="pri"
              type="button"
              disabled={busy === 'version' || !charter?.id}
              onClick={() => {
                const isDraft = charter?.status === 'draft'
                const ok = isDraft
                  ? true
                  : typeof window === 'undefined' || window.confirm(
                      'Re-issuing supersedes this version and opens a new one. Everyone signs again, so nobody stays bound to wording that changed after they agreed. Continue?')
                if (!ok) return
                run('version', async () => {
                  const { data } = await supabase.auth.getSession()
                  const res = await fetch('/api/charter-version', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
                    },
                    body: JSON.stringify({
                      clientId: view.client.id, charterId: charter.id,
                      mode: isDraft ? 'issue' : 'reissue',
                    }),
                  })
                  const out = await res.json().catch(() => ({}))
                  if (!res.ok) throw new Error(out?.error || 'Could not update the version')
                }, charter?.status === 'draft'
                  ? 'Issued for signature. The parties can now sign this version.'
                  : 'Re-issued. A new draft version is open and signing has reset.')
              }}
            >{busy === 'version'
              ? 'Working...'
              : charter?.status === 'draft' ? 'Issue for signature' : 'Re-issue for signature'}</button>
            <button
              type="button"
              data-action="send-email"
              disabled={busy === 'email'}
              onClick={() => {
                const to = parties.map((p) => p.email).filter(Boolean)
                if (to.length === 0) {
                  setNotice({ tone: 'warn', text: 'No party has an email address on this engagement yet.' })
                  return
                }
                run('email', async () => {
                  const res = await sendEngagementEmail({
                    clientId: view.client.id,
                    stage: 'triparty',
                    recipients: to,
                    journeyUrl: typeof window !== 'undefined' ? window.location.href : '',
                  })
                  if (res && res.ok === false) {
                    throw new Error(res.message || res.reason || 'Email is not configured on this environment.')
                  }
                }, `The Charter link was sent to ${to.length} recipient${to.length === 1 ? '' : 's'}.`)
              }}
            >{busy === 'email' ? 'Sending...' : 'Send to parties'}</button>
            <span className="hint">Only the lead consultant sees this bar. The parties open the same Charter in a read-only &quot;Review &amp; sign&quot; mode, they can comment or suggest, and sign, but not change the wording.</span>
          </div>
        ) : null}

        {showHistory ? (
          <div style={{
            margin: '14px 0 0', border: '1px solid var(--line)', borderRadius: 12,
            background: 'var(--box)', padding: '14px 16px',
          }}>
            <p style={{
              fontFamily: 'var(--fm)', fontSize: 12.5, letterSpacing: '.13em', textTransform: 'uppercase',
              color: 'var(--ink-faint)', margin: '0 0 10px',
            }}>Versions</p>
            {versions.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Loading...</p>
            ) : versions.map((v) => (
              <div key={v.id} style={{
                display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
                padding: '8px 0', borderTop: '1px solid var(--line-soft)', fontSize: 13.5,
              }}>
                <b style={{ fontFamily: 'var(--fd)' }}>Version {v.version}</b>
                <span style={{ color: 'var(--ink-soft)' }}>{v.status}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 12.5 }}>
                  {v.issued_at ? 'issued ' + fmtDate(v.issued_at) : 'created ' + fmtDate(v.created_at)}
                </span>
              </div>
            ))}
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-faint)' }}>
              Signatures belong to the version they were given on. A superseded version keeps its
              signatures as the record of what each party agreed to at the time.
            </p>
          </div>
        ) : null}

        {editing ? (() => {
          const c = draft || (charter?.content?.commitment) || {}
          const set = (k, v) => setDraft({ ...c, [k]: v })
          const F = [
            ['length', 'How long the engagement runs', 'about six months'],
            ['rhythm', 'Working rhythm', 'weekly sessions'],
            ['conversations', 'Customer conversations per segment', '5, with 3 converging'],
            ['capture_window', 'Capture discipline', 'written up within 30 minutes'],
            ['pilot_rounds', 'Pilot rounds with real paying clients', 'two rounds, two clients each'],
            ['scope_note', 'Anything else that differs for this engagement', ''],
          ]
          return (
            <div style={{
              margin: '14px 0 0', border: '1px solid var(--gold)', borderLeft: '4px solid var(--gold)',
              borderRadius: 12, background: 'var(--box)', padding: '15px 17px',
            }}>
              <p style={{
                fontFamily: 'var(--fm)', fontSize: 12.5, letterSpacing: '.13em', textTransform: 'uppercase',
                color: 'var(--gold)', margin: '0 0 4px',
              }}>Adjustable specifics</p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-soft)' }}>
                These are the parts the Charter says can differ per engagement. Changing them here
                changes what the parties read before they sign.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
                {F.map(([k, label, placeholder]) => (
                  <label key={k} style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {label}
                    <input
                      type="text"
                      defaultValue={c[k] || ''}
                      placeholder={placeholder}
                      onChange={(e) => set(k, e.target.value)}
                      style={{
                        display: 'block', width: '100%', marginTop: 4, border: '1px solid var(--line)',
                        borderRadius: 7, padding: '8px 10px', background: 'var(--card)',
                        color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--fb)',
                      }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="signbtn"
                  disabled={busy === 'specifics'}
                  onClick={() => run('specifics', () => saveSpecifics(draft || c),
                    'Saved. The parties will see the updated specifics.')}
                  style={{
                    background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >{busy === 'specifics' ? 'Saving...' : 'Save specifics'}</button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setDraft(null) }}
                  style={{
                    background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)',
                    borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            </div>
          )
        })() : null}

        {notice ? (
          <div
            role="status"
            style={{
              margin: '14px 0 0', padding: '11px 15px', borderRadius: 12, fontSize: 13.5,
              border: `1px solid ${notice.tone === 'ok' ? 'rgba(46,125,50,.4)' : 'rgba(158,107,16,.4)'}`,
              background: notice.tone === 'ok' ? 'rgba(46,125,50,.10)' : 'rgba(158,107,16,.12)',
            }}
          >{notice.text}</div>
        ) : null}

        <div className="doc">
          <div className="doc-h">
            <p className="eyebrow">Engagement Charter · Terms of Engagement</p>
            <h1>How we work together, and what commercial viability will ask of {client}</h1>
            <p className="meta"><b>{client}</b>{programme ? <> · {programme}</> : null}{metaTail ? <> &nbsp;·&nbsp; {metaTail}</> : null} &nbsp;·&nbsp; nine decision blocks over about six months</p>
          </div>

          <div className="doc-b">

            <div className="review-banner">
              <span className="state-pill">{statusLabel} v{version}{status === 'issued' ? ' · out for signature' : status === 'draft' ? ' · in review' : ''}</span>
              <span className="rb"><b>Before anyone signs</b>, each party can comment or suggest a change on any section. Only the <b>Lead Consultant</b> edits the wording, so there is one clean version. Signing opens once everyone is content, and <b>signatures apply to the version agreed; if anything is edited afterwards, signing re-opens for all parties.</b></span>
            </div>

            <section>
              <p className="lead">This Charter is the working agreement for {client}&rsquo;s transition from grant-funded delivery to a commercially viable business. It sets out, in detail, <b>what each party is responsible for, the standard of evidence every decision must meet, and the real commitment the work asks of {client}&rsquo;s people</b>. This is a demanding, hands-on engagement, it produces a commercial model the organisation owns and can defend, and that only happens if the right people give real time to it. Every party signs this Charter before the work begins.</p>
            </section>

            <section>
              <h2 className="sh">The principle everything rests on, evidence</h2>
              <div className="evidence">
                <p className="big">Nothing is taken on trust. Every block is closed on evidence, not opinion, not activity, not a filled-in form.</p>
                <p className="p" style={{ marginTop: 6 }}>The evidence is <b>generated by {client}</b>, its own service data, real customer conversations, real pilot deliveries, real numbers. The coach does not produce it for them; the coach guides the work and <b>holds the standard</b>. A block is complete only when the evidence is real <em>and</em> the agreed signal has genuinely been observed.</p>
                <div className="chain">
                  {CHAIN.map((c, i) => (
                    <div style={{ display: 'contents' }} key={c.c}>
                      <div className={`clink ${c.c}`}>
                        <div className="cn">{c.cn}</div>
                        <div className="ct">{c.ct}</div>
                        <div className="cd">{c.cd}</div>
                      </div>
                      {i < CHAIN.length - 1 ? <span className="chevron">&rarr;</span> : null}
                    </div>
                  ))}
                </div>
                <p className="evnote">Every piece of evidence is logged in a single <b>Evidence Library</b> and referenced by number, so at any moment anyone can see what a decision was based on. This library is both the audit trail and, at the end, {client}&rsquo;s handover record. <b>&quot;Filled in&quot; is not the same as &quot;resolved.&quot;</b></p>
              </div>
            </section>

            <section>
              <h2 className="sh">What this asks of {client}, the commitment <span className="adjustable">adjustable per engagement</span></h2>
              <div className="commit-intro">This is not a workshop the team attends. {client}&rsquo;s own people do the work, in the room and in the field, over roughly six months. <b>Senior time is required and cannot be delegated away.</b> Please read this section as a genuine resourcing decision before signing.</div>
              <div className="ctable">
                {COMMITMENT.map((c) => (
                  <div className="crow" key={c.role}><div className="crole">{c.role}</div><div className="cwhat">{c.asks}</div></div>
                ))}
              </div>
              <div className="flags">
                <span className="flag"><b>~6 months</b>, weekly rhythm</span>
                <span className="flag"><b>{minConv} or more real customer conversations</b> per segment (3 or more must agree)</span>
                <span className="flag">Each conversation <b>captured within 30 minutes</b>, to a set format</span>
                <span className="flag"><b>Two pilot rounds</b> with <b>real, paying clients</b>, non-negotiable</span>
                <span className="flag">Pilot phase is the most intensive, several sessions of <b>real delivery</b></span>
                <span className="flag">Message-testing with <b>real prospects</b></span>
              </div>
              <p className="adj-note">Every specific here, rhythm, hours, session counts, conversation minimums and scope, is set per engagement and can be adjusted before signing.</p>

              <CommentThread
                sectionKey="commitment"
                comments={comments}
                canManage={canEdit}
                clientId={view.client.id}
                charterId={charter?.id}
                busy={busy}
                onAdd={(kind, body) => run('comment', () => addCharterComment({
                  clientId: view.client.id, charterId: charter.id, sectionKey: 'commitment', kind, body,
                }), kind === 'suggestion' ? 'Your suggested change has been sent to the lead consultant.' : 'Your comment has been added.')}
                onResolve={(id, status) => run(`resolve:${id}`, () => resolveCharterComment({
                  id, clientId: view.client.id, status,
                }), status === 'accepted' ? 'Marked as accepted.' : status === 'declined' ? 'Marked as declined.' : 'Updated.')}
              />
            </section>

            <section>
              <h2 className="sh">Responsibilities in detail</h2>

              <div className="party p-lsp">
                <div className="pr"><span className="role">Client</span><span className="who">{client}</span><span className="cfg">set per engagement</span></div>
                <div className="subrole">Executive Director</div>
                <ul>
                  <li>Attends the pre-engagement diagnostic <b>in person</b> and names three things on the record: the commercial outcome sought, the decisions the organisation is prepared to change, and what success looks like at month six.</li>
                  <li><b>Signs off every one of the nine blocks</b>, a block cannot close without it, and confirms which current services will stop, pause or be redesigned.</li>
                  <li>Present at all three readiness diagnostics and co-signs the final completion record.</li>
                </ul>
                <div className="subrole">Leadership team</div>
                <ul>
                  <li><b>Produces the outputs</b>, the service audit, value propositions, pricing commitment, identity and growth plan, in their own words.</li>
                  <li>Leads the <b>second pilot round</b> and delivers the <b>final handover presentation unaided</b>.</li>
                  <li>Takes key commitments to the board.</li>
                </ul>
                <div className="subrole">Finance lead</div>
                <ul>
                  <li>Attends <b>every costing session</b>; builds and, by the end of the viability block, <b>operates the financial model independently</b> (shown live, unaided).</li>
                  <li>Owns the quarterly updates to the model after the engagement closes.</li>
                </ul>
                <div className="subrole">Field / delivery team</div>
                <ul>
                  <li>Runs the customer-validation conversations: at least {minConv} per segment, no more than two per person per day, each <b>written up within 30 minutes</b> to the agreed format, following the interview rules.</li>
                  <li>Tests the value proposition and messaging with real prospects, and <b>leads the second pilot</b> with real clients.</li>
                </ul>
                <div className="subrole">Board</div>
                <ul>
                  <li>Chair (or delegate) attends and signs the opening diagnostic; the board <b>approves the growth plan</b>.</li>
                </ul>
              </div>

              <div className="party p-lead">
                <div className="pr"><span className="role">Lead Consultant / Coach</span><span className="who">{leadParty?.name || 'The Canvas Coach'}</span><span className="cfg">named per engagement</span></div>
                <ul>
                  <li>Owns and runs the method, and <b>holds every decision gate</b>, the sole authority to open the next block, and only once the evidence and the signal are real. &quot;No block opens until the previous one is closed.&quot;</li>
                  <li>Brings the outside-market knowledge the method deliberately leaves to the coach (real prices, competitors, procurement).</li>
                  <li>Present for the core sessions (diagnostic, costing, pilots, readiness &amp; handover); <b>runs the first pilot</b> and stands back for the second.</li>
                  <li><b>Approves the co-implementer&rsquo;s work</b>, outputs and reports, before anything reaches the funder.</li>
                  <li>Co-evaluates and signs the handover, and gives written confirmation the model is complete and owned by {client}. Retains all intellectual property.</li>
                </ul>
              </div>

              {coParty ? (
                <div className="party p-co">
                  <div className="pr"><span className="role">Co-implementer</span><span className="who">{coParty.name}</span><span className="cfg">optional</span></div>
                  <ul>
                    <li>Provides day-to-day continuity and leads the interim working sessions.</li>
                    <li>Sets up and administers the engagement and the evidence library.</li>
                    <li><b>Drafts outputs and the weekly report for the lead&rsquo;s approval</b>; supervises the fieldwork closely.</li>
                    <li>Trains the finance lead to run the model.</li>
                  </ul>
                  <p className="sub">On a solo engagement there is no co-implementer, this section simply does not appear.</p>
                </div>
              ) : null}

              <div className="party p-client">
                <div className="pr"><span className="role">Client &amp; Funder</span><span className="who">{funder || 'The funder'}</span><span className="cfg">set per engagement</span></div>
                <ul>
                  <li>Commissions the work and is the <b>final acceptor of each deliverable</b>, against the evidence standard above.</li>
                  <li>Takes part in the readiness diagnostics at the start, middle and end.</li>
                  <li>Receives the weekly progress reports and the milestone reports.</li>
                  <li>Is the point of escalation if progress slips, and <b>protects the pilot phase</b> from being cut under time pressure.</li>
                  <li>Co-signs the diagnostic record and the final completion record.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="sh">How we decide, the ground rules</h2>
              <div className="gov">
                <div className="gcard">
                  <h4>Gates, in order</h4>
                  <p>The nine blocks are worked in sequence. A block closes only when its evidence is real and signed off, and the next does not open until it does. This is what keeps the model honest.</p>
                </div>
                <div className="gcard">
                  <h4>Evidence, not opinion</h4>
                  <p>Every decision is backed by logged evidence and the agreed &quot;signal&quot; of genuine completion. Activity is not progress; resolved is progress.</p>
                </div>
                <div className="gcard" style={{ gridColumn: '1/-1' }}>
                  <h4>Keeping momentum</h4>
                  <div className="moments">
                    <div className="moment"><span className="mchip m-green">Green</span><span>On track, we continue.</span></div>
                    <div className="moment"><span className="mchip m-amber">Amber</span><span>A session missed or a block slipping, we catch up within five working days, and no new block opens until we&rsquo;re back on track.</span></div>
                    <div className="moment"><span className="mchip m-red">Red</span><span>Stalled, work pauses; the lead, {client}&rsquo;s leadership and the funder meet within five working days and agree a written recovery plan before resuming.</span></div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="sh">Who owns what</h2>
              <div className="ip">
                The <b>Grant-to-Commercial Viability Canvas&trade;</b>, its tools, and the <b>ClearView</b> platform remain the intellectual property of The Canvas Coach. Everything produced <em>for {client}</em> during the engagement, the audit, the model, the value propositions, the pilot lessons, the growth plan, <b>belongs to {client}</b>{funder ? <>, with {funder}&rsquo;s rights as funder</> : null}. The method stays with the coach; the results stay with the organisation.
              </div>
            </section>

            <section>
              <h2 className="sh">Signatures</h2>
              {/* ─────────────────────────────────────────────────────
                  SAY WHY NOBODY CAN SIGN, ABOVE THE BUTTONS. 2 Sept 2026.
                  Habib pressed "Sign here", found it greyed out, and had no
                  way to know why or what to press instead. The reason is one
                  step earlier in the flow — a draft has to be ISSUED before
                  anyone can sign it — and that step was never mentioned here,
                  only on a button further up the page.
                  ───────────────────────────────────────────────────── */}
              {status === 'draft' ? (
                <div className="note" style={{
                  border: '1px solid var(--gold)', borderRadius: 10, padding: '12px 14px',
                  margin: '0 0 14px', background: 'rgba(212,160,23,.08)',
                }}>
                  <b>Nobody can sign yet — this is still a draft (v{version}).</b>
                  <div style={{ marginTop: 4 }}>
                    {canEdit
                      ? 'Press "Issue for signature" at the top of this Charter. That locks the wording and opens signing for every party. Until then every Sign here button below stays greyed out.'
                      : 'The lead consultant has to issue it for signature first. Until then the Sign here buttons below stay greyed out.'}
                  </div>
                </div>
              ) : null}
              <p className="p" style={{ marginTop: 0 }}>By signing, each party confirms they have read this Charter and commit to the responsibilities and level of participation it sets out. <b>Signatures apply to this agreed version (v{version})</b>, if the Charter is edited afterwards, signing re-opens for everyone.</p>
              <p className="p" style={{ marginTop: 0 }}>A party with a login signs here themselves. A party who signs on paper in the room is entered by the Lead Consultant, and the record shows both who signed and who entered it, so it never implies somebody signed in when they did not.</p>
              <div className="sig">
                {signatories.length === 0 ? (
                  <div className="sigcard"><span className="sname">No signatories set</span><span className="srole">Add signatory parties per engagement</span></div>
                ) : signatories.map((p) => {
                  const sig = sigByParty.get(p.id)
                  const roleLabel = PARTY_ROLE_LABELS[p.party_role] || p.party_role
                  const forWho = p.organisation || (p.party_role === 'client_funder' ? funder : client)
                  const isSelf = !!p.user_id && p.user_id === userId
                  return (
                    <div className="sigcard" key={p.id}>
                      <span className="sname">{p.name}{p.title ? ` (${p.title})` : ''}</span>
                      <span className="srole">For {forWho} · {roleLabel}</span>
                      <div className="sigline">
                        {sig ? (
                          <>
                            <span className="signed">{sig.typed_name || sig.signer_name}</span>
                            <span className="signdate">
                              {fmtDate(sig.signed_at)}
                              {sig.signature_method === 'in_room' ? ' · given in the room' : ''}
                            </span>
                          </>
                        ) : isSelf ? (
                          <>
                            <button
                              className="signbtn"
                              type="button"
                              data-action="sign"
                              disabled={busy === `sign:${p.id}` || !charter?.id || status === 'draft'}
                              title={status === 'draft' ? 'The Charter has to be issued for signature first' : 'Sign this version of the Charter'}
                              onClick={() => run(`sign:${p.id}`, () => signCharter({
                                clientId: view.client.id,
                                charterId: charter.id,
                                signerRole: p.party_role,
                                signatureMethod: 'click',
                              }), 'Your signature has been recorded on this version.')}
                            >{busy === `sign:${p.id}` ? 'Signing...' : 'Sign here'}</button>
                            <span className="signdate">
                              {status === 'draft'
                                ? 'This version is still a draft. It has to be issued for signature before anyone can sign.'
                                : ''}
                            </span>
                          </>
                        ) : canEdit ? (
                          <>
                            <button
                              className="signbtn"
                              type="button"
                              data-action="record-signature"
                              disabled={busy === `sign:${p.id}` || !charter?.id}
                              title={`Record the signature ${p.name} gave on paper. The record will show that you entered it.`}
                              onClick={() => {
                                if (typeof window !== 'undefined' && !window.confirm(
                                  `Record the signature given in the room by ${p.name}? The record will show that you entered it, not that ${p.name} signed in.`,
                                )) return
                                run(`sign:${p.id}`, () => signCharter({
                                  clientId: view.client.id,
                                  charterId: charter.id,
                                  signerRole: p.party_role,
                                  onBehalfOfPartyId: p.id,
                                }), `Recorded. The Charter shows ${p.name} as signed, and shows that you entered it.`)
                              }}
                              style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                            >{busy === `sign:${p.id}` ? 'Recording...' : 'Record signature given in the room'}</button>
                            <span className="signdate"></span>
                          </>
                        ) : (
                          <>
                            <button className="signbtn" type="button" disabled title="Only this signatory can sign here">Sign here</button>
                            <span className="signdate">Only {p.name || 'this signatory'} can sign this line.</span>
                          </>
                        )}
                      </div>
                      <span className={`status-sm ${sig ? 'st-signed' : 'st-await'}`}>{sig ? 'Signed' : 'Awaiting signature'}</span>
                    </div>
                  )
                })}
              </div>
              <div className="ack">The board chair also countersigns the opening diagnostic record. Additional signatories can be added per engagement.</div>
            </section>

          </div>
        </div>

        <div className="foot">
          <p className="tm">Grant-to-Commercial Viability Canvas&trade; · The Canvas Coach · habibonifade.com</p>
          <p>Parties, names and dates are configuration, the same Charter serves any engagement. Fees and payments are held in a separate, private agreement and never appear here.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Comment thread for one section ─────────────────────────
// Renders the comments/suggestions logged against a section and the add form.
// Managers (lead / super_coach) see Accept / Decline actions. The actual
// network calls are wired in a later step.
function CommentThread({ sectionKey, comments, canManage, clientId, charterId, busy, onAdd, onResolve }) {
  const [draft, setDraft] = useState('')
  const mine = (comments || []).filter((c) => (c.section_key || 'commitment') === sectionKey)
  const canPost = !!charterId && draft.trim().length > 0 && busy !== 'comment'

  function submit(kind) {
    if (!canPost) return
    onAdd(kind, draft.trim())
    setDraft('')
  }
  const openSuggestions = mine.filter((c) => c.kind === 'suggestion' && c.status === 'open').length
  return (
    <div className="comments">
      <p className="ch">Comments &amp; suggestions on this section {openSuggestions > 0 ? <span className="sugg-pill">{openSuggestions}</span> : null}</p>
      {mine.length === 0 ? <div className="ctext" style={{ paddingBottom: 6 }}>No comments yet. Add one below.</div> : null}
      {mine.map((c) => {
        const pill = c.kind === 'suggestion' ? statusPill(c.status) : null
        return (
          <div className="cmt" key={c.id}>
            <div className="av">{initials(c.author_name)}</div>
            <div className="body">
              <div className="cwho"><b>{c.author_name || 'Someone'}</b> {c.author_role ? <span className="cr">· {c.author_role}</span> : null}{pill ? <span className={`sugg-pill ${pill.cls}`}>{pill.label}</span> : null}</div>
              <div className="ctext">{c.body}</div>
              {canManage && c.kind === 'suggestion' && c.status === 'open' ? (
                <div className="cact">
                  <button className="mini pri" type="button" disabled={busy === `resolve:${c.id}`}
                    onClick={() => onResolve(c.id, 'accepted')}>Accept</button>
                  <button className="mini" type="button" disabled={busy === `resolve:${c.id}`}
                    onClick={() => onResolve(c.id, 'noted')}>Note it</button>
                  <button className="mini" type="button" disabled={busy === `resolve:${c.id}`}
                    onClick={() => onResolve(c.id, 'declined')}>Decline</button>
                  <span className="consult-tag">Consultant only</span>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
      <div className="addcmt">
        <input
          type="text"
          placeholder="Add a comment or suggest a change to this section..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit('comment') }}
          disabled={!charterId || busy === 'comment'}
        />
        <button className="mini" type="button" disabled={!canPost} onClick={() => submit('comment')}>
          {busy === 'comment' ? 'Saving...' : 'Comment'}
        </button>
        <button className="mini pri" type="button" disabled={!canPost} onClick={() => submit('suggestion')}>
          Suggest change
        </button>
      </div>
    </div>
  )
}
