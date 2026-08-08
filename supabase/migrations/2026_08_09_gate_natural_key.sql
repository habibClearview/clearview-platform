-- ============================================================
-- A decision gate is identified by its engagement and its block.
--
-- canvas_decision_points.id is text, and /api/gate-status builds it by joining
-- the client id and the block id with a hyphen. That works, and has since the
-- canvas tables were created, but it makes the pair implicit: the thing that
-- actually identifies a gate is (client_id, dp_id), and the id is a rendering
-- of it. Anyone reading the upsert has to know that to see it is correct, and
-- two reviewers in a row have read it and reasonably concluded it was a bug.
--
-- A unique constraint on the pair makes the real key explicit, so the upsert
-- can conflict on the pair rather than on a string that happens to encode it.
-- The id column is untouched: it stays the primary key, existing rows keep
-- their values, and nothing that reads by id changes.
--
-- Duplicates would block the constraint, so any are collapsed first, keeping
-- the row that carries the most work: a completed gate outranks an in progress
-- one, which outranks one nobody has touched.
-- ============================================================

delete from canvas_decision_points a
  using canvas_decision_points b
  where a.client_id = b.client_id
    and a.dp_id = b.dp_id
    and a.id <> b.id
    and (
      case coalesce(a.status, 'not_started')
        when 'complete' then 3 when 'in_progress' then 2 else 1 end,
      a.updated_at,
      a.id
    ) < (
      case coalesce(b.status, 'not_started')
        when 'complete' then 3 when 'in_progress' then 2 else 1 end,
      b.updated_at,
      b.id
    );

create unique index if not exists canvas_decision_points_client_dp
  on canvas_decision_points (client_id, dp_id);
