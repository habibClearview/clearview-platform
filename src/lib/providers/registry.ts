// Provider registry: id -> adapter. The reconciliation/webhook layer looks up a
// provider by id and calls the shared interface, never referencing a concrete
// provider directly. New channels (Airtel UG, M-PESA, Nigeria) register here
// once built, in the priority order documented in docs/RECONCILIATION_SPEC.md.

import type { PaymentProviderAdapter } from './types'
import { SimulatedProviderAdapter } from './simulated'
import { MtnUgandaAdapter } from './mtn-ug'

const registry = new Map<string, PaymentProviderAdapter>()

export function registerProvider(adapter: PaymentProviderAdapter): void {
  registry.set(adapter.providerId, adapter)
}

export function getProvider(providerId: string): PaymentProviderAdapter | null {
  return registry.get(providerId) ?? null
}

export function listProviders(): PaymentProviderAdapter[] {
  return Array.from(registry.values())
}

// Default registrations. The simulated provider is always available (used for
// tests and pre-Uganda dry runs). MTN Uganda is registered with a no-op wallet
// lookup until the live wiring supplies a real one.
registerProvider(new SimulatedProviderAdapter('UG'))
registerProvider(new MtnUgandaAdapter())
