// ============================================================
// WHO IS THIS BROWSER, AND WHICH ROOM IS IT IN?
//
// R6 says a participant has no account, no password and nothing to install. So
// there is no login to ask "who are you". Something still has to answer it,
// because R10 keeps several answers from one person separately, R11 lets a
// person change their own answer and nobody else's, and R18 puts a name beside
// the highest and lowest score on a named question.
//
// THE ANSWER IS A COOKIE THE SERVER ISSUES, NOT A VALUE THE BROWSER SENDS.
// That distinction is the whole of the security here. If the identifier
// travelled in the body of the request, any participant could type another
// person's identifier and change their answer, or submit under their name. It
// cannot, because the route never reads it from the body: it reads the cookie
// it set itself, and a browser cannot forge one it was not given.
//
// WHAT THE COOKIE HOLDS (amendment to R5). Three things: the engagement, the
// browser's own participant identifier, and, where a personal link was used, a
// person identifier. Stage 1 only fills the first two. Stage 2 introduces
// permanent personal links, and the third is here now so that adding them does
// not mean re-issuing every cookie in the field.
//
// The value is signed, so a browser can read it but cannot alter it without
// the signature failing. It is not encrypted: nothing in it is secret, and
// pretending otherwise would be theatre.
// ============================================================
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'

export const ROOM_COOKIE = 'gtcv_room'

export interface RoomIdentity {
  /** The engagement whose room this browser has joined. */
  clientId: string
  /** This browser, minted on first join. Not a person; a device. */
  participantId: string
  /** The person, where a personal link named one. Stage 2 fills this. */
  personId: string | null
  /** The name to show, where a personal link carried one. Stage 2 fills this. */
  personName: string | null
}

function secret(): string {
  // The same secret the rest of the server already holds. A room cookie is not
  // worth its own secret, and one more environment variable is one more thing
  // to be missing in production at the worst moment.
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('No server secret available to sign the room cookie')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** A new identity for a browser that has just joined a room. */
export function newIdentity(clientId: string, person?: { id: string; name: string } | null): RoomIdentity {
  return {
    clientId,
    participantId: randomUUID(),
    personId: person?.id ?? null,
    personName: person?.name ?? null,
  }
}

/** The cookie value for an identity: the facts, then a signature over them. */
export function encodeIdentity(identity: RoomIdentity): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/**
 * The identity a cookie carries, or null where it is missing, malformed, or
 * has been altered.
 *
 * A failed signature returns null rather than throwing, because the ordinary
 * cause is a cookie issued before a key rotation, and the right response to
 * that is to treat the browser as new rather than to show it an error.
 */
export function decodeIdentity(cookieValue: string | undefined | null): RoomIdentity | null {
  if (!cookieValue) return null
  const dot = cookieValue.lastIndexOf('.')
  if (dot <= 0) return null

  const payload = cookieValue.slice(0, dot)
  const given = cookieValue.slice(dot + 1)

  let expected: string
  try { expected = sign(payload) } catch { return null }

  // Compared in constant time, so the comparison itself does not leak how much
  // of a forged signature was correct.
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed.clientId !== 'string' || typeof parsed.participantId !== 'string') {
      return null
    }
    return {
      clientId: parsed.clientId,
      participantId: parsed.participantId,
      personId: typeof parsed.personId === 'string' ? parsed.personId : null,
      personName: typeof parsed.personName === 'string' ? parsed.personName : null,
    }
  } catch {
    return null
  }
}
