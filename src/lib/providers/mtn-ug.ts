// MTN Uganda MoMo adapter (priority 1). Implements the shared interface so the
// reconciliation engine is unchanged when this goes live. The webhook
// normalizer is real and testable now; the linking calls are stubbed to
// 'pending' until API credentials exist (MTN MoMo Open API, momo.mtn.com), at
// which point only the bodies of initiateLink/checkLinkStatus/revokeLink need
// filling in -- nothing downstream changes.
//
// The normalizer maps MTN's collection-notification shape into our normalized
// record. Field names below follow MTN MoMo's documented payload; adjust only
// if MTN's live payload differs, without touching the return shape.

import type { LinkInstructions, LinkStatus, NormalizedProviderTxn, PaymentProviderAdapter } from './types'

interface MtnCollectionPayload {
  externalId?: string
  financialTransactionId?: string
  amount?: string | number
  currency?: string
  status?: string
  payer?: { partyIdType?: string; partyId?: string }
  // Some MTN callbacks carry a timestamp; when absent the caller should stamp
  // receipt time. We do not invent one here.
  createdAt?: string
}

export class MtnUgandaAdapter implements PaymentProviderAdapter {
  readonly providerId = 'mtn_ug_momo'
  readonly country = 'UG'

  // clientId -> wallet reference the MSME confirmed during onboarding. Injected
  // so this adapter stays pure/testable; a live wiring supplies a real store.
  constructor(private readonly walletRefFor: (clientId: string) => string | null = () => null) {}

  async initiateLink(clientId: string): Promise<LinkInstructions> {
    // TODO(mtn-credentials): register the collection widget / pre-approval.
    return {
      status: 'pending',
      instructions:
        'Confirm your MTN MoMo business number. Automatic verification switches on once MTN approves the connection.',
      metadata: { walletRef: this.walletRefFor(clientId) },
    }
  }

  async checkLinkStatus(clientId: string): Promise<LinkStatus> {
    // TODO(mtn-credentials): query MTN for approval state.
    return this.walletRefFor(clientId) ? 'pending' : 'not_linked'
  }

  handleWebhook(rawPayload: unknown): NormalizedProviderTxn | null {
    const p = rawPayload as MtnCollectionPayload
    if (!p || typeof p !== 'object') throw new Error('Malformed MTN payload')
    // Only successful collections are money that actually moved.
    if (p.status && p.status.toUpperCase() !== 'SUCCESSFUL') return null

    const externalRef = p.financialTransactionId || p.externalId
    const amount = typeof p.amount === 'string' ? Number(p.amount) : p.amount
    if (!externalRef || amount == null || Number.isNaN(amount)) {
      throw new Error('MTN payload missing transaction id or amount')
    }
    const occurredAt = p.createdAt ? Date.parse(p.createdAt) : NaN
    if (Number.isNaN(occurredAt)) {
      // Without a real payment time we cannot match on a window. Signal to the
      // caller to stamp receipt time explicitly rather than silently guessing.
      throw new Error('MTN payload missing a usable timestamp')
    }
    // MTN's payer partyId is a phone number -- we deliberately do NOT resolve it
    // to a client here (spec §9: the client comes from which linked wallet
    // received the funds, established at link time, not from the payer).
    return {
      providerId: this.providerId,
      country: this.country,
      clientId: '', // filled by the webhook route from the linked-wallet lookup
      externalRef: String(externalRef),
      amount: Number(amount),
      currency: p.currency || 'UGX',
      occurredAt,
      direction: 'inbound',
      rawPayload,
    }
  }

  async revokeLink(_clientId: string): Promise<void> {
    // TODO(mtn-credentials): revoke the pre-approval with MTN.
  }
}
