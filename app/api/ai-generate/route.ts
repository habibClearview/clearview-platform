// ============================================================
// API ROUTE: /api/ai-generate
// Server-side proxy for Clearview Intelligence narratives.
// The dashboards (health check, monthly narrative) build a prompt
// client-side and POST it here; the ANTHROPIC_API_KEY lives only on
// the server, never in the browser. Returns { text }.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'

export async function POST(req: NextRequest) {
  try {
    const { prompt, max_tokens } = await req.json() as { prompt?: string; max_tokens?: number }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      return NextResponse.json(
        { error: 'AI is not configured. Set ANTHROPIC_API_KEY in the Vercel environment variables.' },
        { status: 503 },
      )
    }

    // Bound the output so a single call cannot run away with cost.
    const cappedTokens = Math.min(Math.max(Number(max_tokens) || 1000, 1), 2000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: cappedTokens,
        system: CLEARVIEW_STYLE,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'AI request failed' },
        { status: 502 },
      )
    }

    const text = data.content?.[0]?.text || ''
    return NextResponse.json({ text })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
