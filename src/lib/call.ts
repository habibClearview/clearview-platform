// ============================================================
// THE ROOM A SESSION IS HELD IN
//
// The name of a call's room is derived from the engagement and the session, so
// it can never be asked for. A room name supplied by the browser would be a
// door: type another client's name and you are in their conversation. Here
// there is nothing to type.
// ============================================================

/** The room a session is held in. Derived from ids, so it cannot be asked for. */
export function callRoomName(clientId: string, sessionId: string | null): string {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
  return sessionId ? `cv_${safe(clientId)}_${safe(sessionId)}` : `cv_${safe(clientId)}`
}

/** Whether the platform has been given what it needs to carry a call. */
export function callConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.NEXT_PUBLIC_LIVEKIT_URL)
}
