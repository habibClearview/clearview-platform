import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase-env'

// The address and the key are read through supabase-env, which trims them. A
// value pasted with a line break on the end used to throw here, at module
// load, which took every page of the site down with it. 13 September 2026.
export const supabase = createClient(supabaseUrl(), supabaseAnonKey())
