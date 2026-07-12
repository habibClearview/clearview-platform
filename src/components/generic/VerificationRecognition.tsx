'use client'

// Client-facing "Verification & Recognition" panel. Shows the business:
//  - where their mobile-money verification stands (the readiness message),
//  - how trustworthy this period's figures are (the confidence label), and
//  - the badges they've earned + how to earn the rest.
//
// Self-contained and additive: it reads the new provider_links /
// provider_transactions tables for reconciliation data, defaulting gracefully
// to "works today on your own records" when nothing is linked yet -- so it is
// useful and honest immediately (record-based badges light up now), and the
// Payments Verified badge switches on once reconciliation runs. It changes no
// existing view or scoring. See docs/RECONCILIATION_SPEC.md §5, §7, §8.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { assessConfidence } from '@/lib/confidence'
import {
  CONFIDENCE_DISPLAY, BADGE_DISPLAY, READINESS_DISPLAY,
  buildPeriodSignals, partitionBadges, type ReadinessStatus,
} from '@/lib/verification-display'

const C = {
  navy: 'var(--cv-navy)', card: 'var(--cv-card)', border: 'var(--cv-border-soft)',
  slate: 'var(--cv-slate)', cyan: 'var(--cv-cyan)', onAccent: 'var(--cv-on-accent)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', alt: 'var(--cv-alt)',
}
const toneColor = (tone: 'good' | 'neutral' | 'warn') =>
  tone === 'good' ? C.green : tone === 'warn' ? C.amber : C.slate

// Most-progressed link wins, so a client with several providers shows the
// furthest-along status.
const STATUS_RANK: Record<ReadinessStatus, number> = {
  not_started: 0, wallet_activated: 1, link_pending: 2, tier1_active: 3,
}

export interface VerificationRecognitionProps {
  clientId: string
  monthsElapsed: number
  monthsWithActuals: number
  monthsClosed: number
  fieldDataMonths: number
  declaredValue?: number
}

export default function VerificationRecognition({
  clientId, monthsElapsed, monthsWithActuals, monthsClosed, declaredValue = 0,
}: VerificationRecognitionProps) {
  const [readiness, setReadiness] = useState<ReadinessStatus>('not_started')
  const [matchedValue, setMatchedValue] = useState(0)
  const [unattributedValue, setUnattributedValue] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: links } = await supabase
          .from('provider_links').select('status').eq('client_id', clientId)
        if (!cancelled && links && links.length > 0) {
          const best = links.reduce((acc: ReadinessStatus, r: { status?: string }) => {
            const s = (r.status as ReadinessStatus) || 'not_started'
            return STATUS_RANK[s] > STATUS_RANK[acc] ? s : acc
          }, 'not_started' as ReadinessStatus)
          setReadiness(best)
        }
        const { data: ptx } = await supabase
          .from('provider_transactions').select('amount,reconciliation_state').eq('client_id', clientId)
        if (!cancelled && ptx) {
          let matched = 0, unatt = 0
          for (const t of ptx as { amount?: number; reconciliation_state?: string }[]) {
            if (t.reconciliation_state === 'matched') matched += Number(t.amount) || 0
            else if (t.reconciliation_state === 'unattributed_inbound') unatt += Number(t.amount) || 0
          }
          setMatchedValue(matched)
          setUnattributedValue(unatt)
        }
      } catch {
        // Tables may be empty or unreachable in a given environment -- the
        // panel simply shows the record-based state, never an error.
      }
    }
    if (clientId) load()
    return () => { cancelled = true }
  }, [clientId])

  const signals = buildPeriodSignals({
    declaredValue,
    matchedValue,
    unattributedInboundValue: unattributedValue,
    hasActuals: monthsWithActuals > 0,
    recordsComplete: monthsElapsed > 0 && monthsWithActuals >= monthsElapsed,
    cogsConsistent: false, // deepened when the triangulation fallback is wired
    internallyConsistent: true,
    monthsConsistentStreak: monthsWithActuals,
    monthClosedOnTime: monthsClosed > 0,
  })
  const confidence = assessConfidence(signals)
  const { earned, locked } = partitionBadges(confidence.badges)

  const readinessInfo = READINESS_DISPLAY[readiness]
  const confInfo = CONFIDENCE_DISPLAY[confidence.label]

  return (
    <div>
      {/* Readiness banner -- the client-visible "verification switches on shortly" message */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.9rem 1.1rem',
        borderRadius: 12, marginBottom: '1.1rem',
        background: C.alt, borderLeft: `4px solid ${toneColor(readinessInfo.tone)}`,
      }}>
        <span style={{ fontSize: '1.4rem' }}>{readiness === 'tier1_active' ? '🔗' : '📲'}</span>
        <div>
          <div style={{ fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy, fontSize: '1rem' }}>{readinessInfo.title}</div>
          <div style={{ color: C.slate, fontSize: '0.9rem' }}>{readinessInfo.blurb}</div>
        </div>
      </div>

      {/* Confidence label for this period */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.1rem', padding: '1.1rem',
        borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: '1.3rem',
      }}>
        <ConfidenceRing score={confidence.score} color={toneColor(confInfo.tone)} />
        <div>
          <div style={{
            display: 'inline-block', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700,
            padding: '0.15rem 0.55rem', borderRadius: 6, marginBottom: '0.4rem',
            background: toneColor(confInfo.tone), color: C.onAccent, textTransform: 'uppercase',
          }}>{confInfo.title}</div>
          <div style={{ color: C.navy, fontSize: '0.95rem', maxWidth: 520 }}>{confInfo.blurb}</div>
        </div>
      </div>

      {/* Earned badges */}
      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
        Recognition earned
      </div>
      {earned.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.9rem', marginBottom: '1.2rem' }}>
          No badges yet — keep recording each month and the first ones arrive quickly.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', marginBottom: '1.3rem' }}>
          {earned.map(b => (
            <div key={b} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.95rem',
              borderRadius: 12, background: C.card, border: `1px solid ${C.cyan}`, minWidth: 210,
            }}>
              <span style={{ fontSize: '1.4rem' }}>{BADGE_DISPLAY[b].icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: C.navy, fontSize: '0.92rem' }}>{BADGE_DISPLAY[b].title}</div>
                <div style={{ color: C.slate, fontSize: '0.82rem' }}>{BADGE_DISPLAY[b].earnedBlurb}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Locked badges -- how to earn */}
      {locked.length > 0 && (
        <>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            How to earn more
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
            {locked.map(b => (
              <div key={b} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.95rem',
                borderRadius: 12, background: C.alt, border: `1px dashed ${C.border}`, minWidth: 210, opacity: 0.85,
              }}>
                <span style={{ fontSize: '1.4rem', filter: 'grayscale(1)' }}>{BADGE_DISPLAY[b].icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: C.slate, fontSize: '0.92rem' }}>{BADGE_DISPLAY[b].title}</div>
                  <div style={{ color: C.slate, fontSize: '0.82rem' }}>{BADGE_DISPLAY[b].howToEarn}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ConfidenceRing({ score, color }: { score: number; color: string }) {
  const deg = Math.max(0, Math.min(100, score)) * 3.6
  return (
    <div style={{
      width: 74, height: 74, borderRadius: '50%', flexShrink: 0,
      background: `conic-gradient(${color} ${deg}deg, var(--cv-alt) ${deg}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: 'var(--cv-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, color: 'var(--cv-navy)', fontSize: '1.05rem',
      }}>{Math.round(score)}</div>
    </div>
  )
}
