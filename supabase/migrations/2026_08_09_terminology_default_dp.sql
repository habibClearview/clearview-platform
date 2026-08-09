-- ============================================================
-- A new engagement is named the way the method names itself.
--
-- engagement_config.terminology defaulted to 'zone'. The method is the
-- Grant-to-Commercial Viability Canvas and its nine steps are decision points.
-- They are called that in the workbook, the handbook and every piece of
-- collateral a funder has already read. Starting a new engagement on a
-- different word means the screen and the proposal disagree from the first day,
-- and somebody has to notice and change it.
--
-- The setting stays, because an engagement that prefers Zone can still say
-- Zone. What changes is which one a new engagement begins with.
--
-- Additive: the default only affects rows created after this runs. Existing
-- engagements keep whatever they are set to.
-- ============================================================

alter table public.engagement_config
  alter column terminology set default 'dp';
