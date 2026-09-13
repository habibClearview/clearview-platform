-- The welcome letter to a co-implementer goes once. 13 September 2026.
--
-- /api/co-implementer-welcome refuses to send a second copy when this column
-- holds a time. The route reads the record with select('*') and treats the
-- column as optional, so it works before this migration is applied as well as
-- after; applying it is what makes "once only" actually hold.
ALTER TABLE co_implementers
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;

COMMENT ON COLUMN co_implementers.welcome_sent_at IS
  'When the co-implementer welcome letter was sent. Null means it has not gone yet.';
