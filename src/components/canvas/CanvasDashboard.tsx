// @ts-nocheck
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  CanvasEngagementState, PhaseId, GateStatus, CanvasRole,
  CANVAS_DECISION_POINTS, FIT_TESTS, DEFAULT_HANDOVER_TESTS,
  DEFAULT_READINESS_QUESTIONS, getPhaseOrder, getPhaseLabel,
  isPhaseUnlocked, initialGateSignoffs, EvidenceEntry, InterviewCapture,
  Hypothesis, CanvasDecision, Assumption, Stakeholder, DataGap,
  PilotObservation, HandoverTest, DiagnosticScore, TeamMember,
} from '@/lib/canvas-types'

// ─── COLOURS ─────────────────────────────────────────────────
const C = {
  navy: '#1B2A4A',
  cyan: '#00B4D8',
  cream: '#F8F4EE',
  teal: '#1A9DAA',
  green: '#1A7A4A',
  red: '#C0392B',
  amber: '#B8860B',
  slate: '#4A5A6A',
  border: '#D8E0E8',
  white: '#FFFFFF',
  lightBg: '#F0F4F8',
}

// ─── STORAGE KEY ─────────────────────────────────────────────
const STORAGE_KEY = 'gtcv_engagement_v1'

// ─── DEFAULT STATE ───────────────────────────────────────────
function defaultState(): CanvasEngagementState {
  return {
    engagement_title: 'GtCV Canvas Engagement — Ikore',
    client_name: 'Ikore',
    programme: 'Ignite',
    funder: 'Ignite',
    lead_consultant: 'The Canvas Coach',
    start_date: '',
    target_handover_date: '',
    version: 'v1.0',
    sector: 'Service LSP',
    registered_address: '',
    file_links: [],
    team: [],
    notifications: { enabled: false, recipients: [] },
    diagnostic_q1: '',
    diagnostic_q2: '',
    diagnostic_q3: '',
    diagnostic_signed_ceo: false,
    diagnostic_signed_ceo_name: '',
    diagnostic_signed_ceo_date: '',
    diagnostic_signed_coach: false,
    diagnostic_signed_coach_date: '',
    assumptions: [],
    stakeholders: [],
    data_gaps: [],
    readiness_answers: DEFAULT_READINESS_QUESTIONS.map(q => ({ ...q })),
    commitment_signed: false,
    commitment_signed_date: '',
    component_evidence: {},
    gate_signoffs: initialGateSignoffs(),
    evidence_library: [],
    interviews: [],
    hypotheses: [],
    decisions: [],
    pilot_observations: [],
    handover_tests: DEFAULT_HANDOVER_TESTS.map(t => ({ ...t })),
    diagnostic_scores: [],
  }
}

// ─── STATUS BADGE ─────────────────────────────────────────────
function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cfg: Record<string, { bg: string; color: string; text: string }> = {
    locked: { bg: '#E8EDF2', color: C.slate, text: label || 'Locked' },
    not_started: { bg: '#E8EDF2', color: C.slate, text: label || 'Not started' },
    in_progress: { bg: '#FFF3CD', color: C.amber, text: label || 'In progress' },
    evidence_submitted: { bg: '#D4EDDA', color: C.green, text: label || 'Evidence submitted' },
    ceo_signed: { bg: '#D4EDDA', color: C.green, text: label || 'CEO signed off' },
    coach_authorised: { bg: '#FFF3CD', color: C.amber, text: label || 'Coach authorised' },
    submitted: { bg: '#D4EDDA', color: C.green, text: label || 'Submitted' },
    accepted: { bg: '#D4EDDA', color: C.green, text: label || 'Accepted' },
    queried: { bg: '#FFF3CD', color: C.amber, text: label || 'Queried' },
    confirmed: { bg: '#D4EDDA', color: C.green, text: label || 'Confirmed' },
    rejected: { bg: '#FDECEA', color: C.red, text: label || 'Rejected' },
    holding: { bg: '#FFF3CD', color: C.amber, text: label || 'Holding' },
    yes: { bg: '#D4EDDA', color: C.green, text: label || 'Yes' },
    no: { bg: '#FDECEA', color: C.red, text: label || 'No' },
    partial: { bg: '#FFF3CD', color: C.amber, text: label || 'Partial' },
    not_assessed: { bg: '#E8EDF2', color: C.slate, text: label || 'Not assessed' },
  }
  const c = cfg[status] || cfg.not_started
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '3px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>{c.text}</span>
  )
}

// ─── PHASE DOT ────────────────────────────────────────────────
function PhaseDot({ status, locked }: { status: GateStatus; locked: boolean }) {
  if (locked) return <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.border, display: 'inline-block' }} />
  if (status === 'ceo_signed') return <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
  if (status === 'coach_authorised') return <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.amber, display: 'inline-block' }} />
  if (status === 'in_progress' || status === 'evidence_submitted') return <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.cyan, display: 'inline-block' }} />
  return <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.border, display: 'inline-block' }} />
}

// ─── SECTION WRAPPER ──────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 24, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', background: C.lightBg, border: 'none', cursor: 'pointer',
          fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: C.navy, textAlign: 'left',
        }}
      >
        {title}
        <span style={{ fontSize: 18, color: C.slate, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: '20px 20px' }}>{children}</div>}
    </div>
  )
}

// ─── PRINT BUTTON ─────────────────────────────────────────────
function PrintBtn({ label = 'Print this section' }: { label?: string }) {
  return (
    <button onClick={() => window.print()} style={{
      background: 'transparent', border: `1px solid ${C.border}`, color: C.slate,
      padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
      fontFamily: "'Segoe UI', system-ui, sans-serif", display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span>🖨</span> {label}
    </button>
  )
}

// ─── TEXT INPUT ───────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder = '', rows = 1, disabled = false, hint = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; disabled?: boolean; hint?: string
}) {
  const style: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
    fontSize: 14, fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: disabled ? '#F5F5F5' : C.white, color: C.navy,
    resize: rows > 1 ? 'vertical' : 'none', boxSizing: 'border-box',
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 4 }}>{label}</label>
      {hint && <p style={{ fontSize: 12, color: C.slate, marginBottom: 4, marginTop: 0 }}>{hint}</p>}
      {rows > 1
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} style={style} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={style} />
      }
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
interface CanvasDashboardProps {
  userRole: CanvasRole
  userName: string
}

