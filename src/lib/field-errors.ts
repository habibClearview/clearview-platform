// Translates raw Postgres error text into something an operator with no
// technical background can actually understand and act on. Raw messages
// like a check-constraint violation are meaningless to someone in the
// field -- this is the difference between "something went wrong, figure
// it out yourself" and telling them what to actually fix.
//
// Kept in its own module (rather than inline in app/api/field/sync/route.ts)
// because Next.js route handler files only permit specific named exports
// (GET, POST, etc.) -- an arbitrary helper can't be exported from a route
// file and imported elsewhere. This lets both the route and its tests use
// the exact same function, not a copy that can silently drift out of sync.
export function friendlyDbError(rawMessage: string): string {
  if (rawMessage.includes('field_transactions_payment_method_check')) {
    return 'One of your entries has a payment method the system doesn\'t recognise yet. Please check the payment method on your recent entries and try again.'
  }
  if (rawMessage.includes('violates check constraint')) {
    return 'One of your entries has a value that isn\'t allowed. Please check the details on your recent entries and try again.'
  }
  if (rawMessage.includes('violates foreign key constraint')) {
    return 'One of your entries refers to something that no longer exists (e.g. a product or customer that was removed). Please check the entry and try again.'
  }
  if (rawMessage.includes('violates not-null constraint')) {
    return 'One of your entries is missing required information. Please check the entry and try again.'
  }
  // Fall back to a generic, still-non-technical message rather than ever
  // showing raw database text on screen.
  return 'Something went wrong saving one or more entries. Your data is still safe on this phone -- please try syncing again, and let your coach know if this keeps happening.'
}
