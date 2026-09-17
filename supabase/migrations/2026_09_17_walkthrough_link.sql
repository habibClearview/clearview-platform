-- ============================================================
-- THE WALKTHROUGH LINK.
--
-- Six columns on the engagement, so that /how-i-work/<link> can be generated
-- for any engagement from what the engagement already records. Nothing is
-- renamed and nothing is dropped.
--
-- WHAT IS REUSED RATHER THAN ADDED, so these six are the only new ones:
--   the funder's name          programmes.funder
--   the programme's name       programmes.name
--   the service                engagement_clients.commercialised_service
--   the contract dates         engagement_clients.start_date, expected_close
--   the milestones             engagement_deliverables.milestone_no / _label
--   the three questions        engagement_diagnostic
--
-- WHY walkthrough_slug IS NOT THE EXISTING slug. engagement_clients.slug is
-- already the engagement's own address inside the platform, where the reader is
-- signed in and the name is not a secret. This one is the public link handed to
-- a funder, so it is chosen separately and can be changed or switched off
-- without moving the engagement's own pages.
--
-- Row level security is unchanged: these are columns on a table that already
-- has it, and the public page reads them on the server through the service key,
-- with an allowlist of what may leave (src/lib/walkthrough/loader.ts).
-- ============================================================

-- WHY THIS DEFAULTS TO TRUE AND IS STILL SHUT. Two things have to be true for
-- a public link to resolve: the engagement must have a walkthrough_slug, and
-- this must be true. The slug defaults to nothing, and is only ever set by
-- somebody typing it into the engagement's settings, so adding this column
-- makes no existing engagement reachable. The switch exists to take a link
-- away again after it has been handed out, which is the thing that actually
-- happens, and it starts in the position where a link that was just created
-- works.
alter table engagement_clients add column if not exists walkthrough_enabled boolean not null default true;
alter table engagement_clients add column if not exists walkthrough_slug text;
alter table engagement_clients add column if not exists organisation_display_name text;
alter table engagement_clients add column if not exists paying_customer_segment text;
alter table engagement_clients add column if not exists close_phrase text;
alter table engagement_clients add column if not exists portfolio_phrase text;

-- The link is the address, so two engagements cannot hold the same one. Blank
-- links are not compared, because an engagement that has not been given one
-- yet has nothing to clash with.
create unique index if not exists idx_engagement_clients_walkthrough_slug
  on engagement_clients (walkthrough_slug)
  where walkthrough_slug is not null;

-- Lower case, letters, numbers and hyphens. A link with a capital letter or a
-- space in it works in one browser and not in the next.
alter table engagement_clients drop constraint if exists engagement_clients_walkthrough_slug_shape;
alter table engagement_clients add constraint engagement_clients_walkthrough_slug_shape
  check (walkthrough_slug is null or walkthrough_slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$');

comment on column engagement_clients.walkthrough_enabled is
  'When false the public walkthrough link returns not found.';
comment on column engagement_clients.walkthrough_slug is
  'The public walkthrough address, for example tanager in /how-i-work/tanager.';
comment on column engagement_clients.organisation_display_name is
  'The short name used in sentences on the walkthrough. The legal name stays in name.';
comment on column engagement_clients.paying_customer_segment is
  'Who pays for the service, said in a sentence. Decision Point 2 narration.';
comment on column engagement_clients.close_phrase is
  'How the last screen refers to the end of the engagement. Default: At close.';
comment on column engagement_clients.portfolio_phrase is
  'How the last screen refers to the funder''s other organisations. Default: your portfolio.';
