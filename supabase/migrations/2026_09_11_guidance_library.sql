-- ============================================================
-- THE GUIDANCE LIBRARY. 11 September 2026.
--
-- Habib asked where a co-implementer gets the guidance notes and manuals, and
-- whether she should have access to his Gmail folder that holds them.
--
-- She should not. A mail folder is reached through a mail account, and that
-- account holds his commercial terms, his other clients and everything else.
-- Access to a folder is access to an account.
--
-- So the manuals live here. Not against a client, because they are the method
-- rather than anybody's engagement: one library, read by the coaching team
-- wherever they are working.
--
-- WHO SEES IT. The lead consultant and the co-implementers, and nobody else.
-- A client and a funder never see the coach's guidance, which is the same rule
-- the Coach quick reference already follows: canViewCoachGuidance is true for
-- super_coach and for a co-implementer, and false for everybody else.
--
-- A DOCUMENT IS EITHER UPLOADED OR LINKED. Uploaded is better, because a link
-- is only as good as somebody else's sharing settings and breaks silently when
-- they change. Linking is kept for what genuinely lives elsewhere.
--
-- SAFE TO RUN TWICE.
-- ============================================================
create table if not exists guidance_documents (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  -- What it is for, in a sentence, so a shelf of similar titles can be read.
  description text,

  -- How the method itself is grouped, so the library reads in the order the
  -- work is done rather than in the order things were uploaded.
  category text not null default 'method',

  -- Exactly one of these. A file in the guidance bucket, or an address.
  file_path text,
  url text,
  -- What was uploaded, so the browser is told the truth about it.
  mime_type text,
  size_bytes bigint,

  sort_order integer not null default 0,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guidance_documents_has_one_source
    check (num_nonnulls(file_path, url) = 1),
  constraint guidance_documents_category_check
    check (category in ('method','delivery','templates','commercial','reference'))
);

create index if not exists guidance_documents_category_idx on guidance_documents(category, sort_order);

alter table guidance_documents enable row level security;

-- THE COACHING TEAM, AND NOBODY ELSE. A client or a funder signing in never
-- sees the guidance, the fee notes or the method's own manuals.
drop policy if exists coaching_team_reads on guidance_documents;
drop policy if exists lead_consultant_writes on guidance_documents;

create policy coaching_team_reads on guidance_documents for select
  using (my_role() in ('super_coach', 'coach', 'co_implementer'));

-- Only the lead consultant changes the library. A co-implementer reads it.
create policy lead_consultant_writes on guidance_documents for all
  using (my_role() = 'super_coach')
  with check (my_role() = 'super_coach');
