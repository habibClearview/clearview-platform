// The canvas in full, plus the two things that happen before Decision Point 1
// and the two that run underneath. Those are the parts most proposals leave
// out, and they are the reason the method is worth buying.
import type { Metadata } from 'next'
import Link from 'next/link'
import { C } from '@/components/site/tokens'
import { DIAGRAM_CSS, CanvasDiagram } from '@/components/site/Diagrams'

export const metadata: Metadata = {
  title: 'The method — Grant to Commercial Viability Canvas',
  description:
    'Nine decisions in order, each closed on evidence and signed before the next opens. Plus the charter and the diagnostic that come before any of it starts.',
}

const BEFORE = [
  { t: 'The charter', d: 'What each side is committing to, in writing, before any work starts. Signed by you and by me.' },
  { t: 'Three questions', d: 'Asked of your chief executive out loud, with everyone in the room, written down in their own words. What commercial success looks like in eighteen months. What is stopping you earning now. What would have to be true to stop needing grants.' },
  { t: 'Both signed, or nothing opens', d: 'If those answers are weak, we do not start. I would rather lose the work than take your money for something that ends up as a document.' },
  { t: 'Clearing the ground', d: 'Every service you actually run, written down before any of it is judged.' },
]

export default function Method() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DIAGRAM_CSS }} />
      <section style={{ background: C.ink, paddingBottom: 70 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>The method</p>
          <h1 style={{ margin: '24px 0 0' }}>
            Nine decisions.
            <span style={{ display: 'block', color: C.cyan }}>Taken in order.</span>
          </h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '58ch', opacity: 0.86 }}>
            Left is what you can do. Right is what the market will pay for. The middle joins the
            two. The diagnostic runs underneath, scored three times so the movement is the finding.
          </p>
        </div>
      </section>

      <section style={{ background: C.cream, color: C.ink, paddingTop: 60 }}>
        <div className="wrap" data-reveal><CanvasDiagram /></div>
      </section>

      <section>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }} data-reveal>Before Decision Point 1 opens</p>
          <h2 style={{ margin: '22px 0 20px' }} data-reveal>The part most proposals leave out.</h2>
          <p className="lede" style={{ opacity: 0.84, maxWidth: '60ch', marginBottom: 44 }} data-reveal>
            Nothing starts until two things are signed, and either of them can stop the engagement
            before a penny is spent on delivery.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 2 }}>
            {BEFORE.map((b) => (
              <div key={b.t} data-reveal style={{ background: 'rgba(245,245,220,.06)', padding: '30px 26px' }}>
                <h4>{b.t}</h4>
                <p style={{ marginTop: 12, opacity: 0.82, fontSize: 17 }}>{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: C.inkDeep }}>
        <div className="wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 44 }}>
            <div data-reveal>
              <p className="eyebrow" style={{ color: C.cyan }}>Runs underneath all of it</p>
              <h3 style={{ margin: '18px 0 14px' }}>The evidence library</h3>
              <p style={{ opacity: 0.84 }}>
                Every decision closes on evidence, filed against the decision it supports.
                Interviews, cost figures, pricing tests, pilot results, what clients actually said.
                No evidence, no close. The library is yours at the end.
              </p>
            </div>
            <div data-reveal>
              <p className="eyebrow" style={{ color: C.cyan }}>Five tests, done without me</p>
              <h3 style={{ margin: '18px 0 14px' }}>How it ends</h3>
              <p style={{ opacity: 0.84 }}>
                At handover your team presents its own commercial model, alone, with me in the room
                saying nothing. The model stays with you, built so somebody without a finance
                background can keep it current.
              </p>
            </div>
          </div>
          <p style={{ marginTop: 44 }} data-reveal>
            <Link className="btn" href="/score">Score your organisation</Link>
          </p>
        </div>
      </section>
    </>
  )
}
