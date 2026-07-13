// ============================================================
// API ROUTE: /api/investment-pitch
// Coach-triggered generation of a client's Investment Readiness Brief.
// See src/lib/investment-brief-builder.ts for the actual document build
// -- shared with the token-based external-access route.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { buildInvestmentBrief } from '@/lib/investment-brief-builder'

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const { buffer, fileName } = await buildInvestmentBrief(clientId)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Investment pitch error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: err.status || 500 })
  }
}
