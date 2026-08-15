-- ============================================================
-- A QUESTION BELONGS TO A TOOL, NOT JUST TO A BLOCK.
-- 15 August 2026.
--
-- Phase 0 is five tools on one block. Until now every question on the block
-- was every tool's question, which was harmless only because Tool 1 was the
-- only tool with any: the bar on Tools 2 to 5 ran Tool 1's question, and the
-- pending answers under Tool 1's table were the block's, which was the same
-- list.
--
-- Tool 2 has its own five questions from today. Without this column, opening
-- "Who controls the budget for it?" would offer it on Tool 1's bar and drop
-- its answers under Tool 1's table — the exact fault that cost most of a week
-- when one flat list of four questions spanned three tools and "signal, or
-- story?" turned up in Tool 1.
--
-- Default 1: every question that already exists is Tool 1's, which is true of
-- all six of Phase 0's and of DP01's four, since DP01 is a single surface.
--
-- SAFE TO RUN TWICE.
-- ============================================================

alter table public.gtcv_questions
  add column if not exists tool smallint not null default 1;

comment on column public.gtcv_questions.tool is
  'Which tool of the block asks this. Phase 0 is five tools on one block, so the bar, the pending answers and the projection all follow this rather than the gate alone.';

create index if not exists gtcv_questions_gate_tool_idx
  on public.gtcv_questions (client_id, gate_id, tool);