export default function CanvasDashboard({ userRole, userName }: CanvasDashboardProps) {
  const [state, setState] = useState<CanvasEngagementState>(defaultState)
  const [activePhase, setActivePhase] = useState<PhaseId>('setup')
  const [navOpen, setNavOpen] = useState(false)

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setState(JSON.parse(saved))
    } catch {}
  }, [])

  // Auto-save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  const update = useCallback((patch: Partial<CanvasEngagementState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  const isCoach = userRole === 'super_coach' || userRole === 'co_implementer'
  const isCEO = userRole === 'ceo'
  const isFunder = userRole === 'ignite_funder'

  const order = getPhaseOrder()

  // Compute completeness per phase
  function getPhaseStatus(id: PhaseId): GateStatus {
    const g = state.gate_signoffs[id]
    if (!g) return 'locked'
    return g.status
  }

  function phaseIsLocked(id: PhaseId): boolean {
    const idx = order.indexOf(id)
    if (idx === 0) return false
    const prev = order[idx - 1]
    const prevG = state.gate_signoffs[prev]
    if (!prevG) return true
    return !prevG.ceo_signed && !prevG.coach_authorised && prev !== 'setup'
  }

  // Gate sign-off
  function ceoSignGate(phaseId: PhaseId) {
    const now = new Date().toLocaleDateString('en-GB')
    setState(prev => ({
      ...prev,
      gate_signoffs: {
        ...prev.gate_signoffs,
        [phaseId]: {
          ...prev.gate_signoffs[phaseId],
          ceo_signed: true,
          ceo_name: userName,
          ceo_date: now,
          status: 'ceo_signed',
        },
      },
    }))
    // Unlock next phase
    const idx = order.indexOf(phaseId)
    if (idx < order.length - 1) {
      const next = order[idx + 1]
      setState(prev => ({
        ...prev,
        gate_signoffs: {
          ...prev.gate_signoffs,
          [next]: { ...prev.gate_signoffs[next], status: 'not_started' },
        },
      }))
    }
  }

  function coachAuthoriseGate(phaseId: PhaseId, note: string) {
    const now = new Date().toLocaleDateString('en-GB')
    setState(prev => ({
      ...prev,
      gate_signoffs: {
        ...prev.gate_signoffs,
        [phaseId]: {
          ...prev.gate_signoffs[phaseId],
          coach_authorised: true,
          coach_note: note,
          coach_date: now,
          status: 'coach_authorised',
        },
      },
    }))
    const idx = order.indexOf(phaseId)
    if (idx < order.length - 1) {
      const next = order[idx + 1]
      setState(prev => ({
        ...prev,
        gate_signoffs: {
          ...prev.gate_signoffs,
          [next]: { ...prev.gate_signoffs[next], status: 'not_started' },
        },
      }))
    }
  }

  // Component evidence
  function updateComponentEvidence(compId: string, field: string, value: string) {
    setState(prev => ({
      ...prev,
      component_evidence: {
        ...prev.component_evidence,
        [compId]: {
          description: prev.component_evidence[compId]?.description || "",
          url: prev.component_evidence[compId]?.url || "",
          evidence_ref: prev.component_evidence[compId]?.evidence_ref || "",
          status: prev.component_evidence[compId]?.status || "not_started",
          component_id: compId,
          [field]: value,
        },
      },
    }))
  }

  // Evidence status
  function markEvidenceStatus(compId: string, status: string) {
    setState(prev => ({
      ...prev,
      component_evidence: {
        ...prev.component_evidence,
        [compId]: {
          component_id: compId,
          description: '',
          url: '',
          evidence_ref: '',
          ...prev.component_evidence[compId],
          status: status as any,
        },
      },
    }))
  }

  // ─── NAV ─────────────────────────────────────────────────────
  function NavBar() {
    return (
      <nav style={{
        background: C.navy, padding: '0 0', overflowX: 'auto',
        display: 'flex', alignItems: 'stretch', gap: 0, minHeight: 48,
        borderBottom: `3px solid ${C.cyan}`,
      }}>
        {order.map((id, i) => {
          const locked = phaseIsLocked(id)
          const active = activePhase === id
          const status = getPhaseStatus(id)
          return (
            <button
              key={id}
              onClick={() => { if (!locked) { setActivePhase(id); setNavOpen(false) } }}
              disabled={locked}
              title={locked ? 'Complete the previous section to unlock' : getPhaseLabel(id)}
              style={{
                background: active ? C.cyan : 'transparent',
                color: locked ? '#6B7A8D' : active ? C.navy : C.white,
                border: 'none', padding: '0 14px', cursor: locked ? 'not-allowed' : 'pointer',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                fontSize: 13, fontWeight: active ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 6,
                borderRight: `1px solid rgba(255,255,255,0.1)`,
                whiteSpace: 'nowrap', minHeight: 48,
                transition: 'background 0.15s',
              }}
            >
              <PhaseDot status={status} locked={locked} />
              {getPhaseLabel(id)}
              {locked && <span style={{ fontSize: 11 }}>🔒</span>}
            </button>
          )
        })}
      </nav>
    )
  }

  // ─── HEADER ──────────────────────────────────────────────────
  function Header() {
    const complete = order.filter(id => {
      const g = state.gate_signoffs[id]
      return g && (g.ceo_signed || g.coach_authorised)
    }).length
    const pct = Math.round((complete / (order.length - 1)) * 100)

    return (
      <header style={{ background: C.navy, padding: '16px 24px', color: C.white }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: C.cyan, fontFamily: "'Segoe UI', system-ui, sans-serif", letterSpacing: 1, textTransform: 'uppercase' }}>
              Canvas Coach &nbsp;|&nbsp; habibonifade.com
            </p>
            <h1 style={{ margin: '4px 0 0', fontFamily: 'Georgia, serif', fontSize: 22, color: C.white }}>
              {state.engagement_title}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#A0B4C8' }}>
              {state.programme} &nbsp;|&nbsp; {state.funder} &nbsp;|&nbsp; Lead: {state.lead_consultant}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#A0B4C8' }}>Engagement progress</p>
            <div style={{ width: 160, height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: C.cyan, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: C.cyan }}>{complete} of {order.length - 1} phases complete</p>
          </div>
        </div>
      </header>
    )
  }

  // ─── SETUP PHASE ─────────────────────────────────────────────
  function SetupPhase() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: C.navy, margin: 0 }}>Engagement Setup</h2>
          <PrintBtn />
        </div>

        <Section title="Cover — Engagement Overview">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Engagement title" value={state.engagement_title} onChange={v => update({ engagement_title: v })} placeholder="e.g. GtCV Canvas Engagement — Ikore" />
            <Field label="Client name" value={state.client_name} onChange={v => update({ client_name: v })} placeholder="e.g. Ikore" />
            <Field label="Programme" value={state.programme} onChange={v => update({ programme: v })} placeholder="e.g. Ignite" />
            <Field label="Funder" value={state.funder} onChange={v => update({ funder: v })} placeholder="e.g. Ignite" />
            <Field label="Lead consultant" value={state.lead_consultant} onChange={v => update({ lead_consultant: v })} placeholder="The Canvas Coach" />
            <Field label="Version" value={state.version} onChange={v => update({ version: v })} placeholder="v1.0" />
            <Field label="Engagement start date" value={state.start_date} onChange={v => update({ start_date: v })} placeholder="e.g. 01 July 2026" />
            <Field label="Target handover date" value={state.target_handover_date} onChange={v => update({ target_handover_date: v })} placeholder="e.g. 31 March 2027" />
          </div>
          <Field label="Registered address" value={state.registered_address} onChange={v => update({ registered_address: v })} placeholder="Ikore's registered address" />
          <Field label="Sector" value={state.sector} onChange={v => update({ sector: v })} placeholder="e.g. Service LSP — agricultural advisory" />
        </Section>

        <Section title="How to Use This Platform">
          <div style={{ background: C.cream, padding: 20, borderRadius: 8, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.navy, lineHeight: 1.7 }}>
            <h3 style={{ fontFamily: 'Georgia, serif', marginTop: 0 }}>Welcome to your Canvas Coach engagement platform</h3>
            <p>This platform is where the work of your engagement lives. It tracks every decision you make, every piece of evidence you produce, and every milestone you reach on your journey to commercial independence.</p>
            <p style={{ fontWeight: 600, color: C.navy }}>What this platform tracks:</p>
            <ul>
              <li>Your progress through 9 Decision Points, each building on the last</li>
              <li>Evidence you produce at each stage: documents, interviews, financial data, observations</li>
              <li>Decisions made and who made them</li>
              <li>Your commercial readiness, measured at the start, middle, and end of the engagement</li>
            </ul>
            <p style={{ fontWeight: 600 }}>What Ikore does here:</p>
            <ul>
              <li>Enter evidence and link to documents as you complete each component</li>
              <li>Your CEO signs off each Decision Point when the work is done</li>
              <li>Record what you learned from customer conversations and pilot deliveries</li>
            </ul>
            <p style={{ fontWeight: 600 }}>What your coach does here:</p>
            <ul>
              <li>Reviews your evidence and guides next steps</li>
              <li>Can authorise progress if a gate is delayed (with a note visible to everyone)</li>
              <li>Manages the overall engagement record</li>
            </ul>
            <p style={{ background: '#E8F4FD', padding: 12, borderRadius: 6, borderLeft: `4px solid ${C.cyan}` }}>
              <strong>Your data is saved automatically.</strong> You do not need to click save. Every entry is recorded the moment you type it.
            </p>
          </div>
        </Section>

        <Section title="Engagement Team">
          <p style={{ color: C.slate, fontSize: 14 }}>Add all team members involved in this engagement. Each person can be set up to receive automatic progress updates.</p>
          <TeamTable
            team={state.team}
            onChange={team => update({ team })}
            editable={isCoach || isCEO}
          />
        </Section>

        <Section title="IP Framework Reference">
          <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.navy, lineHeight: 1.7 }}>
            <h3 style={{ fontFamily: 'Georgia, serif', marginTop: 0 }}>Three-Stage Adoption Test</h3>
            <p>Before any service can be sold, three things must be true about the buyer:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { n: '01', t: 'Willingness', d: 'The customer sees the problem as real and worth solving. They want a solution.' },
                { n: '02', t: 'Ability', d: 'The customer has the financial means to pay for the solution at the price offered.' },
                { n: '03', t: 'Prioritisation', d: 'The customer ranks this problem high enough to spend budget on it now, not later.' },
              ].map(s => (
                <div key={s.n} style={{ background: C.cream, padding: 16, borderRadius: 8, borderTop: `3px solid ${C.cyan}` }}>
                  <p style={{ fontSize: 11, color: C.cyan, fontWeight: 700, letterSpacing: 1, margin: '0 0 4px', textTransform: 'uppercase' }}>{s.n}</p>
                  <p style={{ fontFamily: 'Georgia, serif', fontWeight: 700, margin: '0 0 8px', fontSize: 16 }}>{s.t}</p>
                  <p style={{ margin: 0, fontSize: 13, color: C.slate }}>{s.d}</p>
                </div>
              ))}
            </div>

            <h3 style={{ fontFamily: 'Georgia, serif' }}>Asset Liquidity Hierarchy</h3>
            <p>In agricultural markets, assets serve different financial functions. Understanding this helps you understand your customer's financial behaviour:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { t: 'Poultry', sub: 'ATM equivalent', d: 'Easily converted to cash. Customer sells a chicken when they need small amounts quickly.' },
                { t: 'Small ruminants', sub: 'Savings equivalent', d: 'Converted to cash for planned medium expenses. Goats and sheep are liquid but not instant.' },
                { t: 'Large ruminants', sub: 'Fixed asset equivalent', d: 'Sold for major planned expenses only. Cattle represent significant stored value.' },
              ].map(a => (
                <div key={a.t} style={{ background: C.cream, padding: 16, borderRadius: 8, borderTop: `3px solid ${C.teal}` }}>
                  <p style={{ fontFamily: 'Georgia, serif', fontWeight: 700, margin: '0 0 2px', fontSize: 15 }}>{a.t}</p>
                  <p style={{ fontSize: 11, color: C.teal, margin: '0 0 8px', fontWeight: 600 }}>{a.sub}</p>
                  <p style={{ margin: 0, fontSize: 13, color: C.slate }}>{a.d}</p>
                </div>
              ))}
            </div>

            <h3 style={{ fontFamily: 'Georgia, serif' }}>Commercial Readiness Diagnostic — Six Fit Tests</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.navy, color: C.white }}>
                  {['Test', 'Name', 'What it diagnoses'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIT_TESTS.map((f, i) => (
                  <tr key={f.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                    <td style={{ padding: '9px 14px', color: C.cyan, fontWeight: 700 }}>{f.number}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{f.name}</td>
                    <td style={{ padding: '9px 14px', color: C.slate }}>{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Document Links">
          <p style={{ color: C.slate, fontSize: 14 }}>Add links to key documents for this engagement (Google Drive, Dropbox, OneDrive, or any URL).</p>
          <FileLinkTable
            links={state.file_links}
            onChange={l => update({ file_links: l })}
            editable={isCoach || isCEO}
          />
        </Section>

        <Section title="Notification Settings" defaultOpen={false}>
          <p style={{ color: C.slate, fontSize: 14 }}>When a gate is completed or a key milestone is reached, the platform can send an automatic email to the people listed here.</p>
          <NotificationPanel
            settings={state.notifications}
            onChange={n => update({ notifications: n })}
            editable={isCoach}
          />
        </Section>

        {/* Setup gate */}
        <GateBlock
          phaseId="setup"
          gate={state.gate_signoffs['setup']}
          userRole={userRole}
          userName={userName}
          onCEOSign={() => ceoSignGate('setup')}
          onCoachAuthorise={(note) => coachAuthoriseGate('setup', note)}
          phaseName="Setup"
        />
      </div>
    )
  }

  // ─── PHASE 0 ─────────────────────────────────────────────────
  function Phase0() {
    const locked = phaseIsLocked('phase0')
    if (locked) return <LockedMessage phase="Phase 0" />

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: C.navy, margin: 0 }}>Phase 0 — Assumption Clearing</h2>
          <PrintBtn />
        </div>

        <div style={{ background: C.cream, padding: 16, borderRadius: 8, marginBottom: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <p style={{ margin: 0, color: C.navy, fontSize: 14, lineHeight: 1.6 }}>
            Before the canvas work begins, Phase 0 clears the assumptions that could derail the engagement later. Every tool here is a live working document, not a one-time exercise. You can return to any of them as the engagement progresses.
          </p>
        </div>

        {/* Pre-Engagement Diagnostic */}
        <Section title="Pre-Engagement Diagnostic">
          <p style={{ color: C.slate, fontSize: 14 }}>
            These three questions are answered by Ikore before the engagement begins. The answers are captured verbatim and signed by all parties. Once signed, this section is locked.
          </p>
          {state.diagnostic_signed_ceo && state.diagnostic_signed_coach ? (
            <div style={{ background: '#D4EDDA', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <p style={{ margin: 0, color: C.green, fontWeight: 600 }}>Signed and locked. CEO: {state.diagnostic_signed_ceo_name} on {state.diagnostic_signed_ceo_date}. Coach confirmed {state.diagnostic_signed_coach_date}.</p>
            </div>
          ) : null}
          <Field label="Question 1: What does commercial success look like for Ikore in 18 months?" value={state.diagnostic_q1} onChange={v => update({ diagnostic_q1: v })} rows={4} placeholder="Enter Ikore's answer exactly as given..." disabled={state.diagnostic_signed_ceo && state.diagnostic_signed_coach} hint="Capture the answer verbatim — use the client's own words." />
          <Field label="Question 2: What is the biggest thing stopping Ikore from earning commercial revenue right now?" value={state.diagnostic_q2} onChange={v => update({ diagnostic_q2: v })} rows={4} placeholder="Enter Ikore's answer exactly as given..." disabled={state.diagnostic_signed_ceo && state.diagnostic_signed_coach} hint="Capture the answer verbatim — use the client's own words." />
          <Field label="Question 3: What would have to be true for Ikore to stop needing grant funding?" value={state.diagnostic_q3} onChange={v => update({ diagnostic_q3: v })} rows={4} placeholder="Enter Ikore's answer exactly as given..." disabled={state.diagnostic_signed_ceo && state.diagnostic_signed_coach} hint="Capture the answer verbatim — use the client's own words." />

          {!state.diagnostic_signed_ceo && isCEO && (
            <SignButton
              label="I confirm these answers are accurate — CEO sign-off"
              onSign={() => update({
                diagnostic_signed_ceo: true,
                diagnostic_signed_ceo_name: userName,
                diagnostic_signed_ceo_date: new Date().toLocaleDateString('en-GB'),
              })}
            />
          )}
          {state.diagnostic_signed_ceo && !state.diagnostic_signed_coach && isCoach && (
            <SignButton
              label="Coach confirms — pre-engagement diagnostic complete"
              onSign={() => update({
                diagnostic_signed_coach: true,
                diagnostic_signed_coach_date: new Date().toLocaleDateString('en-GB'),
              })}
            />
          )}
          {state.diagnostic_signed_ceo && <StatusBadge status="submitted" label={`CEO signed: ${state.diagnostic_signed_ceo_name}`} />}
          {state.diagnostic_signed_coach && <span style={{ marginLeft: 8 }}><StatusBadge status="accepted" label="Coach confirmed" /></span>}
        </Section>

        {/* Engagement Tracker */}
        <Section title="Engagement Tracker">
          <p style={{ color: C.slate, fontSize: 14 }}>This table gives a live view of progress across all Decision Points.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              <thead>
                <tr style={{ background: C.navy, color: C.white }}>
                  {['Phase', 'Decision Point', 'Core Question', 'Status', 'Evidence Summary', 'Priority Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CANVAS_DECISION_POINTS.map((dp, i) => {
                  const g = state.gate_signoffs[dp.id]
                  const locked = phaseIsLocked(dp.id)
                  return (
                    <tr key={dp.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: C.cyan }}>{dp.number}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: C.navy }}>{dp.zone}</td>
                      <td style={{ padding: '9px 12px', color: C.slate, maxWidth: 220, fontSize: 12 }}>{dp.core_question}</td>
                      <td style={{ padding: '9px 12px' }}>
                        {locked ? <StatusBadge status="locked" /> : <StatusBadge status={g?.status || 'not_started'} />}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12 }}>
                        {Object.values(state.component_evidence).filter(e => e.component_id.startsWith(dp.id) && e.status === 'submitted').length} / 9 submitted
                      </td>
                      <td style={{ padding: '9px 12px', color: C.slate, fontSize: 12 }}>
                        {g?.coach_note ? <span style={{ color: C.amber }}>{g.coach_note.slice(0, 60)}{g.coach_note.length > 60 ? '...' : ''}</span> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Coach Quick Reference — coach only */}
        {isCoach && (
          <Section title="Coach Quick Reference (Coach and Co-implementer only)">
            <div style={{ background: '#FFF8E7', padding: 16, borderRadius: 8, borderLeft: `4px solid ${C.amber}`, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              <p style={{ margin: '0 0 12px', fontWeight: 600, color: C.amber }}>This section is not visible to the client or the funder.</p>
              <h4 style={{ margin: '0 0 8px', color: C.navy, fontFamily: 'Georgia, serif' }}>Delivery Rhythm</h4>
              <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: C.navy, lineHeight: 1.7 }}>
                <li><strong>Kick-off immersion:</strong> 3 days on-site. Baseline + DP01 and DP02.</li>
                <li><strong>Customer validation visit:</strong> 2 days. Real client conversations + debrief.</li>
                <li><strong>Iteration 1 pilot visit:</strong> 3 days. Consultant leads with 2 real clients.</li>
                <li><strong>Iteration 2 and handover visit:</strong> 3 days. Ikore leads, consultant observes.</li>
                <li><strong>Between visits:</strong> in-country associate provides daily continuity. 2 remote sessions per week.</li>
              </ul>
              <h4 style={{ margin: '0 0 8px', color: C.navy, fontFamily: 'Georgia, serif' }}>Escalation Protocol</h4>
              <ul style={{ margin: 0, paddingLeft: 20, color: C.navy, lineHeight: 1.7 }}>
                <li>Gate not signed within 5 working days of completion: escalate to CEO directly.</li>
                <li>Gate not signed within 10 working days: use Coach Authorise Progress with mandatory note.</li>
                <li>All coach-authorised progress is visible to the Ignite funder view.</li>
              </ul>
            </div>
          </Section>
        )}

        {/* Tool 1: Assumption Log */}
        <Section title="Tool 1 — Assumption Log">
          <p style={{ color: C.slate, fontSize: 14 }}>List every assumption about the market, customer, and service before canvas work begins. You will return here as the engagement progresses to record what happened.</p>
          <AssumptionTable
            assumptions={state.assumptions}
            onChange={a => update({ assumptions: a })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Tool 2: Stakeholder Map */}
        <Section title="Tool 2 — Stakeholder Map">
          <p style={{ color: C.slate, fontSize: 14 }}>Map the key people and organisations that will shape whether the commercial model succeeds or fails.</p>
          <StakeholderTable
            stakeholders={state.stakeholders}
            onChange={s => update({ stakeholders: s })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Tool 3: Data Gap Register */}
        <Section title="Tool 3 — Data Gap Register">
          <p style={{ color: C.slate, fontSize: 14 }}>Record what information is missing before canvas work can start, and how you will get it.</p>
          <DataGapTable
            gaps={state.data_gaps}
            onChange={g => update({ data_gaps: g })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Tool 4: Readiness Self-Assessment */}
        <Section title="Tool 4 — Readiness Self-Assessment">
          <p style={{ color: C.slate, fontSize: 14 }}>
            Answer each question honestly. A score below 6 triggers a flag. A score of 8 or above means you are well-placed to begin.
          </p>
          <ReadinessAssessment
            answers={state.readiness_answers}
            onChange={a => update({ readiness_answers: a })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Tool 5: Engagement Commitment */}
        <Section title="Tool 5 — Engagement Commitment">
          <div style={{ background: C.cream, padding: 20, borderRadius: 8, fontFamily: "'Segoe UI', system-ui, sans-serif", lineHeight: 1.7, color: C.navy, marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'Georgia, serif', marginTop: 0 }}>Engagement Commitment — Ikore</h3>
            <p>By signing below, Ikore confirms that:</p>
            <ol>
              <li>We have read and understood how this engagement works.</li>
              <li>We will allocate sufficient time from our leadership and relevant staff to complete each Decision Point.</li>
              <li>We will engage directly with real paying customers during this engagement, not with beneficiaries or proxy participants.</li>
              <li>We accept that the engagement will produce a commercial model we will be expected to operate independently.</li>
              <li>We understand that the goal is financial independence, not the production of a donor report.</li>
            </ol>
          </div>
          {state.commitment_signed
            ? <StatusBadge status="accepted" label={`Signed by CEO on ${state.commitment_signed_date}`} />
            : isCEO
              ? <SignButton label="I accept the engagement terms — CEO sign-off" onSign={() => update({ commitment_signed: true, commitment_signed_date: new Date().toLocaleDateString('en-GB') })} />
              : <p style={{ color: C.slate, fontSize: 14 }}>Awaiting CEO signature.</p>
          }
        </Section>

        {/* Canvas Decision Record */}
        <Section title="Canvas Decision Record" defaultOpen={false}>
          <p style={{ color: C.slate, fontSize: 14 }}>Every major decision made during the engagement is recorded here with a reference number for the Evidence Library.</p>
          <DecisionTable
            decisions={state.decisions}
            onChange={d => update({ decisions: d })}
            editable={isCoach || isCEO}
          />
        </Section>

        <GateBlock
          phaseId="phase0"
          gate={state.gate_signoffs['phase0']}
          userRole={userRole}
          userName={userName}
          onCEOSign={() => ceoSignGate('phase0')}
          onCoachAuthorise={(note) => coachAuthoriseGate('phase0', note)}
          phaseName="Phase 0"
        />
      </div>
    )
  }

  // ─── DP PHASE ─────────────────────────────────────────────────
  function DPPhase({ dpId }: { dpId: PhaseId }) {
    const locked = phaseIsLocked(dpId)
    if (locked) return <LockedMessage phase={getPhaseLabel(dpId)} />

    const dp = CANVAS_DECISION_POINTS.find(d => d.id === dpId)
    if (!dp) return null

    const evidenceCount = Object.values(state.component_evidence).filter(
      e => e.component_id.startsWith(dpId) && e.status === 'submitted'
    ).length
    const dpInterviews = state.interviews.filter(i => i.phase === dpId)
    const dpHypotheses = state.hypotheses.filter(h => h.phase === dpId)
    const showPilot = dpId === 'dp07' || dpId === 'dp08'

    return (
      <div>
        {/* DP Header */}
        <div style={{ background: C.navy, borderRadius: 8, padding: 24, marginBottom: 24, color: C.white }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: C.cyan, fontFamily: "'Segoe UI', system-ui, sans-serif", textTransform: 'uppercase', letterSpacing: 1 }}>
                {dp.number} &nbsp;|&nbsp; {dp.zone}
              </p>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, margin: '0 0 12px', color: C.white }}>
                {dp.core_question}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#A0B4C8' }}>
                Estimated session time: {dp.session_time}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <StatusBadge status={state.gate_signoffs[dpId]?.status || 'not_started'} />
              <PrintBtn />
              <p style={{ margin: 0, fontSize: 12, color: '#A0B4C8' }}>{evidenceCount} / {dp.components.length} components with evidence</p>
            </div>
          </div>
        </div>

        {/* What good looks like */}
        <Section title="What a strong answer to this Decision Point looks like">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
            <div style={{ background: '#D4EDDA', padding: 16, borderRadius: 8 }}>
              <p style={{ fontWeight: 700, color: C.green, margin: '0 0 8px', fontSize: 13 }}>A strong answer</p>
              <p style={{ margin: 0, fontSize: 14, color: C.navy }}>{dp.good_answer}</p>
            </div>
            <div style={{ background: '#FDECEA', padding: 16, borderRadius: 8 }}>
              <p style={{ fontWeight: 700, color: C.red, margin: '0 0 8px', fontSize: 13 }}>A weak answer (avoid this)</p>
              <p style={{ margin: 0, fontSize: 14, color: C.navy }}>{dp.weak_answer}</p>
            </div>
          </div>
          <div style={{ marginTop: 16, background: C.cream, padding: 16, borderRadius: 8, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
            <p style={{ fontWeight: 600, color: C.navy, margin: '0 0 8px', fontSize: 14 }}>Why this matters for Ikore specifically</p>
            <p style={{ margin: 0, fontSize: 14, color: C.slate }}>{dp.why_it_matters_for_ikore}</p>
          </div>
        </Section>

        {/* Components */}
        <Section title={`The ${dp.components.length} Components — Evidence Required for Each`}>
          <p style={{ color: C.slate, fontSize: 14, marginBottom: 20 }}>
            Work through each component in order. For each one, describe what you produced and add a link to any supporting document. Your coach will review and confirm.
          </p>
          {dp.components.map(comp => {
            const ev = state.component_evidence[comp.id] || {}
            return (
              <div key={comp.id} style={{
                border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, overflow: 'hidden',
              }}>
                <div style={{ background: C.lightBg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 12, color: C.cyan, fontWeight: 700, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
                      Component {comp.number}
                    </span>
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: C.navy, fontWeight: 700, marginLeft: 10 }}>
                      {comp.title}
                    </span>
                  </div>
                  <StatusBadge status={ev.status || 'not_started'} />
                </div>
                <div style={{ padding: '16px 20px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>What it is</p>
                      <p style={{ fontSize: 14, color: C.navy, margin: 0 }}>{comp.what_it_is}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Why it matters</p>
                      <p style={{ fontSize: 14, color: C.navy, margin: 0 }}>{comp.why_it_matters}</p>
                    </div>
                  </div>
                  <div style={{ background: '#EBF8FF', padding: 14, borderRadius: 6, marginBottom: 16, borderLeft: `4px solid ${C.cyan}` }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.cyan, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your action</p>
                    <p style={{ fontSize: 14, color: C.navy, margin: 0 }}>{comp.action_trigger}</p>
                  </div>
                  <div style={{ background: C.cream, padding: 14, borderRadius: 6, marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>What good looks like</p>
                    <p style={{ fontSize: 14, color: C.navy, margin: 0 }}>{comp.signal_to_look_for}</p>
                  </div>

                  {/* Coach guidance — coach only */}
                  {isCoach && (
                    <div style={{ background: '#FFF8E7', padding: 14, borderRadius: 6, marginBottom: 16, borderLeft: `4px solid ${C.amber}` }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.amber, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Coach guidance (not visible to client)</p>
                      <p style={{ fontSize: 14, color: C.navy, margin: 0 }}>{comp.coach_guidance}</p>
                    </div>
                  )}

                  {/* Evidence fields */}
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 12px' }}>Your evidence for this component</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field
                        label="Describe what you produced"
                        value={ev.description || ''}
                        onChange={v => updateComponentEvidence(comp.id, 'description', v)}
                        rows={3}
                        placeholder="What did Ikore produce or do to complete this component? Be specific."
                      />
                      <div>
                        <Field
                          label="Link to supporting document (optional)"
                          value={ev.url || ''}
                          onChange={v => updateComponentEvidence(comp.id, 'url', v)}
                          placeholder="https://... or Google Drive / Dropbox link"
                        />
                        <Field
                          label="Evidence reference number (optional)"
                          value={ev.evidence_ref || ''}
                          onChange={v => updateComponentEvidence(comp.id, 'evidence_ref', v)}
                          placeholder="e.g. E-003"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['not_started', 'in_progress', 'submitted'].map(s => (
                        <button
                          key={s}
                          onClick={() => markEvidenceStatus(comp.id, s)}
                          style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                            fontFamily: "'Segoe UI', system-ui, sans-serif",
                            background: (ev.status || 'not_started') === s ? C.cyan : C.white,
                            color: (ev.status || 'not_started') === s ? C.navy : C.slate,
                            border: `1px solid ${(ev.status || 'not_started') === s ? C.cyan : C.border}`,
                            fontWeight: (ev.status || 'not_started') === s ? 700 : 400,
                          }}
                        >
                          {s === 'not_started' ? 'Not started' : s === 'in_progress' ? 'In progress' : 'Mark as submitted'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </Section>

        {/* DP Evidence Summary */}
        <Section title="Evidence Summary for this Decision Point">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              <thead>
                <tr style={{ background: C.lightBg }}>
                  {['Component', 'Description', 'Status', 'Document link'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: C.navy, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dp.components.map((comp, i) => {
                  const ev = state.component_evidence[comp.id] || {}
                  return (
                    <tr key={comp.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: C.navy }}>{comp.number}. {comp.title}</td>
                      <td style={{ padding: '9px 12px', color: C.slate, maxWidth: 280 }}>{ev.description || '—'}</td>
                      <td style={{ padding: '9px 12px' }}><StatusBadge status={ev.status || 'not_started'} /></td>
                      <td style={{ padding: '9px 12px' }}>
                        {ev.url ? <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontSize: 12 }}>Open</a> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Interviews */}
        <Section title="Interviews conducted for this Decision Point" defaultOpen={dpInterviews.length > 0}>
          <p style={{ color: C.slate, fontSize: 14 }}>Record every customer or stakeholder conversation related to this Decision Point. These feed into the Evidence Library automatically.</p>
          <InterviewTable
            interviews={dpInterviews}
            phaseId={dpId}
            onAdd={int => update({ interviews: [...state.interviews, int] })}
            onUpdate={(id, int) => update({ interviews: state.interviews.map(i => i.id === id ? int : i) })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Hypotheses */}
        <Section title="Hypotheses formed during this Decision Point" defaultOpen={false}>
          <p style={{ color: C.slate, fontSize: 14 }}>Capture every hypothesis formed during this Decision Point — about the customer, the service, or the market. Track what the evidence shows.</p>
          <HypothesisTable
            hypotheses={dpHypotheses}
            phaseId={dpId}
            onAdd={h => update({ hypotheses: [...state.hypotheses, h] })}
            onUpdate={(id, h) => update({ hypotheses: state.hypotheses.map(hy => hy.id === id ? h : hy) })}
            editable={isCoach || isCEO}
          />
        </Section>

        {/* Pilot observations — DP07 and DP08 only */}
        {showPilot && (
          <Section title={`Pilot Observation — ${dpId === 'dp07' ? 'Iteration 1' : 'Iteration 2'}`}>
            <p style={{ color: C.slate, fontSize: 14 }}>Record what happened during each pilot delivery. This is completed by the lead consultant during or immediately after the visit.</p>
            <PilotObsTable
              observations={state.pilot_observations.filter(o => o.phase === dpId)}
              phaseId={dpId}
              iteration={dpId === 'dp07' ? 1 : 2}
              onAdd={o => update({ pilot_observations: [...state.pilot_observations, o] })}
              onUpdate={(id, o) => update({ pilot_observations: state.pilot_observations.map(p => p.id === id ? o : p) })}
              editable={isCoach}
            />
          </Section>
        )}

        {/* Commercial Readiness — DP06 baseline, DP07 midpoint, DP09 final */}
        {(dpId === 'dp06' || dpId === 'dp07' || dpId === 'dp09') && (
          <Section title={`Commercial Readiness Diagnostic — ${dpId === 'dp06' ? 'Baseline' : dpId === 'dp07' ? 'Mid-Point' : 'Final'} Assessment`}>
            <CommercialReadiness
              point={dpId === 'dp06' ? 'baseline' : dpId === 'dp07' ? 'midpoint' : 'final'}
              scores={state.diagnostic_scores}
              onChange={scores => update({ diagnostic_scores: scores })}
              editable={isCoach}
            />
          </Section>
        )}

        {/* Gate */}
        <GateBlock
          phaseId={dpId}
          gate={state.gate_signoffs[dpId]}
          userRole={userRole}
          userName={userName}
          onCEOSign={() => ceoSignGate(dpId)}
          onCoachAuthorise={(note) => coachAuthoriseGate(dpId, note)}
          phaseName={`${dp.number} — ${dp.zone}`}
        />
      </div>
    )
  }

  // ─── HANDOVER PHASE ───────────────────────────────────────────
  function HandoverPhase() {
    const locked = phaseIsLocked('handover')
    if (locked) return <LockedMessage phase="Handover" />

    const totalScore = state.readiness_answers.filter(a => a.answer === true).length
    const readinessPct = Math.round((totalScore / state.readiness_answers.length) * 100)

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: C.navy, margin: 0 }}>Handover and Engagement Close</h2>
          <PrintBtn />
        </div>

        <Section title="Evidence Library — Full Index">
          <p style={{ color: C.slate, fontSize: 14 }}>Every piece of evidence from the engagement, indexed and referenced. Reference numbers (E-001, E-002...) appear throughout the workbook.</p>
          <EvidenceLibrary
            entries={state.evidence_library}
            onChange={e => update({ evidence_library: e })}
            editable={isCoach || isCEO}
          />
        </Section>

        <Section title="Five Independence Tests">
          <p style={{ color: C.slate, fontSize: 14 }}>
            The engagement is complete only when Ikore passes the independence tests below. Your coach assesses each test. You confirm as CEO.
          </p>
          {state.handover_tests.map(test => (
            <div key={test.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: C.navy, margin: 0 }}>
                  Test {test.number}: {test.test}
                </p>
                <StatusBadge status={test.status} />
              </div>
              {isCoach && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {(['yes', 'no', 'partial', 'not_assessed'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => update({ handover_tests: state.handover_tests.map(t => t.id === test.id ? { ...t, status: s } : t) })}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        background: test.status === s ? C.navy : C.white,
                        color: test.status === s ? C.white : C.slate,
                        border: `1px solid ${C.border}`,
                        fontFamily: "'Segoe UI', system-ui, sans-serif",
                      }}
                    >{s.replace('_', ' ')}</button>
                  ))}
                </div>
              )}
              <Field
                label="Evidence (describe or link)"
                value={test.evidence}
                onChange={v => update({ handover_tests: state.handover_tests.map(t => t.id === test.id ? { ...t, evidence: v } : t) })}
                rows={2}
                placeholder="What evidence confirms this test is passed?"
                disabled={!isCoach}
              />
              {test.status === 'yes' && !test.ceo_confirmed && isCEO && (
                <SignButton label="I confirm this test — CEO" onSign={() => update({
                  handover_tests: state.handover_tests.map(t => t.id === test.id ? {
                    ...t, ceo_confirmed: true, ceo_confirmed_date: new Date().toLocaleDateString('en-GB'),
                  } : t)
                })} />
              )}
              {test.ceo_confirmed && <StatusBadge status="accepted" label={`CEO confirmed: ${test.ceo_confirmed_date}`} />}
            </div>
          ))}
        </Section>

        <Section title="Commercial Readiness — Baseline to Final Comparison">
          <CommercialReadinessSummary scores={state.diagnostic_scores} />
        </Section>

        <GateBlock
          phaseId="handover"
          gate={state.gate_signoffs['handover']}
          userRole={userRole}
          userName={userName}
          onCEOSign={() => ceoSignGate('handover')}
          onCoachAuthorise={(note) => coachAuthoriseGate('handover', note)}
          phaseName="Handover and Engagement Close"
        />
      </div>
    )
  }

  // ─── RENDER ───────────────────────────────────────────────────
  if (isFunder) {
    return <FunderView state={state} />
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.cream, minHeight: '100vh' }}>
      <Header />
      <NavBar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {activePhase === 'setup' && <SetupPhase />}
        {activePhase === 'phase0' && <Phase0 />}
        {CANVAS_DECISION_POINTS.map(dp => activePhase === dp.id ? <DPPhase key={dp.id} dpId={dp.id} /> : null)}
        {activePhase === 'handover' && <HandoverPhase />}
      </main>
    </div>
  )
}

// ─── GATE BLOCK ───────────────────────────────────────────────
function GateBlock({
  phaseId, gate, userRole, userName, onCEOSign, onCoachAuthorise, phaseName,
}: {
  phaseId: PhaseId; gate: any; userRole: CanvasRole; userName: string;
  onCEOSign: () => void; onCoachAuthorise: (note: string) => void; phaseName: string;
}) {
  const [authoriseNote, setAuthoriseNote] = useState('')
  const [showAuthorise, setShowAuthorise] = useState(false)
  const isCEO = userRole === 'ceo'
  const isCoach = userRole === 'super_coach' || userRole === 'co_implementer'

  if (!gate) return null
  if (gate.status === 'locked') return null

  return (
    <div style={{ marginTop: 32, border: `2px solid ${gate.ceo_signed ? C.green : gate.coach_authorised ? C.amber : C.border}`, borderRadius: 10, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontFamily: 'Georgia, serif', margin: 0, color: C.navy }}>
          Gate — {phaseName}
        </h3>
        <StatusBadge status={gate.status} />
      </div>

      {gate.ceo_signed && (
        <div style={{ background: '#D4EDDA', padding: 14, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, color: C.green, fontWeight: 600 }}>
            CEO signed off — {gate.ceo_name} on {gate.ceo_date}. The next section is now unlocked.
          </p>
        </div>
      )}

      {gate.coach_authorised && (
        <div style={{ background: '#FFF3CD', padding: 14, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, color: C.amber, fontWeight: 600 }}>
            Coach-authorised progress on {gate.coach_date}.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: C.navy }}>Note: {gate.coach_note}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.slate }}>This note is visible to all parties including the Ignite funder.</p>
        </div>
      )}

      {!gate.ceo_signed && !gate.coach_authorised && isCEO && (
        <div style={{ background: C.cream, padding: 20, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ color: C.navy, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
            When you are satisfied that all the work for this section is complete, click below to sign off and unlock the next section. Your sign-off is recorded with your name, date, and time.
          </p>
          <button
            onClick={onCEOSign}
            style={{
              background: C.navy, color: C.white, padding: '12px 28px', borderRadius: 8,
              border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 15,
              fontWeight: 700, letterSpacing: 0.3,
            }}
          >
            I confirm this section is complete — CEO Sign-Off
          </button>
        </div>
      )}

      {!gate.ceo_signed && !gate.coach_authorised && isCoach && (
        <div style={{ background: '#FFF8E7', padding: 16, borderRadius: 8, border: `1px solid ${C.amber}` }}>
          <p style={{ color: C.amber, fontWeight: 600, margin: '0 0 8px' }}>Coach options — CEO has not yet signed this gate</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => {
                const email = prompt('Email address to escalate to:')
                if (email) alert(`Escalation email sent to ${email} — [In production, this triggers the Resend API]`)
              }}
              style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.amber}`, background: 'transparent', color: C.amber, cursor: 'pointer', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}
            >
              Escalate to CEO by email
            </button>
            <button
              onClick={() => setShowAuthorise(true)}
              style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.navy}`, background: C.navy, color: C.white, cursor: 'pointer', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}
            >
              Authorise progress (Coach override)
            </button>
          </div>
          {showAuthorise && (
            <div style={{ marginTop: 12 }}>
              <Field
                label="Mandatory note — this will be visible to all parties including the Ignite funder"
                value={authoriseNote}
                onChange={setAuthoriseNote}
                rows={3}
                placeholder="Explain why you are authorising progress without CEO sign-off. Be specific."
              />
              <button
                onClick={() => {
                  if (authoriseNote.trim().length < 20) { alert('Please write at least 20 characters explaining the reason for this override.'); return }
                  onCoachAuthorise(authoriseNote)
                  setShowAuthorise(false)
                }}
                style={{ background: C.amber, color: C.navy, border: 'none', padding: '10px 24px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontFamily: "'Segoe UI', system-ui, sans-serif" }}
              >
                Confirm Coach Authorisation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SIGN BUTTON ──────────────────────────────────────────────
function SignButton({ label, onSign }: { label: string; onSign: () => void }) {
  return (
    <button
      onClick={onSign}
      style={{
        background: C.navy, color: C.white, padding: '12px 28px', borderRadius: 8,
        border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 15,
        fontWeight: 700, marginTop: 8,
      }}
    >
      {label}
    </button>
  )
}

// ─── LOCKED MESSAGE ───────────────────────────────────────────
function LockedMessage({ phase }: { phase: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 40px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontFamily: 'Georgia, serif', color: C.navy, marginBottom: 8 }}>{phase} is locked</h2>
      <p style={{ color: C.slate, maxWidth: 440, margin: '0 auto' }}>
        Complete the previous section and get CEO sign-off (or coach authorisation) to unlock this section.
      </p>
    </div>
  )
}

// ─── TABLE COMPONENTS ─────────────────────────────────────────

function TeamTable({ team, onChange, editable }: { team: TeamMember[]; onChange: (t: TeamMember[]) => void; editable: boolean }) {
  const add = () => onChange([...team, { id: `tm-${Date.now()}`, name: '', role: '', organisation: '', email: '', notify: false }])
  const upd = (id: string, f: string, v: any) => onChange(team.map(t => t.id === id ? { ...t, [f]: v } : t))
  const del = (id: string) => onChange(team.filter(t => t.id !== id))
  return (
    <div>
      {team.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No team members added yet. Click below to add the first.</p>}
      {team.map(m => (
        <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 2fr auto auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
          <div><label style={labelStyle}>Full name</label><input value={m.name} onChange={e => upd(m.id, 'name', e.target.value)} style={inputStyle} placeholder="Full name" disabled={!editable} /></div>
          <div><label style={labelStyle}>Role</label><input value={m.role} onChange={e => upd(m.id, 'role', e.target.value)} style={inputStyle} placeholder="e.g. CEO" disabled={!editable} /></div>
          <div><label style={labelStyle}>Organisation</label><input value={m.organisation} onChange={e => upd(m.id, 'organisation', e.target.value)} style={inputStyle} placeholder="e.g. Ikore" disabled={!editable} /></div>
          <div><label style={labelStyle}>Email</label><input value={m.email} onChange={e => upd(m.id, 'email', e.target.value)} style={inputStyle} placeholder="email@..." disabled={!editable} /></div>
          <div><label style={labelStyle}>Notify</label><input type="checkbox" checked={m.notify} onChange={e => upd(m.id, 'notify', e.target.checked)} disabled={!editable} /></div>
          {editable && <button onClick={() => del(m.id)} style={delBtnStyle}>Remove</button>}
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add team member</button>}
    </div>
  )
}

function FileLinkTable({ links, onChange, editable }: { links: { label: string; url: string }[]; onChange: (l: any[]) => void; editable: boolean }) {
  const add = () => onChange([...links, { label: '', url: '' }])
  const upd = (i: number, f: string, v: string) => onChange(links.map((l, idx) => idx === i ? { ...l, [f]: v } : l))
  const del = (i: number) => onChange(links.filter((_, idx) => idx !== i))
  return (
    <div>
      {links.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end', marginBottom: 8 }}>
          <div><label style={labelStyle}>Label</label><input value={l.label} onChange={e => upd(i, 'label', e.target.value)} style={inputStyle} placeholder="e.g. Engagement Brief" disabled={!editable} /></div>
          <div><label style={labelStyle}>URL</label><input value={l.url} onChange={e => upd(i, 'url', e.target.value)} style={inputStyle} placeholder="https://..." disabled={!editable} /></div>
          {editable && <button onClick={() => del(i)} style={delBtnStyle}>Remove</button>}
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add link</button>}
    </div>
  )
}

function AssumptionTable({ assumptions, onChange, editable }: { assumptions: Assumption[]; onChange: (a: Assumption[]) => void; editable: boolean }) {
  const add = () => onChange([...assumptions, { id: `a-${Date.now()}`, assumption: '', source: '', risk: 'medium', how_to_test: '', outcome: '' }])
  const upd = (id: string, f: string, v: string) => onChange(assumptions.map(a => a.id === id ? { ...a, [f]: v } : a))
  const del = (id: string) => onChange(assumptions.filter(a => a.id !== id))
  return (
    <div>
      {assumptions.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No assumptions recorded yet.</p>}
      {assumptions.map(a => (
        <div key={a.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
            <Field label="Assumption" value={a.assumption} onChange={v => upd(a.id, 'assumption', v)} placeholder="What are we assuming to be true?" disabled={!editable} />
            <Field label="Source" value={a.source} onChange={v => upd(a.id, 'source', v)} placeholder="Where does this come from?" disabled={!editable} />
            <div>
              <label style={labelStyle}>Risk level</label>
              <select value={a.risk} onChange={e => upd(a.id, 'risk', e.target.value)} disabled={!editable} style={{ ...inputStyle, width: '100%' }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="How it will be tested" value={a.how_to_test} onChange={v => upd(a.id, 'how_to_test', v)} placeholder="How will you confirm or disprove this?" disabled={!editable} />
            <Field label="Outcome (fill in later)" value={a.outcome} onChange={v => upd(a.id, 'outcome', v)} placeholder="What did you find?" disabled={!editable} />
            {editable && <button onClick={() => del(a.id)} style={delBtnStyle}>Remove</button>}
          </div>
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add assumption</button>}
    </div>
  )
}

function StakeholderTable({ stakeholders, onChange, editable }: { stakeholders: Stakeholder[]; onChange: (s: Stakeholder[]) => void; editable: boolean }) {
  const add = () => onChange([...stakeholders, { id: `s-${Date.now()}`, actor: '', role: '', influence: 'medium', relationship: '', action_needed: '' }])
  const upd = (id: string, f: string, v: string) => onChange(stakeholders.map(s => s.id === id ? { ...s, [f]: v } : s))
  const del = (id: string) => onChange(stakeholders.filter(s => s.id !== id))
  return (
    <div>
      {stakeholders.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No stakeholders mapped yet.</p>}
      {stakeholders.map(s => (
        <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.5fr 1.5fr auto', gap: 10, alignItems: 'end' }}>
            <Field label="Actor / Organisation" value={s.actor} onChange={v => upd(s.id, 'actor', v)} placeholder="Name" disabled={!editable} />
            <Field label="Role" value={s.role} onChange={v => upd(s.id, 'role', v)} placeholder="e.g. Buyer, Referrer" disabled={!editable} />
            <div>
              <label style={labelStyle}>Influence</label>
              <select value={s.influence} onChange={e => upd(s.id, 'influence', e.target.value)} disabled={!editable} style={{ ...inputStyle, width: '100%' }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <Field label="Relationship to Ikore" value={s.relationship} onChange={v => upd(s.id, 'relationship', v)} placeholder="Existing or new?" disabled={!editable} />
            <Field label="Action needed" value={s.action_needed} onChange={v => upd(s.id, 'action_needed', v)} placeholder="What needs to happen?" disabled={!editable} />
            {editable && <button onClick={() => del(s.id)} style={delBtnStyle}>Remove</button>}
          </div>
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add stakeholder</button>}
    </div>
  )
}

function DataGapTable({ gaps, onChange, editable }: { gaps: DataGap[]; onChange: (g: DataGap[]) => void; editable: boolean }) {
  const add = () => onChange([...gaps, { id: `dg-${Date.now()}`, data_needed: '', why_it_matters: '', how_to_get: '', responsible: '', status: 'open' }])
  const upd = (id: string, f: string, v: string) => onChange(gaps.map(g => g.id === id ? { ...g, [f]: v } : g))
  const del = (id: string) => onChange(gaps.filter(g => g.id !== id))
  return (
    <div>
      {gaps.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No data gaps recorded yet.</p>}
      {gaps.map(g => (
        <div key={g.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <Field label="Data needed" value={g.data_needed} onChange={v => upd(g.id, 'data_needed', v)} placeholder="What information is missing?" disabled={!editable} />
            <Field label="Why it matters" value={g.why_it_matters} onChange={v => upd(g.id, 'why_it_matters', v)} placeholder="Impact if not resolved" disabled={!editable} />
            <Field label="How to get it" value={g.how_to_get} onChange={v => upd(g.id, 'how_to_get', v)} placeholder="Method or source" disabled={!editable} />
            <Field label="Responsible" value={g.responsible} onChange={v => upd(g.id, 'responsible', v)} placeholder="Who will get this?" disabled={!editable} />
            <div>
              <label style={labelStyle}>Status</label>
              <select value={g.status} onChange={e => upd(g.id, 'status', e.target.value)} disabled={!editable} style={{ ...inputStyle, width: '100%' }}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            {editable && <button onClick={() => del(g.id)} style={delBtnStyle}>Remove</button>}
          </div>
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add data gap</button>}
    </div>
  )
}

function ReadinessAssessment({ answers, onChange, editable }: { answers: any[]; onChange: (a: any[]) => void; editable: boolean }) {
  const score = answers.filter(a => a.answer === true).length
  const flag = score < 6
  const upd = (id: string, v: boolean | null) => onChange(answers.map(a => a.id === id ? { ...a, answer: v } : a))
  return (
    <div>
      <div style={{ background: flag ? '#FFF3CD' : '#D4EDDA', padding: 14, borderRadius: 8, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: flag ? C.amber : C.green, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          Score: {score} / {answers.length}
        </span>
        <span style={{ fontSize: 13, color: flag ? C.amber : C.green, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          {flag ? 'Score below 6 — discuss with your coach before proceeding' : 'Good readiness for this engagement'}
        </span>
      </div>
      {answers.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[true, false, null].map((v, i) => (
              <button
                key={i}
                onClick={() => editable && upd(a.id, v)}
                style={{
                  padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: editable ? 'pointer' : 'default',
                  background: a.answer === v ? (v === true ? C.green : v === false ? C.red : C.slate) : C.white,
                  color: a.answer === v ? C.white : C.slate,
                  border: `1px solid ${C.border}`, fontFamily: "'Segoe UI', system-ui, sans-serif",
                }}
              >{v === true ? 'Yes' : v === false ? 'No' : 'Not sure'}</button>
            ))}
          </div>
          <span style={{ fontSize: 14, color: C.navy }}>{a.question}</span>
        </div>
      ))}
    </div>
  )
}

function DecisionTable({ decisions, onChange, editable }: { decisions: CanvasDecision[]; onChange: (d: CanvasDecision[]) => void; editable: boolean }) {
  const add = () => {
    const n = decisions.length + 1
    onChange([...decisions, { id: `CDR-${String(n).padStart(3, '0')}`, date: new Date().toLocaleDateString('en-GB'), phase: 'phase0', decision: '', made_by: '', evidence_ref: '', authorised_by: '' }])
  }
  const upd = (id: string, f: string, v: string) => onChange(decisions.map(d => d.id === id ? { ...d, [f]: v } : d))
  const del = (id: string) => onChange(decisions.filter(d => d.id !== id))
  return (
    <div>
      {decisions.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No decisions recorded yet.</p>}
      {decisions.map(d => (
        <div key={d.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.cyan, fontFamily: 'monospace' }}>{d.id}</span>
            {editable && <button onClick={() => del(d.id)} style={delBtnStyle}>Remove</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Date" value={d.date} onChange={v => upd(d.id, 'date', v)} disabled={!editable} />
            <Field label="Made by" value={d.made_by} onChange={v => upd(d.id, 'made_by', v)} placeholder="Name or role" disabled={!editable} />
            <Field label="Evidence reference" value={d.evidence_ref} onChange={v => upd(d.id, 'evidence_ref', v)} placeholder="e.g. E-001" disabled={!editable} />
          </div>
          <Field label="Decision" value={d.decision} onChange={v => upd(d.id, 'decision', v)} rows={2} placeholder="What was decided?" disabled={!editable} />
          <Field label="Authorised by" value={d.authorised_by} onChange={v => upd(d.id, 'authorised_by', v)} placeholder="Who authorised this decision?" disabled={!editable} />
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Record decision</button>}
    </div>
  )
}

function InterviewTable({ interviews, phaseId, onAdd, onUpdate, editable }: { interviews: InterviewCapture[]; phaseId: PhaseId; onAdd: (i: InterviewCapture) => void; onUpdate: (id: string, i: InterviewCapture) => void; editable: boolean }) {
  const add = () => {
    const n = Date.now()
    onAdd({ id: `INT-${String(interviews.length + 1).padStart(3, '0')}-${n}`, date: new Date().toLocaleDateString('en-GB'), phase: phaseId, respondent: '', role: '', organisation: '', interviewer: '', key_quotes: '', observations: '', follow_up: '', evidence_ref: '' })
  }
  return (
    <div>
      {interviews.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No interviews recorded for this Decision Point yet.</p>}
      {interviews.map(int => (
        <div key={int.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.cyan, fontFamily: 'monospace', margin: '0 0 12px' }}>{int.id}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Field label="Date" value={int.date} onChange={v => onUpdate(int.id, { ...int, date: v })} disabled={!editable} />
            <Field label="Respondent" value={int.respondent} onChange={v => onUpdate(int.id, { ...int, respondent: v })} placeholder="Name" disabled={!editable} />
            <Field label="Their role" value={int.role} onChange={v => onUpdate(int.id, { ...int, role: v })} placeholder="e.g. Procurement Manager" disabled={!editable} />
            <Field label="Organisation" value={int.organisation} onChange={v => onUpdate(int.id, { ...int, organisation: v })} placeholder="Organisation name" disabled={!editable} />
          </div>
          <Field label="Key quotes (verbatim)" value={int.key_quotes} onChange={v => onUpdate(int.id, { ...int, key_quotes: v })} rows={3} placeholder="Capture what they said in their own words. Direct quotes are most valuable." disabled={!editable} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Observations" value={int.observations} onChange={v => onUpdate(int.id, { ...int, observations: v })} rows={2} placeholder="What did you notice beyond what was said?" disabled={!editable} />
            <Field label="Follow-up needed" value={int.follow_up} onChange={v => onUpdate(int.id, { ...int, follow_up: v })} rows={2} placeholder="What needs to happen as a result of this conversation?" disabled={!editable} />
          </div>
          <Field label="Evidence Library reference" value={int.evidence_ref} onChange={v => onUpdate(int.id, { ...int, evidence_ref: v })} placeholder="e.g. E-007" disabled={!editable} />
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Record interview</button>}
    </div>
  )
}

function HypothesisTable({ hypotheses, phaseId, onAdd, onUpdate, editable }: { hypotheses: Hypothesis[]; phaseId: PhaseId; onAdd: (h: Hypothesis) => void; onUpdate: (id: string, h: Hypothesis) => void; editable: boolean }) {
  const add = () => onAdd({ id: `HYP-${String(hypotheses.length + 1).padStart(3, '0')}-${Date.now()}`, phase: phaseId, date_formed: new Date().toLocaleDateString('en-GB'), hypothesis: '', evidence_for: '', evidence_against: '', status: 'holding', decision_made: '' })
  return (
    <div>
      {hypotheses.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No hypotheses recorded for this Decision Point yet.</p>}
      {hypotheses.map(h => (
        <div key={h.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.cyan, fontFamily: 'monospace' }}>{h.id}</span>
            <StatusBadge status={h.status} />
          </div>
          <Field label="Hypothesis" value={h.hypothesis} onChange={v => onUpdate(h.id, { ...h, hypothesis: v })} rows={2} placeholder='e.g. "We believe that agrodealers will pay UGX 50,000 per advisory session because..."' disabled={!editable} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Evidence in favour" value={h.evidence_for} onChange={v => onUpdate(h.id, { ...h, evidence_for: v })} rows={2} placeholder="What supports this hypothesis?" disabled={!editable} />
            <Field label="Evidence against" value={h.evidence_against} onChange={v => onUpdate(h.id, { ...h, evidence_against: v })} rows={2} placeholder="What challenges this hypothesis?" disabled={!editable} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={h.status} onChange={e => onUpdate(h.id, { ...h, status: e.target.value as any })} disabled={!editable} style={{ ...inputStyle, width: '100%' }}>
                <option value="holding">Holding</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <Field label="Decision made" value={h.decision_made} onChange={v => onUpdate(h.id, { ...h, decision_made: v })} placeholder="What did you decide based on this hypothesis?" disabled={!editable} />
          </div>
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Add hypothesis</button>}
    </div>
  )
}

function PilotObsTable({ observations, phaseId, iteration, onAdd, onUpdate, editable }: { observations: PilotObservation[]; phaseId: PhaseId; iteration: 1 | 2; onAdd: (o: PilotObservation) => void; onUpdate: (id: string, o: PilotObservation) => void; editable: boolean }) {
  const add = () => onAdd({ id: `OBS-${iteration}-${Date.now()}`, phase: phaseId, iteration, date: new Date().toLocaleDateString('en-GB'), client_name: '', service_delivered: '', went_well: '', did_not_work: '', client_feedback: '', adjustments_made: '', evidence_ref: '' })
  return (
    <div>
      {observations.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No pilot observations recorded yet. Add one after each delivery.</p>}
      {observations.map(o => (
        <div key={o.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 8 }}>
            <Field label="Date" value={o.date} onChange={v => onUpdate(o.id, { ...o, date: v })} disabled={!editable} />
            <Field label="Client name" value={o.client_name} onChange={v => onUpdate(o.id, { ...o, client_name: v })} placeholder="Organisation name" disabled={!editable} />
          </div>
          <Field label="Service delivered" value={o.service_delivered} onChange={v => onUpdate(o.id, { ...o, service_delivered: v })} placeholder="Describe what was delivered in this session" disabled={!editable} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="What went well" value={o.went_well} onChange={v => onUpdate(o.id, { ...o, went_well: v })} rows={3} placeholder="Be specific. What worked and why?" disabled={!editable} />
            <Field label="What did not work" value={o.did_not_work} onChange={v => onUpdate(o.id, { ...o, did_not_work: v })} rows={3} placeholder="Be honest. What needs to change?" disabled={!editable} />
          </div>
          <Field label="Client feedback (verbatim)" value={o.client_feedback} onChange={v => onUpdate(o.id, { ...o, client_feedback: v })} rows={3} placeholder="Capture what the client said about the service in their own words." disabled={!editable} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Adjustments made for next iteration" value={o.adjustments_made} onChange={v => onUpdate(o.id, { ...o, adjustments_made: v })} rows={2} placeholder="What will change based on this delivery?" disabled={!editable} />
            <Field label="Evidence reference" value={o.evidence_ref} onChange={v => onUpdate(o.id, { ...o, evidence_ref: v })} placeholder="e.g. E-012" disabled={!editable} />
          </div>
        </div>
      ))}
      {editable && <button onClick={add} style={addBtnStyle}>+ Record pilot observation</button>}
    </div>
  )
}

function EvidenceLibrary({ entries, onChange, editable }: { entries: EvidenceEntry[]; onChange: (e: EvidenceEntry[]) => void; editable: boolean }) {
  const add = () => {
    const n = entries.length + 1
    onChange([...entries, { id: `E-${String(n).padStart(3, '0')}`, date: new Date().toLocaleDateString('en-GB'), phase: 'phase0', type: 'document', description: '', url: '', uploaded_by: '', status: 'submitted' }])
  }
  const upd = (id: string, f: string, v: string) => onChange(entries.map(e => e.id === id ? { ...e, [f]: v } : e))
  const del = (id: string) => onChange(entries.filter(e => e.id !== id))
  return (
    <div>
      {entries.length === 0 && <p style={{ color: C.slate, fontSize: 14 }}>No evidence entries yet. Evidence is added here as it is produced throughout the engagement.</p>}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <thead>
            <tr style={{ background: C.navy, color: C.white }}>
              {['Ref', 'Date', 'Phase', 'Type', 'Description', 'Link', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: C.cyan, fontWeight: 700 }}>{e.id}</td>
                <td style={{ padding: '9px 12px' }}><input value={e.date} onChange={ev => upd(e.id, 'date', ev.target.value)} style={{ ...inputStyle, width: 90 }} disabled={!editable} /></td>
                <td style={{ padding: '9px 12px' }}>
                  <select value={e.phase} onChange={ev => upd(e.id, 'phase', ev.target.value)} disabled={!editable} style={{ ...inputStyle, width: 80 }}>
                    {['setup', 'phase0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09', 'handover'].map(p => (
                      <option key={p} value={p}>{getPhaseLabel(p as PhaseId)}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <select value={e.type} onChange={ev => upd(e.id, 'type', ev.target.value)} disabled={!editable} style={{ ...inputStyle, width: 100 }}>
                    {['document', 'interview', 'observation', 'financial_data', 'other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '9px 12px' }}><input value={e.description} onChange={ev => upd(e.id, 'description', ev.target.value)} style={{ ...inputStyle, width: 220 }} placeholder="What is this?" disabled={!editable} /></td>
                <td style={{ padding: '9px 12px' }}>
                  {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontSize: 12 }}>Open</a> : <input value={e.url} onChange={ev => upd(e.id, 'url', ev.target.value)} style={{ ...inputStyle, width: 140 }} placeholder="URL..." disabled={!editable} />}
                </td>
                <td style={{ padding: '9px 12px' }}><StatusBadge status={e.status} /></td>
                <td style={{ padding: '9px 12px' }}>
                  {editable && <button onClick={() => del(e.id)} style={delBtnStyle}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <button onClick={add} style={addBtnStyle}>+ Add evidence entry</button>}
    </div>
  )
}

function CommercialReadiness({ point, scores, onChange, editable }: { point: 'baseline' | 'midpoint' | 'final'; scores: DiagnosticScore[]; onChange: (s: DiagnosticScore[]) => void; editable: boolean }) {
  const existing = scores.find(s => s.point === point)
  const current: Record<string, number> = existing?.scores || {}
  const upd = (ftId: string, v: number) => {
    const updated: DiagnosticScore = { point, date: existing?.date || new Date().toLocaleDateString('en-GB'), scores: { ...current, [ftId]: v }, total: 0, notes: existing?.notes || '' }
    updated.total = Object.values(updated.scores).reduce((a, b) => a + b, 0)
    onChange([...scores.filter(s => s.point !== point), updated])
  }
  const updNotes = (v: string) => {
    const updated: DiagnosticScore = { point, date: existing?.date || new Date().toLocaleDateString('en-GB'), scores: current, total: existing?.total || 0, notes: v }
    onChange([...scores.filter(s => s.point !== point), updated])
  }
  const total = Object.values(current).reduce((a, b) => a + b, 0)
  const maxScore = FIT_TESTS.length * 5

  return (
    <div>
      <div style={{ background: C.cream, padding: 14, borderRadius: 8, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: C.navy, fontSize: 16 }}>
          {point.charAt(0).toUpperCase() + point.slice(1)} Score: {total} / {maxScore}
        </span>
        <div style={{ width: 180, height: 10, background: C.border, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ width: `${(total / maxScore) * 100}%`, height: '100%', background: total >= maxScore * 0.7 ? C.green : total >= maxScore * 0.4 ? C.cyan : C.amber, borderRadius: 5 }} />
        </div>
      </div>
      {FIT_TESTS.map(ft => (
        <div key={ft.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: `1px solid ${C.border}`, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, color: C.navy, margin: '0 0 2px', fontSize: 14 }}>{ft.number} {ft.name}</p>
            <p style={{ color: C.slate, fontSize: 12, margin: 0 }}>{ft.description}</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => editable && upd(ft.id, v)}
                style={{
                  width: 36, height: 36, borderRadius: 6, border: `1px solid ${C.border}`,
                  background: (current[ft.id] || 0) >= v ? C.cyan : C.white,
                  color: (current[ft.id] || 0) >= v ? C.navy : C.slate,
                  cursor: editable ? 'pointer' : 'default', fontWeight: 700, fontSize: 14,
                  fontFamily: "'Segoe UI', system-ui, sans-serif",
                }}
              >{v}</button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: C.slate, minWidth: 30 }}>{current[ft.id] || 0}/5</span>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <Field label="Notes on this diagnostic run" value={existing?.notes || ''} onChange={updNotes} rows={3} placeholder="What drove the scores? What changed since the last run?" disabled={!editable} />
      </div>
    </div>
  )
}

function CommercialReadinessSummary({ scores }: { scores: DiagnosticScore[] }) {
  const baseline = scores.find(s => s.point === 'baseline')
  const midpoint = scores.find(s => s.point === 'midpoint')
  const final = scores.find(s => s.point === 'final')
  const maxScore = FIT_TESTS.length * 5

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 24 }}>
        {[
          { label: 'Baseline', data: baseline, color: C.slate },
          { label: 'Mid-Point', data: midpoint, color: C.cyan },
          { label: 'Final', data: final, color: C.green },
        ].map(p => (
          <div key={p.label} style={{ background: C.cream, padding: 20, borderRadius: 8, textAlign: 'center', borderTop: `4px solid ${p.color}` }}>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{p.label}</p>
            <p style={{ fontSize: 32, fontWeight: 700, color: p.color, margin: '0 0 4px', fontFamily: 'Georgia, serif' }}>
              {p.data ? p.data.total : '—'}
            </p>
            {p.data && <p style={{ fontSize: 12, color: C.slate, margin: 0 }}>out of {maxScore}</p>}
            {p.data && <p style={{ fontSize: 12, color: C.slate, margin: '4px 0 0' }}>{p.data.date}</p>}
          </div>
        ))}
      </div>

      {[baseline, midpoint, final].some(Boolean) && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <thead>
            <tr style={{ background: C.navy, color: C.white }}>
              <th style={{ padding: '9px 14px', textAlign: 'left' }}>Fit Test</th>
              <th style={{ padding: '9px 14px', textAlign: 'center' }}>Baseline</th>
              <th style={{ padding: '9px 14px', textAlign: 'center' }}>Mid-Point</th>
              <th style={{ padding: '9px 14px', textAlign: 'center' }}>Final</th>
            </tr>
          </thead>
          <tbody>
            {FIT_TESTS.map((ft, i) => (
              <tr key={ft.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                <td style={{ padding: '9px 14px', color: C.navy }}>{ft.number} {ft.name}</td>
                <td style={{ padding: '9px 14px', textAlign: 'center', color: C.slate }}>{baseline?.scores[ft.id] || '—'}</td>
                <td style={{ padding: '9px 14px', textAlign: 'center', color: C.cyan }}>{midpoint?.scores[ft.id] || '—'}</td>
                <td style={{ padding: '9px 14px', textAlign: 'center', color: C.green }}>{final?.scores[ft.id] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function NotificationPanel({ settings, onChange, editable }: { settings: any; onChange: (s: any) => void; editable: boolean }) {
  const addRecipient = () => onChange({ ...settings, recipients: [...(settings.recipients || []), { name: '', email: '', role: '', notify_gate_signed: true, notify_gate_authorised: true, notify_evidence_submitted: false, notify_dp_complete: true }] })
  const upd = (i: number, f: string, v: any) => {
    const r = [...settings.recipients]
    r[i] = { ...r[i], [f]: v }
    onChange({ ...settings, recipients: r })
  }
  const del = (i: number) => onChange({ ...settings, recipients: settings.recipients.filter((_: any, idx: number) => idx !== i) })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input type="checkbox" checked={settings.enabled} onChange={e => onChange({ ...settings, enabled: e.target.checked })} disabled={!editable} id="notif-toggle" />
        <label htmlFor="notif-toggle" style={{ fontSize: 14, color: C.navy, fontFamily: "'Segoe UI', system-ui, sans-serif", fontWeight: 600 }}>Enable automatic email notifications</label>
      </div>
      {settings.enabled && (
        <>
          {(settings.recipients || []).map((r: any, i: number) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                <Field label="Name" value={r.name} onChange={v => upd(i, 'name', v)} placeholder="Full name" disabled={!editable} />
                <Field label="Email" value={r.email} onChange={v => upd(i, 'email', v)} placeholder="email@..." disabled={!editable} />
                <Field label="Role" value={r.role} onChange={v => upd(i, 'role', v)} placeholder="e.g. CEO" disabled={!editable} />
                {editable && <button onClick={() => del(i)} style={delBtnStyle}>Remove</button>}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
                {[
                  { f: 'notify_gate_signed', l: 'Gate signed' },
                  { f: 'notify_gate_authorised', l: 'Coach authorisation' },
                  { f: 'notify_evidence_submitted', l: 'Evidence submitted' },
                  { f: 'notify_dp_complete', l: 'DP complete' },
                ].map(opt => (
                  <label key={opt.f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.navy }}>
                    <input type="checkbox" checked={r[opt.f]} onChange={e => upd(i, opt.f, e.target.checked)} disabled={!editable} />
                    {opt.l}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {editable && <button onClick={addRecipient} style={addBtnStyle}>+ Add recipient</button>}
        </>
      )}
    </div>
  )
}

// ─── FUNDER VIEW ──────────────────────────────────────────────
function FunderView({ state }: { state: CanvasEngagementState }) {
  const order = getPhaseOrder()
  const baseline = state.diagnostic_scores.find(s => s.point === 'baseline')
  const midpoint = state.diagnostic_scores.find(s => s.point === 'midpoint')
  const final = state.diagnostic_scores.find(s => s.point === 'final')
  const maxScore = FIT_TESTS.length * 5

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.cream, minHeight: '100vh' }}>
      <header style={{ background: C.navy, padding: '16px 24px', color: C.white, borderBottom: `3px solid ${C.cyan}` }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, color: C.cyan, letterSpacing: 1, textTransform: 'uppercase' }}>Canvas Coach | habibonifade.com — Funder View</p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, margin: 0 }}>{state.engagement_title}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#A0B4C8' }}>Read-only dashboard for {state.funder} programme staff</p>
      </header>
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <PrintBtn label="Print full progress report" />
        </div>

        <Section title="Engagement Overview">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { l: 'Client', v: state.client_name },
              { l: 'Programme', v: state.programme },
              { l: 'Lead Consultant', v: state.lead_consultant },
              { l: 'Start Date', v: state.start_date || 'Not set' },
            ].map(i => (
              <div key={i.l} style={{ background: C.white, padding: 16, borderRadius: 8, borderLeft: `3px solid ${C.cyan}` }}>
                <p style={{ fontSize: 11, color: C.slate, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{i.l}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: 0, fontFamily: 'Georgia, serif' }}>{i.v}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Decision Point Progress">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.navy, color: C.white }}>
                {['Phase', 'Zone', 'Status', 'CEO Sign-Off', 'Coach Authorisation', 'Coach Note', 'Date'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CANVAS_DECISION_POINTS.map((dp, i) => {
                const g = state.gate_signoffs[dp.id]
                return (
                  <tr key={dp.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: C.cyan }}>{dp.number}</td>
                    <td style={{ padding: '9px 12px', color: C.navy, maxWidth: 180 }}>{dp.zone}</td>
                    <td style={{ padding: '9px 12px' }}><StatusBadge status={g?.status || 'locked'} /></td>
                    <td style={{ padding: '9px 12px' }}>{g?.ceo_signed ? <span style={{ color: C.green, fontWeight: 600 }}>Yes — {g.ceo_name}</span> : '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{g?.coach_authorised ? <span style={{ color: C.amber, fontWeight: 600 }}>Yes</span> : '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: C.slate }}>{g?.coach_note || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>{g?.ceo_date || g?.coach_date || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Commercial Readiness Diagnostic Progression">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 24 }}>
            {[
              { label: 'Baseline', data: baseline, color: C.slate },
              { label: 'Mid-Point', data: midpoint, color: C.cyan },
              { label: 'Final', data: final, color: C.green },
            ].map(p => (
              <div key={p.label} style={{ background: C.white, padding: 20, borderRadius: 8, textAlign: 'center', borderTop: `4px solid ${p.color}` }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{p.label}</p>
                <p style={{ fontSize: 36, fontWeight: 700, color: p.color, margin: '0 0 4px', fontFamily: 'Georgia, serif' }}>
                  {p.data ? p.data.total : 'Pending'}
                </p>
                {p.data && <p style={{ fontSize: 12, color: C.slate, margin: 0 }}>out of {maxScore} &nbsp;|&nbsp; {p.data.date}</p>}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Evidence Summary by Decision Point">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.navy, color: C.white }}>
                {['DP', 'Zone', 'Components with evidence', 'Interviews', 'Hypotheses'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CANVAS_DECISION_POINTS.map((dp, i) => {
                const compEvidence = Object.values(state.component_evidence).filter(e => e.component_id.startsWith(dp.id) && e.status === 'submitted').length
                const interviews = state.interviews.filter(int => int.phase === dp.id).length
                const hypotheses = state.hypotheses.filter(h => h.phase === dp.id).length
                return (
                  <tr key={dp.id} style={{ background: i % 2 === 0 ? C.cream : C.white }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: C.cyan }}>{dp.number}</td>
                    <td style={{ padding: '9px 12px', color: C.navy }}>{dp.zone}</td>
                    <td style={{ padding: '9px 12px' }}>{compEvidence} / 9</td>
                    <td style={{ padding: '9px 12px' }}>{interviews}</td>
                    <td style={{ padding: '9px 12px' }}>{hypotheses}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Coach-Authorised Gate Overrides">
          {CANVAS_DECISION_POINTS.filter(dp => state.gate_signoffs[dp.id]?.coach_authorised).length === 0
            ? <p style={{ color: C.green, fontSize: 14 }}>No coach-authorised gate overrides in this engagement.</p>
            : CANVAS_DECISION_POINTS.filter(dp => state.gate_signoffs[dp.id]?.coach_authorised).map(dp => {
              const g = state.gate_signoffs[dp.id]
              return (
                <div key={dp.id} style={{ background: '#FFF3CD', padding: 14, borderRadius: 8, marginBottom: 10 }}>
                  <p style={{ fontWeight: 700, color: C.amber, margin: '0 0 6px' }}>{dp.number} — {dp.zone}</p>
                  <p style={{ margin: 0, color: C.navy, fontSize: 14 }}><strong>Coach note:</strong> {g.coach_note}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: C.slate }}>Authorised on {g.coach_date}</p>
                </div>
              )
            })
          }
        </Section>
      </main>
    </div>
  )
}

// ─── STYLE CONSTANTS ──────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 4,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  fontSize: 13, fontFamily: "'Segoe UI', system-ui, sans-serif",
  background: C.white, color: C.navy, boxSizing: 'border-box',
}

const addBtnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px dashed ${C.cyan}`, color: C.cyan,
  padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  fontFamily: "'Segoe UI', system-ui, sans-serif", marginTop: 8,
}

const delBtnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.border}`, color: C.red,
  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
}
