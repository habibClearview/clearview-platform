// ============================================================
// API ROUTE: /api/session-join
// Turning a code somebody typed into the session it belongs to.
//
// WHY IT EXISTS. A session link is sixty odd characters. The QR code puts it on
// a phone, and the copy button moves it around one machine, but somebody who
// wants it in the browser on their laptop has to type it, and nobody types
// sixty random characters correctly. This takes eight characters read off the
// screen at the front of the room and answers with the long link.
//
// IT IS THE SAME DOOR, NOT A SECOND ONE. The code finds the same grant. The
// grant still says which block, which engagement, which session and until when,
// and every one of those is checked here exactly as the link route checks them.
// A code cannot open anything a link could not.
//
// GUESSING IS THE ONLY ATTACK, AND IT IS THE ONE THING GUARDED HERE. There is
// no login in front of this, by design, because the room has no accounts. So:
//
//   the code is short but the space is not     about 280 billion codes
//   wrong shapes never reach the database      checked against the alphabet first
//   a caller gets 20 tries an hour             keyed on their address
//   everybody together gets 400 an hour        so a spread out attempt is caught too
//   every failure answers the same             wrong, expired, withdrawn, never existed
//
// At twenty tries an hour, working through enough codes to expect one hit takes
// longer than the universe has been here, and the session it was aimed at
// closed the same afternoon.
//
// The last of those matters as much as the rest. Telling somebody that a code
// "has expired" rather than "is not a code" tells them they found a real one,
// which is the single most useful thing a guesser can learn.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { resolveJoinCode } from '@/lib/session-link'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** One answer for every kind of failure, so none of them teaches anything. */
const NO = () => NextResponse.json(
  { error: 'That code does not open anything. Check it on the screen and try again.' },
  { status: 404 },
)

export async function GET(req: NextRequest) {
  try {
    const typed = req.nextUrl.searchParams.get('code')

    const admin = getAdminClient()

    // Rate limited before the code is even looked at, so a flood of nonsense
    // costs the same as a flood of near misses.
    const ip = clientIp(req)
    const mine = await checkRateLimit(admin, `session-join:${ip}`, 20, 3600)
    if (!mine.allowed) {
      return NextResponse.json(
        { error: 'Too many tries. Wait a few minutes, or use the link instead.' },
        { status: 429 },
      )
    }
    // A second limit with no address in the key, so an attempt spread across
    // many addresses still runs into a ceiling.
    const everybody = await checkRateLimit(admin, 'session-join:all', 400, 3600)
    if (!everybody.allowed) {
      return NextResponse.json(
        { error: 'Too many tries. Wait a few minutes, or use the link instead.' },
        { status: 429 },
      )
    }

    // resolveJoinCode checks the shape before it goes near the database, then
    // the grant type, the block, the withdrawal and the expiry, and answers
    // null for every one of those. It lives beside loadSessionLink because it
    // is the same job: decide what something a stranger typed opens.
    const token = await resolveJoinCode(typed)
    if (!token) return NO()

    // The token, and nothing else. Naming the engagement or the block here
    // would tell somebody who guessed a code what they had found, before they
    // have opened anything.
    return NextResponse.json({ token })
  } catch (e: any) {
    console.error('session-join: unexpected error', e)
    return NO()
  }
}
