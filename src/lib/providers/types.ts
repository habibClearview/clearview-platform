// Payment provider adapters: one normalized interface so the reconciliation
// engine never learns which provider a payment came from -- it only ever sees
// a NormalizedProviderTxn. See docs/RECONCILIATION_SPEC.md §9.
//
// Deliberate design point (spec §9): handle_webhook returns the CLIENT/MSME id
// (the wallet owner), NOT a business_unit_id. One wallet often serves a whole
// business, so the payment side genuinely cannot know which unit a sale
// belongs to -- that attribution comes from the field-app side of the match.

export type LinkStatus = 'not_linked' | 'pending' | 'active'

/** Provider-agnostic record of money that moved, ready for provider_transactions. */
export interface NormalizedProviderTxn {
  providerId: string
  country: string
  clientId: string // the MSME / engagement_clients.id that owns the wallet
  externalRef: string // the provider's own transaction id (idempotency key)
  amount: number
  currency: string
  occurredAt: number // ms epoch of when the payment happened
  direction: 'inbound' | 'outbound'
  rawPayload: unknown // the untouched provider payload, for audit
}

export interface LinkInstructions {
  status: LinkStatus
  // Human-facing next step (e.g. a USSD code or portal URL) shown during onboarding.
  instructions: string
  metadata?: Record<string, unknown>
}

export interface PaymentProviderAdapter {
  providerId: string
  country: string

  /** Begin linking this MSME's existing wallet. Never asks them to open a new account. */
  initiateLink(clientId: string): Promise<LinkInstructions>

  /** Where the link currently stands, for the readiness-state messaging. */
  checkLinkStatus(clientId: string): Promise<LinkStatus>

  /**
   * Normalize one raw provider webhook payload into a NormalizedProviderTxn.
   * Returns null when the payload is not a transaction event we care about
   * (heartbeats, status pings, etc.). Throws only on a genuinely malformed
   * payload the caller should log and reject.
   */
  handleWebhook(rawPayload: unknown): NormalizedProviderTxn | null

  /** Disconnect the wallet. Idempotent. */
  revokeLink(clientId: string): Promise<void>
}
