// The enquiry. The message goes to Habib by email and never to the mailing
// list: somebody describing a confidential situation has not consented to
// having it stored in a marketing tool.
import type { Metadata } from 'next'
import { C } from '@/components/site/tokens'
import CaptureForm, { FORM_CSS } from '@/components/site/CaptureForm'

export const metadata: Metadata = {
  title: 'Contact — tell me where you are stuck',
  description:
    'A short note is enough. What you do, who pays for it now, and what happens when that stops.',
}

export default function Contact() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FORM_CSS }} />
      <section style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>Contact</p>
          <h1 style={{ margin: '24px 0 0' }}>Tell me where you are stuck.</h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '60ch', opacity: 0.86 }}>
            A short note is enough. What you do, who pays for it now, and what happens when that
            stops. I reply to everything myself.
          </p>
        </div>
      </section>

      <section style={{ background: C.cream, color: C.ink, paddingTop: 60 }}>
        <div className="wrap">
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 56, alignItems: 'start' }}>
            <div data-reveal>
              <CaptureForm source="enquiry" cta="Send it" withOrg withMessage
                note="Your note comes to me by email and is not added to any list. If you tick nothing else, nothing else happens."
                done={{ head: 'That has reached me.', body: 'I read everything myself and usually reply within two working days.' }} />
            </div>
            <div data-reveal>
              <h4>Where I am</h4>
              <p style={{ color: C.slate, marginTop: 12 }}>
                Based in Nairobi. I work across East, West and Southern Africa.
              </p>
              <h4 style={{ marginTop: 30 }}>If it is urgent</h4>
              <p style={{ color: C.slate, marginTop: 12 }}>
                Write to <a href="mailto:hello@habibonifade.com" style={{ color: C.teal, fontWeight: 600 }}>hello@habibonifade.com</a>{' '}
                and put URGENT in the subject.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
