-- ============================================================
-- Evidence storage bucket.
--
-- The Evidence Library lets the coach attach the actual artefact, not just a
-- link to it, because a link to a document nobody can open is not evidence.
-- Files live at <client_id>/<reference>-<filename>, so the first path segment
-- is the client and access can be decided from it.
--
-- The bucket is private. Reading goes through a signed URL, which means a file
-- can never be reached by guessing its address. Who may read and who may write
-- is the same question the rest of the platform already answers, so this reuses
-- can_view_client and can_manage_client_access rather than inventing a second
-- set of rules that could drift from the first.
--
-- Additive only. No existing bucket, object or policy is touched.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 26214400)
on conflict (id) do nothing;

-- The client this object belongs to is the first path segment.
create or replace function public.evidence_object_client(object_name text)
returns text
language sql
immutable
as $$
  select split_part(object_name, '/', 1);
$$;

drop policy if exists "evidence read" on storage.objects;
create policy "evidence read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and public.can_view_client(public.evidence_object_client(name))
  );

drop policy if exists "evidence insert" on storage.objects;
create policy "evidence insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and public.can_manage_client_access(public.evidence_object_client(name))
  );

drop policy if exists "evidence update" on storage.objects;
create policy "evidence update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'evidence'
    and public.can_manage_client_access(public.evidence_object_client(name))
  )
  with check (
    bucket_id = 'evidence'
    and public.can_manage_client_access(public.evidence_object_client(name))
  );

drop policy if exists "evidence delete" on storage.objects;
create policy "evidence delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'evidence'
    and public.can_manage_client_access(public.evidence_object_client(name))
  );
