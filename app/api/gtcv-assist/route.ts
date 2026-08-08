// ============================================================
// API ROUTE: /api/gtcv-assist
//
// Coaching assistance for the GtCV surfaces. Three narrow tasks, each one a
// piece of synthesis a coach does by hand between sessions:
//
//   synthesise_interviews  Given the interview captures, name the problem
//                          statements that converge, the strongest budget
//                          signals, and what is still unproven.
//   draft_proposition      Given segment, problem, outcome and
//                          differentiation, draft the four part value
//                          proposition in the customer's own language.
//   summarise_evidence     Given a gate and its evidence entries, write a
//                          short pack summary a funder can read.
//
// THE RULE THAT MATTERS MOST: this route must never invent evidence. The
// whole method exists to stop organisations building commercial models on
// assumptions dressed up as findings, and a model that fills a thin gap with
// a plausible sentence would do exactly that, faster and more convincingly
// than a person could. So the system prompt is explicit: work only from the
// payload, quote rather than paraphrase where language matters, and say
// plainly when something is not supported. Saying the evidence is thin is a
// correct answer here, not a failed one.
//
// EVERY RESPONSE IS A DRAFT. Nothing here writes to a table. The route
// returns text, the coach reads it, and the coach decides whether it is right
// before it becomes part of the engagement record. AssistPanel enforces the
// same thing on the screen with Accept and Discard.
//
// SECURITY: service-role route, so it authenticates the caller itself,
// authorizes with resolveClientAccess against the client whose material is in
// the payload, and rate limits per user because it spends the server's
// Anthropic budget. Errors returned to the caller are generic: an error
// message is not a place to leak schema, keys or another tenant's data.
//
// Follows the existing proxy pattern in app/api/ai-generate/route.ts,
// including its behaviour when ANTHROPIC_API_KEY is absent: a plain 503 that
// says the feature is not configured, so the surface degrades to manual work
// rather than breaking.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'

// The shared instruction. It sits in front of every task, and every line of
// it is there to stop the model doing a coach's thinking for them.
const ASSIST_GUARD = [
  'You are assisting a coach working through the Grant to Commercial Viability method with an organisation moving from grant funding to commercial revenue.',
  'You work only from the material supplied in this request. You have no other knowledge of this organisation, its market, its customers or its finances.',
  'Never invent a finding, a quote, a number, a customer, a budget holder or an outcome. If a claim is not in the supplied material, it does not exist.',
  'Where the customer\'s own words are supplied, use those words. Do not smooth them into consultant language.',
  'When the supplied material does not support a conclusion, say so plainly and say what evidence would be needed. Reporting that the evidence is thin is a correct and useful answer.',
  'Do not flatter the material and do not soften a weakness. The coach needs to know where the gaps are, not to feel reassured.',
  'This is a draft for the coach to accept or reject. Write it as a draft, not as a decision.',
].join(' ')

interface TaskSpec {
  /** What the model is asked to produce. */
  instruction: string
  /** Output ceiling, sized to the task. */
  maxTokens: number
}

