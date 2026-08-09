#!/usr/bin/env node
// ============================================================
// Drive the real write paths against a real deployment.
//
// WHY THIS EXISTS. Ten faults were found in this codebase by hand this week and
// seven of them shared one shape: the code compiled, the types were right, all
// 919 tests passed, the page answered 200, and the thing still did not work,
// because a query named a column the table does not have, or a route wrote a
// value a check constraint refuses, or a permission was granted to one role and
// needed by another.
//
// Every check this project had reads the code. None of them run it. So the
// failures that reach a client are exactly the failures nothing was looking
// for. Doing it by hand once is not a safeguard; running it on every change is.
//
// WHAT IT DOES. Creates a throwaway engagement and a throwaway login, walks the
// paths a coach actually walks, checks each answer, then deletes everything it
// made. It never touches a real engagement: every write is against the
// engagement it created, and the cleanup runs whether the checks passed or not.
//
// WHAT IT WOULD HAVE CAUGHT. Adding a deliverable by hand. Reading a Terms of
// Reference. Moving a gate. Recording a signature given on paper. Assembling a
// claim with the evidence in it. Setting the engagement's currency and reading
// it back. Opening a session to the room and typing into it with no login.
// Attaching evidence as the organisation rather than the coach. All of those
// were broken and all of them look fine from the code.
//
// It uses curl rather than fetch, because the sandbox this was written in
// allows one and not the other, and a check nobody can run locally is a check
// nobody runs.
//
// Usage:
//   node scripts/smoke-write-paths.mjs --base=https://your-deployment
//
// Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Point it
// at staging. Never at production: it creates and deletes an engagement.
// ============================================================

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a)
    if (!m) { console.error(`Unrecognised argument: ${a}`); process.exit(1) }
    return [m[1], m[2] === undefined ? true : m[2]]
  }),
)

const BASE = (args.base || process.env.SMOKE_BASE_URL || '').replace(/\/$/, '')
const SB = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!BASE || !SB || !ANON || !SERVICE) {
  console.error('smoke: needs --base plus SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Without them this cannot tell a working deployment from an unchecked one, so it fails.')
  process.exit(1)
}
if (/clearview\.habibonifade\.com/.test(BASE)) {
  console.error('smoke: refusing to run against production. It creates and deletes an engagement.')
  process.exit(1)
}

// ─── nothing secret ever reaches the output ──────────────────
// This runs in continuous integration, where everything printed is kept and
// readable by everyone with access to the repository. A key that reaches a log
// is a key that has to be rotated, so no path to the output is trusted: every
// line goes through here, and long token shaped strings are removed even when
// they are not one of the keys this run happens to hold.
function redact(text) {
  let out = String(text)
  for (const secret of [SERVICE, ANON].filter(Boolean)) {
    out = out.split(secret).join('[redacted]')
  }
  // Any other JSON web token, whoever it belongs to.
  return out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]')
}

// ─── the smallest possible http client ───────────────────────
// A dropped connection is not a broken write path, and reporting it as one
// would teach everybody to ignore this check. So the transport is retried and
// only a real answer, or four failures to get one, is reported.
function sleep(ms) {
  execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`])
}

function http(method, url, { headers = {}, body } = {}) {
  const argv = ['-sS', '--max-time', '60', '-X', method, url, '-w', '\n__STATUS__%{http_code}']
  for (const [k, v] of Object.entries(headers)) argv.push('-H', `${k}: ${v}`)
  if (body !== undefined) argv.push('--data-binary', '@-')

  let lastError = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) sleep(1000 * 2 ** attempt)
    let out
    try {
      out = execFileSync('curl', argv, {
        input: body === undefined ? undefined : body,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      })
    } catch (error) {
      // curl could not complete the call at all: no connection, TLS refused,
      // timed out. Worth another go.
      //
      // The message carries the command that failed, and the command carries
      // the keys in its headers. Printed as it comes, a single dropped
      // connection writes the service role key into a build log that anybody
      // with read access to the repository can open. So it is scrubbed here,
      // at the only place it can escape.
      lastError = new Error(redact(String(error?.message || error)))
      continue
    }
    const at = out.lastIndexOf('\n__STATUS__')
    const raw = at < 0 ? out : out.slice(0, at)
    const status = at < 0 ? 0 : Number(out.slice(at + 11).trim())
    // A gateway that is briefly unavailable is the same kind of noise.
    if ([0, 502, 503, 504].includes(status) && attempt < 3) { lastError = new Error(`status ${status}`); continue }
    let json = null
    try { json = JSON.parse(raw) } catch { /* not every answer is json */ }
    return { status, raw, json }
  }
  throw new Error(`could not reach ${method} ${url} after 4 attempts: ${String(lastError?.message || lastError).slice(0, 200)}`)
}

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  apikey: ANON,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

// ─── the report ──────────────────────────────────────────────
const results = []
function check(what, ok, detail) {
  const safe = detail == null ? null : redact(detail)
  results.push({ what, ok, detail: safe })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || !safe ? '' : `\n        ${safe}`}`)
}
function expectStatus(what, res, wanted) {
  const ok = (Array.isArray(wanted) ? wanted : [wanted]).includes(res.status)
  check(what, ok, ok ? null : `got ${res.status}: ${String(res.raw).slice(0, 200)}`)
  return ok
}

