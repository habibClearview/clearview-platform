-- The service this engagement is commercialising. 17 September 2026.
--
-- Habib asked for a per-engagement setting so the Three Questions can name the
-- service out loud: "In 18 months, what would the gender and nutrition service
-- need to be earning". A question that says "your organisation" is answered
-- about the organisation; a question that names the service is answered about
-- the service, which is the whole point of the conversation.
--
-- WHY NOT service_name. That column name is already taken twice, on
-- gtcv_service_inventory and gtcv_assumptions, where it means one row of a
-- service list rather than the subject of the engagement. Two different things
-- sharing a name is how the wrong one gets read. Habib, asked which he
-- preferred: "use a distinct name".
--
-- SAFE TO RUN TWICE. Additive only: one nullable column on an existing table.
-- Nothing is dropped, altered or deleted, and every engagement that already
-- exists simply carries no value, which is what is true of them.
alter table engagement_clients
  add column if not exists commercialised_service text;

comment on column engagement_clients.commercialised_service is
  'The service this engagement is commercialising, written as it would be said in a sentence, for example: gender and nutrition service. Used in the Three Questions and the Engagement Charter. Empty means the copy falls back to "this service".';