const TASKS: Record<string, TaskSpec> = {
  synthesise_interviews: {
    instruction: [
      'The material below is a set of interview captures from customer validation conversations.',
      'Produce three sections, in this order, each introduced by its name on its own line.',
      'Converging problem statements. The problems that more than one interview points at, written in the interviewees\' own words where those words are supplied, with a note of how many interviews support each one. A problem raised in only one interview is a single observation, and you must label it as one.',
      'Strongest budget signals. Where an interviewee named a budget, a budget holder, a spend they already make, or a purchase they already authorise. Quote the signal. A general statement that something is important is interest, not a budget signal, and you must not present it as one.',
      'Still unproven. What the conversations have not established: which problems have no named budget holder, which segments have not been spoken to, and what a further conversation would need to ask. Be specific about the gap.',
      'If the material contains too few interviews to converge on anything, say that directly and stop.',
    ].join(' '),
    maxTokens: 1600,
  },
  draft_proposition: {
    instruction: [
      'The material below gives a customer segment, the problem in the customer\'s language, the outcome the customer gets, and the differentiation.',
      'Draft a value proposition in four parts, each introduced by its name on its own line: Capability, Problem, Outcome, Differentiation.',
      'Capability states what the organisation does, specifically enough that a customer could hold them to it.',
      'Problem is written in the customer\'s words as supplied, not reworded into the organisation\'s language.',
      'Outcome is the measurable result the customer gets. Use only figures present in the material. If no measured outcome is supplied, say that the outcome is not yet evidenced and name what the pilot would need to measure.',
      'Differentiation must pass the proof test: if a customer asked the organisation to prove it, could they, from the material supplied? If not, say so.',
      'Then, under a line reading Combined, write the four parts as two or three sentences a person could say out loud. If it reads like marketing copy rather than a direct statement of value, rewrite it before returning it.',
    ].join(' '),
    maxTokens: 1200,
  },
  summarise_evidence: {
    instruction: [
      'The material below is a decision gate and the evidence entries recorded against it.',
      'Write a short pack summary that a funder could read on its own, in four short paragraphs and nothing else.',
      'First, what this gate asked and what the organisation decided.',
      'Second, the evidence that supports the decision, naming the source of each piece.',
      'Third, what the evidence does not cover, stated plainly.',
      'Fourth, what happens next and what evidence the next stage will produce.',
      'Use only the entries supplied. Do not describe evidence that is not listed. If the gate has no evidence recorded against it, say that the gate has no evidence pack yet and stop.',
    ].join(' '),
    maxTokens: 1400,
  },
}

const TASK_NAMES = Object.keys(TASKS)

// Payloads are structured data from a working surface, not free prose, so a
// generous but finite ceiling is right. Beyond this the caller should be
// narrowing what they send rather than sending everything.
const MAX_PAYLOAD_CHARS = 40000

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      clientId?: string
      task?: string
      payload?: unknown
    }
    const { clientId, task, payload } = body

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }
    if (!task || !TASK_NAMES.includes(task)) {
      return NextResponse.json({ error: 'Unknown task' }, { status: 400 })
    }
    if (payload === undefined || payload === null) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    // Authenticate. This route spends the server's Anthropic key and reads
    // engagement material, so an unauthenticated caller is both a billing
    // hole and a data hole.
    const admin = getAdminClient()
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Authorize against this specific client. Being signed in is not enough:
    // the payload is one engagement's material, and only people who can see
    // that engagement may have it synthesised.
    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorised for this engagement' }, { status: 403 })
    }

    // Rate limit per user. Twenty drafts an hour is far more than a coaching
    // session needs and far less than a runaway loop would use.
    const rl = await checkRateLimit(admin, `gtcv-assist:${user.id}`, 20, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many drafts requested recently. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const spec = TASKS[task]
    const material = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    if (material.length > MAX_PAYLOAD_CHARS) {
      return NextResponse.json(
        { error: 'Too much material for one draft. Narrow the selection and try again.' },
        { status: 400 },
      )
    }
    if (material.trim().length === 0 || material.trim() === '{}' || material.trim() === '[]') {
      return NextResponse.json(
        { error: 'There is nothing recorded yet to work from.' },
        { status: 400 },
      )
    }

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      // Same graceful behaviour as ai-generate: the surface tells the coach
      // the assistance is switched off and the work continues by hand.
      return NextResponse.json(
        { error: 'AI assistance is not configured. Set ANTHROPIC_API_KEY in the environment variables.' },
        { status: 503 },
      )
    }

    const prompt = [
      spec.instruction,
      '',
      'MATERIAL SUPPLIED. This is everything you know. Nothing outside it is available to you.',
      material,
    ].join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: spec.maxTokens,
        system: `${CLEARVIEW_STYLE} ${ASSIST_GUARD}`,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      // Generic on purpose. The upstream message can carry account and key
      // detail that has no business reaching a browser.
      return NextResponse.json({ error: 'The draft could not be generated. Please try again.' }, { status: 502 })
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text || ''
    if (!text) {
      return NextResponse.json({ error: 'The draft came back empty. Please try again.' }, { status: 502 })
    }

    // A draft, and labelled as one. Nothing has been written anywhere: the
    // coach accepts or discards it on the surface that asked for it.
    return NextResponse.json({ draft: text, task, status: 'draft' })
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