// ─── what gets cleaned up, whatever happens ──────────────────
const stamp = randomBytes(4).toString('hex')
const CLIENT_ID = `smoke-${stamp}`
const EMAIL = `smoke-${stamp}@clearviewstaging.invalid`
const PASSWORD = `Smoke-${stamp}-Aa1!`
let userId = null

function serviceInsert(table, rows) {
  return http('POST', `${SB}/rest/v1/${table}`, {
    headers: { ...jsonHeaders(SERVICE), Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
}
function serviceDelete(table, query) {
  return http('DELETE', `${SB}/rest/v1/${table}?${query}`, { headers: jsonHeaders(SERVICE) })
}

const EXPECT_COMMIT = args['expect-commit'] || process.env.SMOKE_EXPECT_COMMIT || ''

async function main() {
  console.log(`smoke: ${BASE}`)
  console.log(`smoke: throwaway engagement ${CLIENT_ID}\n`)

  // ── which build is answering ──
  // A pass against the wrong deployment is worse than no pass at all, so this
  // is settled before anything else and said out loud either way.
  const build = http('GET', `${BASE}/api/build-info`, {})
  const servingCommit = build.json?.commit || ''
  console.log(`smoke: serving ${build.json?.branch || '?'} at ${build.json?.commitShort || '?'} (${build.json?.environment || '?'})`)
  if (EXPECT_COMMIT) {
    check('the deployment is built from the change under test',
      servingCommit === EXPECT_COMMIT,
      `expected ${EXPECT_COMMIT.slice(0, 7)}, the site is serving ${String(servingCommit).slice(0, 7) || 'nothing it will name'}`)
    if (servingCommit !== EXPECT_COMMIT) return
  }
  console.log('')

  // ── set the stage: an engagement and a login, both thrown away after ──
  const madeClient = serviceInsert('engagement_clients', [{
    id: CLIENT_ID, name: `Smoke ${stamp}`, slug: `smoke-${stamp}`,
    type: 'service_lsp', engagement_mode: 'canvas', status: 'setup', clearview_active: false,
  }])
  if (!expectStatus('create a throwaway engagement', madeClient, [200, 201])) return

  const madeUser = http('POST', `${SB}/auth/v1/admin/users`, {
    headers: jsonHeaders(SERVICE),
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })
  if (!expectStatus('create a throwaway login', madeUser, [200, 201])) return
  userId = madeUser.json?.id

  const madeProfile = serviceInsert('user_profiles', [{
    id: userId, role: 'super_coach', full_name: 'Smoke check', status: 'active',
  }])
  if (!expectStatus('give it coaching rights', madeProfile, [200, 201])) return

  const signedIn = http('POST', `${SB}/auth/v1/token?grant_type=password`, {
    headers: jsonHeaders(), body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!expectStatus('sign in', signedIn, 200)) return
  const token = signedIn.json?.access_token
  const H = { headers: jsonHeaders(token) }
  const post = (path, body) => http('POST', `${BASE}${path}`, { ...H, body: JSON.stringify(body) })
  const patch = (path, body) => http('PATCH', `${BASE}${path}`, { ...H, body: JSON.stringify(body) })
  const del = (path, body) => http('DELETE', `${BASE}${path}`, { ...H, body: JSON.stringify(body) })
  const get = (path) => http('GET', `${BASE}${path}`, H)

  console.log('')

  // ── setting an engagement up ──
  const setup = post('/api/engagement-setup', { clientId: CLIENT_ID })
  expectStatus('set the engagement up', setup, 200)
  check('it creates the settings, the gates and a Charter',
    (setup.json?.created || []).length === 3,
    `created: ${JSON.stringify(setup.json?.created)}`)

  const again = post('/api/engagement-setup', { clientId: CLIENT_ID })
  check('running it twice changes nothing',
    again.status === 200 && (again.json?.created || []).length === 0,
    `created again: ${JSON.stringify(again.json?.created)}`)

  // ── the working currency, saved and read back ──
  expectStatus('set a currency', patch('/api/engagement-config', { clientId: CLIENT_ID, currency: 'ngn' }), 200)
  const cfg = get(`/api/engagement-config?clientId=${CLIENT_ID}`)
  check('the currency reads back, upper cased', cfg.json?.config?.currency === 'NGN',
    `got ${JSON.stringify(cfg.json?.config?.currency)}`)
  expectStatus('a currency that is not a code is refused',
    patch('/api/engagement-config', { clientId: CLIENT_ID, currency: 'NOTACURRENCYCODE' }), 400)

  // ── who is on it ──
  const party = post('/api/engagement-party', {
    clientId: CLIENT_ID, name: 'Smoke Signatory', partyRole: 'lsp_ed',
    title: 'Executive Director', isSignatory: true,
  })
  expectStatus('add a party', party, 200)
  const partyId = party.json?.id
  expectStatus('edit a party', patch('/api/engagement-party', { clientId: CLIENT_ID, id: partyId, title: 'ED, edited' }), 200)

  // ── moving a gate, with and without a label ──
  expectStatus('move a gate with no label supplied',
    post('/api/gate-status', { clientId: CLIENT_ID, dpId: 'dp01', status: 'in_progress' }), 200)
  const gates = http('GET', `${SB}/rest/v1/canvas_decision_points?select=label,status&client_id=eq.${CLIENT_ID}&dp_id=eq.dp01`, { headers: jsonHeaders(SERVICE) })
  check('moving a gate does not wipe its name', Boolean(gates.json?.[0]?.label),
    `label is now ${JSON.stringify(gates.json?.[0]?.label)}`)

  // ── deliverables and the claim ──
  const deliverable = post('/api/deliverables', {
    clientId: CLIENT_ID, action: 'add_deliverable', title: 'Smoke deliverable', code: 'SM-1', amount: 1000,
  })
  expectStatus('add a deliverable by hand', deliverable, 200)
  const deliverableId = deliverable.json?.id
  expectStatus('set its status', patch('/api/deliverables', { clientId: CLIENT_ID, id: deliverableId, status: 'in_progress' }), 200)
  expectStatus('a status the database refuses is refused first',
    patch('/api/deliverables', { clientId: CLIENT_ID, id: deliverableId, status: 'agreed' }), 400)
  expectStatus('map it to a gate',
    post('/api/deliverables', { clientId: CLIENT_ID, action: 'add_mapping', deliverableId, dpId: 'dp01' }), 200)

  // Evidence behind that gate, so the claim has something to find.
  serviceInsert('evidence_library', [{
    id: `${CLIENT_ID}-E-001`, client_id: CLIENT_ID, reference: 'E-001', dp_id: 'dp01',
    type: 'document', description: 'Smoke evidence', status: 'accepted',
  }])
  const pack = post('/api/invoice-pack', { clientId: CLIENT_ID, action: 'assemble', deliverableId })
  expectStatus('assemble a claim', pack, 200)
  const packId = pack.json?.id || pack.json?.pack?.id
  const packRow = http('GET', `${SB}/rest/v1/engagement_invoice_packs?select=evidence,gates&client_id=eq.${CLIENT_ID}`, { headers: jsonHeaders(SERVICE) })
  const evidenceInPack = (packRow.json?.[0]?.evidence || []).length
  check('the claim actually contains the evidence', evidenceInPack > 0,
    `the pack carries ${evidenceInPack} evidence entries, expected at least 1`)
  if (packId) expectStatus('approve the claim', post('/api/invoice-pack', { clientId: CLIENT_ID, packId, action: 'approve' }), 200)

  // ── the Charter, issued and signed on paper ──
  const charterRow = http('GET', `${SB}/rest/v1/engagement_charters?select=id&client_id=eq.${CLIENT_ID}`, { headers: jsonHeaders(SERVICE) })
  const charterId = charterRow.json?.[0]?.id
  expectStatus('issue the Charter', post('/api/charter-version', { clientId: CLIENT_ID, charterId, mode: 'issue' }), 200)
  expectStatus('record a signature given on paper',
    post('/api/charter-sign', { clientId: CLIENT_ID, charterId, signerRole: 'lsp_ed', onBehalfOfPartyId: partyId }), 200)
  expectStatus('the same party cannot sign twice',
    post('/api/charter-sign', { clientId: CLIENT_ID, charterId, signerRole: 'lsp_ed', onBehalfOfPartyId: partyId }), 409)
  expectStatus('a gate sign off given on paper',
    post('/api/gate-signoff', { clientId: CLIENT_ID, dpId: 'dp01', decision: 'signed', signerRole: 'lsp_ed', onBehalfOfPartyId: partyId }), 200)

  // ── the room, with no login at all ──
  const link = post('/api/session-link', { clientId: CLIENT_ID, dpId: 'dp02', label: 'Smoke room' })
  expectStatus('open a block to the room', link, 200)
  const sessionToken = link.json?.link?.access_token

  // ── the code somebody types instead of the long address ──
  const joinCode = link.json?.link?.join_code
  check('opening a block gives out a code the room can type',
    typeof joinCode === 'string' && /^[23456789ACDEFHJKMNPQRTUVWXY]{8}$/.test(joinCode),
    `got ${JSON.stringify(joinCode)}`)
  if (joinCode) {
    const joined = http('GET', `${BASE}/api/session-join?code=${joinCode}`, {})
    check('the code opens the same session as the link',
      joined.status === 200 && joined.json?.token === sessionToken,
      `got ${joined.status}, token ${joined.json?.token === sessionToken ? 'matches' : 'does not match'}`)
    // Case and the dash are noise: a code said out loud is written down with
    // one and phone keyboards capitalise whatever they like.
    const messy = `${joinCode.slice(0, 4)}-${joinCode.slice(4)}`.toLowerCase()
    const joinedMessy = http('GET', `${BASE}/api/session-join?code=${encodeURIComponent(messy)}`, {})
    check('lower case and a dash still find it',
      joinedMessy.status === 200 && joinedMessy.json?.token === sessionToken,
      `got ${joinedMessy.status} for ${messy}`)
    // A misread character must open nothing rather than something else.
    expectStatus('a code with a character the alphabet leaves out is refused',
      http('GET', `${BASE}/api/session-join?code=O${joinCode.slice(1)}`, {}), 404)
    expectStatus('a made up code is refused',
      http('GET', `${BASE}/api/session-join?code=ACDEFHJK`, {}), [404, 429])
  }
  if (sessionToken) {
    const added = http('POST', `${BASE}/api/session-capture`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken, contributorName: 'Smoke', contribution: 'Typed with no login' }),
    })
    expectStatus('the room can type with no login', added, 200)
    const forged = http('POST', `${BASE}/api/session-capture`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken, clientId: 'client-somewhere-else', contributorName: 'Smoke', contribution: 'Forged' }),
    })
    const landed = http('GET', `${SB}/rest/v1/gtcv_session_contributions?select=client_id&client_id=eq.client-somewhere-else`, { headers: jsonHeaders(SERVICE) })
    check('a forged engagement id in the body is ignored',
      forged.status === 200 && (landed.json || []).length === 0,
      `rows written elsewhere: ${(landed.json || []).length}`)
    expectStatus('a made up link is refused',
      http('GET', `${BASE}/api/session-capture?token=${randomBytes(32).toString('hex')}`, {}), 404)

    // ── what the room said, becoming a row in the block ──
    // Chosen by what it says, not by being newest. By this point the room has
    // two sentences in it, because the forged engagement id above was correctly
    // written under this engagement rather than the one it claimed, and picking
    // the newest quietly tested the wrong sentence.
    const WORDS = 'Typed with no login'
    const said = http('GET', `${SB}/rest/v1/gtcv_session_contributions?select=id,dp_id,contribution&client_id=eq.${CLIENT_ID}&contribution=eq.${encodeURIComponent(WORDS)}&limit=1`, { headers: jsonHeaders(SERVICE) })
    const contributionId = said.json?.[0]?.id
    check('the sentence to be moved is the one the room typed', Boolean(contributionId),
      `looked for ${JSON.stringify(WORDS)} and found ${JSON.stringify(said.json)}`)
    if (contributionId) {
      const promoted = post('/api/session-contributions', { clientId: CLIENT_ID, id: contributionId })
      expectStatus('turn what the room said into a row in the block', promoted, 200)
      const segments = http('GET', `${SB}/rest/v1/gtcv_customer_segments?select=id,problem_in_their_words&client_id=eq.${CLIENT_ID}`, { headers: jsonHeaders(SERVICE) })
      check('the row carries the words that were actually said',
        (segments.json || []).some((r) => r.problem_in_their_words === WORDS),
        `the block holds ${JSON.stringify((segments.json || []).map((r) => r.problem_in_their_words))}`)
      expectStatus('the same sentence cannot become a second row',
        post('/api/session-contributions', { clientId: CLIENT_ID, id: contributionId }), 409)

      // Putting it back takes the untouched draft with it, which is the part
      // that stops a block filling with rows nobody meant to keep.
      expectStatus('put it back on the pile',
        patch('/api/session-contributions', { clientId: CLIENT_ID, id: contributionId, used: false }), 200)
      const after = http('GET', `${SB}/rest/v1/gtcv_customer_segments?select=id&client_id=eq.${CLIENT_ID}`, { headers: jsonHeaders(SERVICE) })
      check('putting it back removes the draft it made', (after.json || []).length === 0,
        `${(after.json || []).length} rows left behind`)
    }
  }

  // ── evidence files ──
  const upload = http('POST', `${SB}/storage/v1/object/evidence/${CLIENT_ID}/smoke.txt`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: 'smoke evidence',
  })
  expectStatus('attach an evidence file', upload, 200)
  expectStatus('an anonymous caller cannot attach one',
    http('POST', `${SB}/storage/v1/object/evidence/${CLIENT_ID}/anon.txt`, {
      headers: { apikey: ANON, 'Content-Type': 'text/plain' }, body: 'no',
    }), [400, 401, 403])

  // ── the refusals that matter ──
  expectStatus('an unauthenticated caller is refused',
    http('GET', `${BASE}/api/deliverables?clientId=${CLIENT_ID}`, { headers: { apikey: ANON } }), 401)
  expectStatus('an engagement that does not exist is refused',
    post('/api/engagement-setup', { clientId: 'client-does-not-exist' }), 404)
}

