import { describe, it, expect } from 'vitest'
import { SimulatedProviderAdapter, type SimulatedPayload } from '../lib/providers/simulated'
import { MtnUgandaAdapter } from '../lib/providers/mtn-ug'
import { getProvider, listProviders } from '../lib/providers/registry'
import { reconcile, MOBILE_MONEY, type FieldEntry } from '../lib/reconciliation-engine'

const T0 = 1_700_000_000_000

describe('SimulatedProviderAdapter', () => {
  const adapter = new SimulatedProviderAdapter('UG')

  it('normalizes a transaction payload', () => {
    const payload: SimulatedPayload = { clientId: 'c1', externalRef: 'x1', amount: 50_000, occurredAt: T0 }
    const n = adapter.handleWebhook(payload)
    expect(n).toMatchObject({ providerId: 'simulated', clientId: 'c1', externalRef: 'x1', amount: 50_000, direction: 'inbound', currency: 'UGX' })
  })

  it('skips a non-transaction ping', () => {
    expect(adapter.handleWebhook({ kind: 'ping', clientId: 'c1', externalRef: 'x', amount: 0, occurredAt: T0 })).toBeNull()
  })

  it('throws on a malformed payload', () => {
    expect(() => adapter.handleWebhook({ clientId: 'c1' })).toThrow()
  })

  it('tracks link status', async () => {
    expect(await adapter.checkLinkStatus('c9')).toBe('not_linked')
    await adapter.initiateLink('c9')
    expect(await adapter.checkLinkStatus('c9')).toBe('active')
    await adapter.revokeLink('c9')
    expect(await adapter.checkLinkStatus('c9')).toBe('not_linked')
  })
})

describe('MtnUgandaAdapter', () => {
  const adapter = new MtnUgandaAdapter()

  it('normalizes a successful collection', () => {
    const n = adapter.handleWebhook({
      financialTransactionId: 'ftx1', amount: '50000', currency: 'UGX', status: 'SUCCESSFUL',
      createdAt: '2026-07-12T10:00:00Z',
    })
    expect(n).toMatchObject({ providerId: 'mtn_ug_momo', externalRef: 'ftx1', amount: 50_000, direction: 'inbound' })
    expect(n!.occurredAt).toBe(Date.parse('2026-07-12T10:00:00Z'))
    // clientId is intentionally blank -- filled from the linked-wallet lookup, not the payer
    expect(n!.clientId).toBe('')
  })

  it('skips a non-successful collection', () => {
    expect(adapter.handleWebhook({ financialTransactionId: 'f', amount: '1', status: 'PENDING' })).toBeNull()
  })

  it('throws when the timestamp is unusable (cannot window-match without it)', () => {
    expect(() => adapter.handleWebhook({ financialTransactionId: 'f', amount: '1', status: 'SUCCESSFUL' })).toThrow()
  })

  it('is registered under its provider id', () => {
    expect(getProvider('mtn_ug_momo')).toBeInstanceOf(MtnUgandaAdapter)
    expect(listProviders().length).toBeGreaterThanOrEqual(2)
  })
})

describe('end-to-end: simulated provider payloads reconcile against field entries', () => {
  it('verifies a sale with no live API involved', () => {
    const adapter = new SimulatedProviderAdapter('UG')
    const payloads: SimulatedPayload[] = [
      { clientId: 'c1', externalRef: 'x1', amount: 50_000, occurredAt: T0 + 60_000 },
      { clientId: 'c1', externalRef: 'x2', amount: 12_000, occurredAt: T0 + 120_000 }, // no field entry -> unattributed
    ]
    const providerTxns = payloads
      .map(p => adapter.handleWebhook(p)!)
      .map(n => ({ id: n.externalRef, clientId: n.clientId, amount: n.amount, occurredAt: n.occurredAt }))

    const fieldEntries: FieldEntry[] = [
      { id: 'f1', clientId: 'c1', businessUnitId: 'shop_1', amount: 50_000, paymentMethod: MOBILE_MONEY, capturedAt: T0 },
    ]

    const r = reconcile(fieldEntries, providerTxns)
    expect(r.matches.map(m => m.fieldEntryId)).toEqual(['f1'])
    expect(r.matches[0].providerTxnId).toBe('x1')
    expect(r.unattributedInbound).toEqual(['x2'])
  })
})
