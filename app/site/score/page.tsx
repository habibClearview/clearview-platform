import type { Metadata } from 'next'
import { C } from '@/components/site/tokens'
import ScoreFlow, { SCORE_CSS } from '@/components/site/ScoreFlow'
import { FORM_CSS } from '@/components/site/CaptureForm'

export const metadata: Metadata = {
  title: 'Score your organisation — commercial readiness in two minutes',
  description:
    'Ten questions, the same ten asked in a first session. A score, your gaps named, what being wrong about each one costs, and one next step.',
  openGraph: {
    title: 'Where does your organisation actually stand?',
    description: 'Ten questions. Two minutes. Your gaps named, and where your work starts.',
    type: 'website',
  },
}

export default function Score() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SCORE_CSS + FORM_CSS }} />
      <section style={{ paddingBottom: 50 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>The readiness diagnostic</p>
          <h1 style={{ margin: '24px 0 0' }}>Find out where you stand.</h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '58ch', opacity: 0.86 }}>
            A report naming where your work starts, and what being wrong about each gap costs you.
          </p>
        </div>
      </section>
      <section style={{ paddingTop: 0, paddingBottom: 110 }}>
        <div className="wrap"><ScoreFlow /></div>
      </section>
    </>
  )
}
