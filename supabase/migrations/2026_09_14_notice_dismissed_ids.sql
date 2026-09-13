-- Dismissing a flag, as opposed to setting it aside. 14 September 2026.
--
-- Habib: "I need to be able to dismiss flags from My Business, not just set
-- them aside."
--
-- Set aside is about the whole notice: it goes quiet and comes back as soon
-- as the set behind it changes. That is what makes it safe, and it is also
-- why it is not enough on its own. A submission that has been dealt with
-- should not keep raising the notice every time another one arrives.
--
-- Dismissed is about the records themselves, named one by one. They do not
-- come back. A record that arrives afterwards is a different record and
-- raises the notice again, so dismissing what is on the screen today can
-- never hide tomorrow's work.
--
-- Nothing is hidden without a way back: the screen keeps a line saying how
-- many were dismissed, and they can be shown again.
alter table coach_notice_dismissals
  add column if not exists dismissed_ids text[] not null default '{}';

comment on column coach_notice_dismissals.dismissed_ids is
  'Records the super coach has dismissed outright on this notice. They are never shown again unless they are restored. Distinct from covers, which sets the whole notice aside only until the set behind it changes.';
