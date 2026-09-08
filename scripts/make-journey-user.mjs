// Create a throwaway client login, exactly as a real recipient would have one:
// an auth user plus the user_profiles row that scopes them to the engagement.
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '/tmp/e2e.env','utf8').trim().split('\n').map(l => {
  const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
}))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SR  = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json' }

const EMAIL = 'e2e-journey-check@example.com'
const PASS  = 'Journey-Check-8Sept-2026'

// Remove any leftover from a previous run.
const found = await (await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: H })).json()
for (const u of (found.users || [])) {
  if ((u.email || '').toLowerCase() === EMAIL) {
    await fetch(`${URL}/rest/v1/user_profiles?id=eq.${u.id}`, { method: 'DELETE', headers: H })
    await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: H })
  }
}

const made = await (await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
})).json()
if (!made.id) { console.error('could not create the user:', JSON.stringify(made).slice(0,300)); process.exit(1) }

// Which engagement? Whatever canvas client exists right now.
const clients = await (await fetch(`${URL}/rest/v1/engagement_clients?select=id,name,slug,engagement_mode&engagement_mode=eq.canvas`, { headers: H })).json()
const client = clients[0]
if (!client) { console.error('NO CANVAS CLIENT EXISTS — create one first'); process.exit(2) }

const prof = await fetch(`${URL}/rest/v1/user_profiles`, {
  method: 'POST', headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify({
    id: made.id, role: 'ceo', full_name: 'Journey Check', email: EMAIL,
    engagement_client_id: client.id, assigned_unit_ids: [], status: 'active',
  }),
})
if (!prof.ok) { console.error('profile failed:', (await prof.text()).slice(0,300)); process.exit(3) }

fs.writeFileSync(process.env.JOURNEY_USER || '/tmp/e2e-user.json', JSON.stringify({ email: EMAIL, password: PASS, userId: made.id, client }, null, 1))
console.log('client under test :', client.name, '/', client.slug)
console.log('login created     :', EMAIL)
