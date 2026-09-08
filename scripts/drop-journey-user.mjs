// Remove the throwaway login the journey check uses. Run it when you are done:
// a real login against a real engagement is not something to leave lying about.
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '/tmp/e2e.env','utf8').trim().split('\n').map(l => {
  const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
}))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SR = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json' }
const EMAIL = 'e2e-journey-check@example.com'
const found = await (await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: H })).json()
let gone = 0
for (const u of (found.users || [])) {
  if ((u.email || '').toLowerCase() === EMAIL) {
    await fetch(`${URL}/rest/v1/user_profiles?id=eq.${u.id}`, { method: 'DELETE', headers: H })
    await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: H })
    gone++
  }
}
console.log(gone ? `removed ${gone} journey login(s)` : 'nothing to remove')
