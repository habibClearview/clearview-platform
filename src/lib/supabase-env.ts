// ============================================================
// THE ADDRESS AND THE KEYS, CLEANED ONCE
//
// 13 September 2026. Habib set the SUPABASE_URL repository variable by copying
// it out of a web page, and a carriage return and a newline came with it. Three
// things broke at once and none of them said why: the nightly backup failed
// with "Failed to parse URL", the row level security gate failed the same way,
// and every single page of the site failed to build, because creating a
// Supabase client with an unparseable address throws where the module loads.
//
// He had done it correctly. Whitespace at the end of a pasted value is an
// ordinary thing that happens to everybody, and the platform treated it as a
// catastrophe with no explanation.
//
// So the values are read through here, and nowhere else. No address and no key
// has meaningful whitespace at either end, and no address needs a trailing
// slash, so both are removed.
//
// These are FUNCTIONS, not constants, deliberately. Read at each call, they
// behave exactly as process.env did, which matters for tests that set a value
// after the module they are testing has been imported.
// ============================================================

/** The Supabase project address: trimmed, with any trailing slash removed. */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
}

/** The public key that ships in the browser bundle. Safe only because row level security stands behind it. */
export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
}

/** The service role key. Server only. Never send this to a browser. */
export function supabaseServiceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
}
