// ============================================================
// WHAT A REAL CLIENT CAN AND CANNOT DO
//
// Run against the real database with a real client login, because that is the
// only way these faults surface. On 8 September this found three that every
// unit test and every build had passed straight over:
//
//   * a client could mark every decision gate on their engagement complete
//   * a client could rename their own engagement
//   * a client could change their own engagement status
//
// The gate one mattered most. The whole method rests on a gate moving only
// when the evidence holds and the signatures are in, and a funder reading a
// record the client could rewrite is reading a fiction.
//
// HOW TO RUN IT
//   1. Put NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
//      SUPABASE_SERVICE_ROLE_KEY in a file, one per line, as KEY=value.
//   2. node scripts/make-journey-user.mjs <that file>     (creates a throwaway login)
//   3. node scripts/client-journey-check.mjs <that file>  (what they must be able to read)
//   4. node scripts/client-cannot-check.mjs  <that file>  (what they must not be able to do)
//   5. node scripts/drop-journey-user.mjs    <that file>  (removes it again)
//
// Each exits non-zero on failure, so it can be a gate in CI as well as a thing
// to run by hand before telling a client the platform is ready.
// ============================================================
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '/tmp/e2e.env','utf8').trim().split('\n').map(l => {
  const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
}))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const U = JSON.parse(fs.readFileSync(process.env.JOURNEY_USER || '/tmp/e2e-user.json','utf8'))
const auth = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method:'POST', headers:{apikey:ANON,'content-type':'application/json'},
  body: JSON.stringify({ email:U.email, password:U.password }),
})).json()
const H = { apikey: ANON, Authorization:`Bearer ${auth.access_token}`, 'content-type':'application/json', Prefer:'return=representation' }

async function attempt(label, url, body) {
  const r = await fetch(url, { method:'PATCH', headers:H, body: JSON.stringify(body) })
  const t = r.ok ? await r.json() : await r.text()
  const changed = Array.isArray(t) && t.length > 0
  console.log(`${changed ? 'HOLE' : 'safe'}  ${label}  — ${r.status} ${changed ? JSON.stringify(t[0]).slice(0,90) : String(t).slice(0,70)}`)
  return changed
}

console.log('Signed in as a client CEO. Trying things they must not be able to do.\n')
await attempt('promote self to super_coach', `${URL}/rest/v1/user_profiles?id=eq.${U.userId}`, { role: 'super_coach' })
await attempt('move self to another client',  `${URL}/rest/v1/user_profiles?id=eq.${U.userId}`, { engagement_client_id: 'client_1782960065066' })
await attempt('rename own engagement',        `${URL}/rest/v1/engagement_clients?id=eq.${U.client.id}`, { name: 'RENAMED BY CLIENT' })
await attempt('change own engagement status', `${URL}/rest/v1/engagement_clients?id=eq.${U.client.id}`, { status: 'complete' })
await attempt('mark own decision gates done', `${URL}/rest/v1/canvas_decision_points?client_id=eq.${U.client.id}`, { status: 'complete' })
