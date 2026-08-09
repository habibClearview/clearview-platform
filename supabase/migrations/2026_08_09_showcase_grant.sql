-- ============================================================
-- The showcase link.
--
-- A no-login link a prospect can open to see how the method runs, without
-- seeing anything about the organisation currently running it.
--
-- THE RULE THIS EXISTS TO ENFORCE. The engagement page is not safe to share by
-- reusing it read-only. It loads party names and email addresses, signatures,
-- evidence entries, gate synthesis and the deliverable mapping, and hiding
-- those in the browser hides nothing: the data has already been sent. So the
-- showcase is a separate, server-rendered view built from an allowlist, and
-- this column decides the one genuinely sensitive question that allowlist
-- cannot answer on its own.
--
--   showcase_name_client  false by default. A prospect seeing a live
--                         engagement is seeing that this organisation is a
--                         client, which is a disclosure the organisation has
--                         not agreed to. Naming them is a deliberate act, per
--                         engagement, and the default is silence.
--
-- The link itself reuses client_access_grants, which already carries a token,
-- an expiry, a revocation and a record of when it was last opened. Nothing new
-- is needed for that.
-- ============================================================

alter table engagement_config
  add column if not exists showcase_name_client boolean not null default false;

comment on column engagement_config.showcase_name_client is
  'When false, a showcase link never names the organisation. Naming a live client to a prospect is a disclosure they have to agree to, so the default is silence.';
