// ============================================================
// CONAS DATA PERSISTENCE
// Saves and loads planning data to/from Supabase model_config
// Falls back to localStorage for offline/demo use
// ============================================================
import { supabase } from '@/lib/supabase'
import type { CONASInputs } from '@/lib/conas-engine'

const LOCAL_KEY = 'conas-inputs-v5'

export async function saveInputs(
  inputs: CONASInputs,
  clientId: string | null,
  userId: string
): Promise<void> {
  // Always save to localStorage as backup
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(inputs))
  } catch { /* ignore */ }

  // Save to Supabase if we have a client_id
  if (!clientId) return

  try {
    const { data: existing } = await supabase
      .from('model_config')
      .select('id, version')
      .eq('client_id', clientId)
      .single()

    if (existing) {
      await supabase
        .from('model_config')
        .update({
          config: inputs as unknown as Record<string, unknown>,
          version: existing.version + 1,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('model_config')
        .insert({
          client_id: clientId,
          config: inputs as unknown as Record<string, unknown>,
          version: 1,
          updated_by: userId,
        })
    }
  } catch (err) {
    console.error('Supabase save failed, using local storage:', err)
  }
}

export async function loadInputs(
  clientId: string | null,
  defaultFn: () => CONASInputs
): Promise<CONASInputs> {
  // Try Supabase first
  if (clientId) {
    try {
      const { data } = await supabase
        .from('model_config')
        .select('config')
        .eq('client_id', clientId)
        .single()

      if (data?.config) {
        return data.config as unknown as CONASInputs
      }
    } catch { /* fall through to localStorage */ }
  }

  // Try localStorage
  try {
    const stored = localStorage.getItem(LOCAL_KEY)
    if (stored) return JSON.parse(stored) as CONASInputs
  } catch { /* fall through to defaults */ }

  return defaultFn()
}

export function saveLocal(inputs: CONASInputs): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(inputs)) } catch { /* ignore */ }
}

export function loadLocal(defaultFn: () => CONASInputs): CONASInputs {
  try {
    const stored = localStorage.getItem(LOCAL_KEY)
    if (stored) return JSON.parse(stored) as CONASInputs
  } catch { /* ignore */ }
  return defaultFn()
}
