-- ============================================================
-- One handover record per test per engagement.
--
-- Same reasoning as the gate table. What identifies a handover record is the
-- pair (client_id, test_number): there are five independence tests and an
-- engagement has one result for each. The id column encodes that pair as a
-- string, which works and always has, but leaves the real key implicit.
--
-- A unique constraint on the pair makes it explicit, so the upsert conflicts on
-- what actually identifies the row rather than on a string that happens to
-- represent it. Without it, a second row for the same test could be written by
-- anything that built the id differently, and the panel would show two
-- conflicting results for one test with no way to tell which was current.
--
-- Duplicates are collapsed first, keeping the row that carries a real result
-- over one nobody has tested, and the most recent among equals.
-- ============================================================

delete from handover_record a
  using handover_record b
  where a.client_id = b.client_id
    and a.test_number = b.test_number
    and a.id <> b.id
    and (
      case when coalesce(a.status, 'not_tested') = 'not_tested' then 0 else 1 end,
      a.updated_at,
      a.id
    ) < (
      case when coalesce(b.status, 'not_tested') = 'not_tested' then 0 else 1 end,
      b.updated_at,
      b.id
    );

create unique index if not exists handover_record_client_test
  on handover_record (client_id, test_number);
