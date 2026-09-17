-- ============================================================
-- RUN THIS ONCE, IN THE SUPABASE SQL EDITOR.
--
-- Two parts. The first adds the columns the walkthrough link needs. The second
-- fills in the Ikore engagement so that the Tanager link works.
--
-- It is safe to run twice. Every statement checks first, and nothing here
-- deletes, renames or overwrites anything that already has a value.
-- ============================================================

-- ─── PART ONE: the columns ──────────────────────────────────
alter table engagement_clients add column if not exists commercialised_service text;
alter table engagement_clients add column if not exists walkthrough_enabled boolean not null default true;
alter table engagement_clients add column if not exists walkthrough_slug text;
alter table engagement_clients add column if not exists organisation_display_name text;
alter table engagement_clients add column if not exists paying_customer_segment text;
alter table engagement_clients add column if not exists close_phrase text;
alter table engagement_clients add column if not exists portfolio_phrase text;

create unique index if not exists idx_engagement_clients_walkthrough_slug
  on engagement_clients (walkthrough_slug)
  where walkthrough_slug is not null;

alter table engagement_clients drop constraint if exists engagement_clients_walkthrough_slug_shape;
alter table engagement_clients add constraint engagement_clients_walkthrough_slug_shape
  check (walkthrough_slug is null or walkthrough_slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$');

-- ─── PART TWO: the Ikore engagement ─────────────────────────
-- Look first, so you can see which engagement is about to be changed.
select id, name, slug, start_date, expected_close
from engagement_clients
where name ilike '%ikore%';

-- Then fill it in. Only blank fields are written; anything already recorded is
-- left exactly as it is.
update engagement_clients set
  commercialised_service    = coalesce(nullif(commercialised_service, ''),    'gender and nutrition service'),
  walkthrough_slug          = coalesce(walkthrough_slug,                      'tanager'),
  organisation_display_name = coalesce(nullif(organisation_display_name, ''), 'Ikore'),
  paying_customer_segment   = coalesce(nullif(paying_customer_segment, ''),   'African agricultural institutions'),
  close_phrase              = coalesce(nullif(close_phrase, ''),              'In March 2027'),
  portfolio_phrase          = coalesce(nullif(portfolio_phrase, ''),          'the other organisations in IGNITE+'),
  walkthrough_enabled       = true,
  updated_at                = now()
where name ilike '%ikore%';

-- Check what it now says.
select name, walkthrough_slug, walkthrough_enabled, organisation_display_name,
       commercialised_service, paying_customer_segment, close_phrase, portfolio_phrase,
       start_date, expected_close
from engagement_clients
where name ilike '%ikore%';
