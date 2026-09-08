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
// The client's own credentials, against the real database, under the real
// row-level security. This is what the browser would do if it could reach it.
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '/tmp/e2e.env','utf8').trim().split('\n').map(l => {
  const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
}))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const U = JSON.parse(fs.readFileSync(process.env.JOURNEY_USER || '/tmp/e2e-user.json','utf8'))
const fail = []
const step = (n, ok, d='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!ok) fail.push(n) }

// 1. Sign in exactly as the app does.
const auth = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: U.email, password: U.password }),
})).json()
step('1 the client can sign in', !!auth.access_token, auth.error_description || auth.msg || '')
if (!auth.access_token) { console.log('\nSTOPPED'); process.exit(1) }
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` }

// 2. Their own profile, which is what every screen routes on.
const prof = await (await fetch(`${URL}/rest/v1/user_profiles?select=role,engagement_client_id&id=eq.${U.userId}`, { headers: H })).json()
step('2 they can read their own profile', Array.isArray(prof) && prof.length === 1, JSON.stringify(prof).slice(0,90))
const clientId = prof?.[0]?.engagement_client_id

// 3. Their engagement. If this is empty the journey page is a blank shell.
const cl = await (await fetch(`${URL}/rest/v1/engagement_clients?select=id,name,slug&id=eq.${clientId}`, { headers: H })).json()
step('3 they can read their own engagement', Array.isArray(cl) && cl.length === 1, cl?.[0]?.name || JSON.stringify(cl).slice(0,90))

// 4. Somebody else's engagement must be invisible.
const other = await (await fetch(`${URL}/rest/v1/engagement_clients?select=id,name&engagement_mode=eq.financial`, { headers: H })).json()
step('4 other clients stay invisible to them', Array.isArray(other) && other.length === 0, `${Array.isArray(other)?other.length:'?'} rows returned`)

// 5. The Charter they are asked to read and sign.
const ch = await (await fetch(`${URL}/rest/v1/engagement_charters?select=id,version,status&client_id=eq.${clientId}`, { headers: H })).json()
step('5 they can read the Charter', Array.isArray(ch) && ch.length > 0, ch?.[0] ? `v${ch[0].version} ${ch[0].status}` : 'none exists yet')

// 6. The decision points the whole method rests on.
const gates = await (await fetch(`${URL}/rest/v1/canvas_decision_points?select=dp_id,status&client_id=eq.${clientId}`, { headers: H })).json()
step('6 they can read the decision points', Array.isArray(gates) && gates.length > 0, `${Array.isArray(gates)?gates.length:0} gates`)

// 7. The parties, which is how signing is gated.
const parties = await (await fetch(`${URL}/rest/v1/engagement_parties?select=party_role,is_signatory&client_id=eq.${clientId}`, { headers: H })).json()
step('7 they can read who is on the engagement', Array.isArray(parties) && parties.length > 0, `${Array.isArray(parties)?parties.length:0} parties`)

// 8. They must not be able to move a gate.
const move = await fetch(`${URL}/rest/v1/canvas_decision_points?client_id=eq.${clientId}`, {
  method: 'PATCH', headers: { ...H, 'content-type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ status: 'complete' }),
})
const moved = move.ok ? await move.json() : null
step('8 they cannot mark their own gates complete', !move.ok || (Array.isArray(moved) && moved.length === 0),
  move.ok ? `write returned ${Array.isArray(moved)?moved.length:'?'} rows` : `refused ${move.status}`)

console.log(fail.length ? `\n${fail.length} FAILED` : '\nEVERY STEP PASSED')
process.exit(fail.length ? 1 : 0)
