// Simulated provider adapter: a deterministic, in-memory mobile-money provider.
// This is what lets the reconciliation engine be built, tested, and dry-run
// against realistic data BEFORE any live provider credential exists -- the v3
// build order's step 1 ("don't block the engine on provider registration").
//
// It implements the exact same PaymentProviderAdapter interface as the real
// providers, so code wired against it needs no change when a live adapter is
// swapped in.

import type { LinkInstructions, LinkStatus, NormalizedProviderTxn, PaymentProviderAdapter } from './types'

// Shape a test or dry-run harness feeds in to represent one webhook payload.
export interface SimulatedPayload {
  clientId: string
  externalRef: string
  amount: number
  currency?: string
  occurredAt: number // ms epoch
  direction?: 'inbound' | 'outbound'
  // A non-transaction event (e.g. a status ping) that handleWebhook should skip.
  kind?: 'transaction' | 'ping'
}

export class SimulatedProviderAdapter implements PaymentProviderAdapter {
  readonly providerId = 'simulated'
  readonly country: string
  private readonly linked = new Set<string>()

  constructor(country = 'UG') {
    this.country = country
  }

  async initiateLink(clientId: string): Promise<LinkInstructions> {
    this.linked.add(clientId)
    return { status: 'active', instructions: `Simulated wallet linked for ${clientId}.` }
  }

  async checkLinkStatus(clientId: string): Promise<LinkStatus> {
    return this.linked.has(clientId) ? 'active' : 'not_linked'
  }

  handleWebhook(rawPayload: unknown): NormalizedProviderTxn | null {
    const p = rawPayload as SimulatedPayload
    if (!p || typeof p !== 'object') throw new Error('Malformed simulated payload')
    if (p.kind === 'ping') return null
    if (!p.clientId || !p.externalRef || typeof p.amount !== 'number' || typeof p.occurredAt !== 'number') {
      throw new Error('Simulated payload missing required transaction fields')
    }
    return {
      providerId: this.providerId,
      country: this.country,
      clientId: p.clientId,
      externalRef: p.externalRef,
      amount: p.amount,
      currency: p.currency ?? 'UGX',
      occurredAt: p.occurredAt,
      direction: p.direction ?? 'inbound',
      rawPayload,
    }
  }

  async revokeLink(clientId: string): Promise<void> {
    this.linked.delete(clientId)
  }
}
