// @ts-nocheck
'use client'
// ============================================================
// INTERVIEW BRIEFING -- the eight rules
//
// Reference only. No data, no props, no writes. This is the briefing every
// field team member reads before going into the field, rendered in the
// product so it travels with the engagement instead of sitting in a
// spreadsheet tab nobody opens.
//
// The eight rules are the method's, in the method's order. The two rules
// that carry a do not ask / instead ask list (rule 3 and rule 5) keep that
// list, because the difference between those two columns is the whole point
// of the rule.
//
// Pairs with InterviewCaptureForm.tsx, which is where the conversation is
// written up within 30 minutes of it ending.
//
// CLIENT AGNOSTIC: nothing here is client specific.
// ============================================================

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.45 }
const ruleNo = { fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }
const ruleTitle = { fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 700, color: C.navy, marginTop: '0.1rem' }
const ruleBody = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.55, marginTop: '0.45rem' }
const listLbl = { fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.3rem' }

// The eight rules. avoid = what not to ask, instead = what to ask in its
// place. Only rules 3 and 5 carry those lists in the method.
const RULES = [
  {
    title: "Go in with a beginner's mind",
    body: 'Even though you have debated these problems internally, treat each conversation as if you know nothing. Do not try to prove that the problem is real or that your organisation can solve it. Listen as if this is the first time you are hearing it. If something unexpected comes up, follow it. That is where the real insight usually sits.',
  },
  {
    title: 'Talk less. Listen more.',
    body: 'If you speak for 40% of the conversation, it is too much. This is not a presentation. Use prompts: "Can you expand on that?" "What happened next?" "What did you do then?" Silence is not awkward. Silence is data.',
  },
  {
    title: 'Get facts, not opinions',
    body: 'You are testing the problem through actual behaviour, not polite agreement.',
    avoid: ['Would this be useful?', 'Would you pay for something like this?', 'Do you think this is important?'],
    instead: ['When was the last time you dealt with this issue?', 'How did you handle it?', 'What did it cost you?', 'Who was involved in the decision?'],
  },
  {
    title: 'Ask why until you hit something real',
    body: 'If someone says their revenue is declining, ask why. What changed? Why did that matter? Why was that difficult? Keep going until you hit budget tension, reputation risk, audience loss, or management pressure. That is where motivation sits.',
  },
  {
    title: 'Remember: we are learning, not selling',
    body: 'You are learning their decision criteria, not pitching yours.',
    avoid: ['Would you buy this?', 'Would you come to an exhibition?'],
    instead: ['How do you decide which new initiatives to invest in?', 'What makes something commercially viable for you?', 'What would have to be true for you to prioritise this?'],
  },
  {
    title: 'Do not introduce solutions too early',
    body: 'The moment you suggest a solution, the conversation becomes biased. People naturally want to be agreeable. We want raw reality. Avoid saying "What if we created a service for you?" or "What if we helped you with this?" Wait. Listen first. Understand the problem fully before mentioning any solution.',
  },
  {
    title: 'Follow up. This is not one conversation',
    body: 'At the end ask: "Would you be open to a follow up conversation once we refine our thinking?" As you validate the problems, new questions will emerge. We will need to return to some of these contacts. A warm introduction is faster than cold outreach.',
  },
  {
    title: 'Always open one more door',
    body: 'Before closing every conversation ask: "Is there anyone else you think we should speak to about this?" "Who else feels this pressure more strongly?" Warm introductions accelerate the pipeline.',
  },
]

// What the conversations are actually testing.
const TESTS = ['Urgent', 'Expensive', 'Recurring', 'Linked to revenue or cost pressure', 'Worth solving commercially']

export default function InterviewBriefing() {
  return (
    <div style={card}>
      <div style={secH}>Interview Briefing</div>
      <div style={{ ...hint, marginTop: '0.25rem' }}>
        Eight rules. Read this before going into the field, every conversation. These rules are non
        negotiable. Reference only, nothing on this page is recorded.
      </div>

      <div style={{ background: C.alt, borderLeft: `3px solid ${C.cyan}`, borderRadius: 8, padding: '0.7rem 0.9rem', margin: '1rem 0 1.2rem', fontSize: '1.01rem', color: C.navy, lineHeight: 1.5 }}>
        The customer validation conversation is not an interview. It is an informal discussion
        between two people. The client should not know they are being assessed. Your job is to
        listen, prompt and observe, not to present, pitch, or ask direct questions about price.
      </div>

      {RULES.map((r, i) => (
        <div key={r.title} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '0.8rem' }}>
          <div style={ruleNo}>Rule {i + 1}</div>
          <div style={ruleTitle}>{r.title}</div>
          <div style={ruleBody}>{r.body}</div>

          {(r.avoid || r.instead) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0.75rem', marginTop: '0.8rem' }}>
              <div style={{ background: C.alt, borderLeft: `3px solid ${C.red}`, borderRadius: 8, padding: '0.6rem 0.8rem' }}>
                <div style={{ ...listLbl, color: C.red }}>Do not ask</div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '1.01rem', color: C.navy, lineHeight: 1.6 }}>
                  {r.avoid.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
              <div style={{ background: C.alt, borderLeft: `3px solid ${C.green}`, borderRadius: 8, padding: '0.6rem 0.8rem' }}>
                <div style={{ ...listLbl, color: C.green }}>Ask instead</div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '1.01rem', color: C.navy, lineHeight: 1.6 }}>
                  {r.instead.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '1.2rem', paddingTop: '1rem' }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 700, color: C.navy }}>
          What these conversations are testing
        </div>
        <div style={{ ...hint, marginTop: '0.3rem' }}>
          Whether the selected problems are:
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.6rem 0 0.9rem' }}>
          {TESTS.map((t) => (
            <span key={t} style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 999, padding: '0.2rem 0.7rem' }}>{t}</span>
          ))}
        </div>
        <div style={{ ...hint, color: C.navy }}>
          If interviews only confirm that problems are interesting, but not urgent or funded, we
          adjust. The goal is not to validate our thinking. The goal is to refine it until it can
          stand on its own commercially.
        </div>
      </div>

      <div style={{ ...hint, marginTop: '1rem', fontSize: '0.95rem' }}>
        Write every conversation up in the Interview Capture form within 30 minutes of it ending.
        Verbatim first. No polishing.
      </div>
    </div>
  )
}
