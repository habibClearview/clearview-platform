-- ============================================================
-- A signature given on paper is a third method, and the column has to say so.
--
-- charter_signatures.signature_method was constrained to 'click' and 'typed',
-- the two ways a signer with a login signs for themselves. The route that
-- records a signature given on paper in a session writes 'in_room', because
-- that is what happened and calling it a click would be a lie in the one record
-- that exists to be truthful.
--
-- So every attempt to record a paper signature was refused by the check
-- constraint and reported to the coach as "could not record the signature".
-- Found by doing it against the deployed site rather than by reading the code:
-- the route, the helper and the type all agreed that 'in_room' was valid, and
-- the only thing that disagreed was the database.
--
-- This is the whole fix. Widening the constraint does not make signatures
-- weaker, because the method has never been what makes one trustworthy. What
-- makes it trustworthy is that the identity is resolved server side from the
-- engagement's own party list and that recorded_by_user_id says who typed it.
-- A paper signature that is stored honestly as a paper signature is worth more
-- than one recorded as a click that never happened.
--
-- gtcv_gate_signoffs.signature_method carries the same three values and was
-- added without a constraint, so it needs no change and gets none. Adding one
-- here would be a new restriction dressed up as a repair.
-- ============================================================

alter table public.charter_signatures
  drop constraint if exists charter_signatures_signature_method_check;

alter table public.charter_signatures
  add constraint charter_signatures_signature_method_check
  check (signature_method in ('click', 'typed', 'in_room'));