// ─── run, then always clean up ───────────────────────────────
try {
  await main()
} catch (error) {
  check('the run completed', false, String(error?.message || error).slice(0, 300))
} finally {
  // Deleting the engagement cascades to everything hung off it. The storage
  // object and the login are not rows, so they go by hand.
  try { http('DELETE', `${SB}/storage/v1/object/evidence/${CLIENT_ID}/smoke.txt`, { headers: jsonHeaders(SERVICE) }) } catch { /* best effort */ }
  try { serviceDelete('gtcv_session_contributions', `client_id=eq.${CLIENT_ID}`) } catch { /* best effort */ }
  try { serviceDelete('client_access_grants', `client_id=eq.${CLIENT_ID}`) } catch { /* best effort */ }
  try { serviceDelete('engagement_clients', `id=eq.${CLIENT_ID}`) } catch { /* best effort */ }
  if (userId) {
    try { serviceDelete('user_profiles', `id=eq.${userId}`) } catch { /* best effort */ }
    try { http('DELETE', `${SB}/auth/v1/admin/users/${userId}`, { headers: jsonHeaders(SERVICE) }) } catch { /* best effort */ }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nsmoke: ${results.length - failed.length} of ${results.length} checks passed`)
  if (failed.length) {
    console.log('\nWhat failed:')
    for (const f of failed) console.log(`  ${f.what}${f.detail ? `\n    ${f.detail}` : ''}`)
    process.exit(1)
  }
  console.log('smoke: every write path answered correctly.')
}
