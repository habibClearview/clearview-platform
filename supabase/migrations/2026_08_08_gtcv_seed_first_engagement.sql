-- ============================================================
-- GtCV: seed the FIRST engagement record, for staging.
--
-- This is DATA, not schema. It creates one engagement so the journey and
-- Charter pages have something real to render: the programme, the client
-- being coached, its configuration, the parties, the deliverables, the
-- mapping of each deliverable onto the decision gates, and a draft Charter.
--
-- Nothing here is special. It is simply the first row in a client-agnostic
-- structure. Any other engagement is created the same way with different
-- values, and the same pages render it.
--
-- SAFE TO APPLY: additive and idempotent. Every insert is guarded with
-- "on conflict do nothing" or a "not exists" check, so running it twice
-- changes nothing. It only writes the rows it owns and never alters
-- anything that already exists.
--
-- Apply to STAGING. Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) The programme (the funder side of the engagement).
insert into programmes (id, name, type, funder, country, notes)
values (
  'prog-ignite-plus',
  'IGNITE+ Nigeria',
  'donor_programme',
  'Tanager',
  'Nigeria',
  'Seeded as the first engagement record. All values are configuration.'
)
on conflict (id) do nothing;

-- 2) The client being coached (the beneficiary organisation).
insert into engagement_clients (
  id, name, slug, type, engagement_mode, programme_id, status,
  country, sector, clearview_active, start_date, expected_close, notes
)
values (
  'client-ikore',
  'Ikore',
  'ikore',
  'service_lsp',
  'canvas',
  'prog-ignite-plus',
  'dp03',
  'Nigeria',
  'Agriculture and market systems',
  false,
  date '2026-07-01',
  date '2026-12-31',
  'Seeded as the first engagement record.'
)
on conflict (id) do nothing;

-- 3) Per engagement configuration.
insert into engagement_config (
  client_id, terminology, momentum_status, validation_min_per_segment,
  independence_test_set, showcase_enabled
)
values ('client-ikore', 'zone', 'green', 5, 'tools', false)
on conflict (client_id) do nothing;

-- 4) The parties. Roles are fixed, the people are configuration.
--    Emails are left null on purpose so no mail can go anywhere from a
--    staging seed. Fill them in from the app when you are ready.
insert into engagement_parties (client_id, party_role, name, organisation, title, is_signatory, sort_order)
select * from (values
  ('client-ikore', 'client_funder',   'Tanager',                'Tanager', null,                  false, 1),
  ('client-ikore', 'funder_rep',      'Country Representative', 'Tanager', 'Country Representative', true,  2),
  ('client-ikore', 'lsp_ed',          'Executive Director',     'Ikore',   'Executive Director',  true,  3),
  ('client-ikore', 'lsp_leadership',  'Leadership Team',        'Ikore',   null,                  false, 4),
  ('client-ikore', 'lsp_finance',     'Finance Lead',           'Ikore',   'Finance Lead',        false, 5),
  ('client-ikore', 'lsp_field',       'Field Team',             'Ikore',   null,                  false, 6),
  -- The board chair signs the pre-engagement diagnostic record and approves
  -- the scale pathway commitment, so they are a signatory. Marked false here
  -- originally, which meant the lead consultant could not even record their
  -- signature, because only a signatory can be recorded.
  ('client-ikore', 'lsp_board',       'Board Chair',            'Ikore',   'Board Chair',         true,  7),
  ('client-ikore', 'lead_consultant', 'Habib Onifade',          'The Canvas Coach', 'Lead Consultant', true, 8),
  ('client-ikore', 'co_implementer',  'Ganiat Ettu',            'The Canvas Coach', 'Co-implementer',  false, 9)
) as v(client_id, party_role, name, organisation, title, is_signatory, sort_order)
where not exists (select 1 from engagement_parties p where p.client_id = 'client-ikore');

-- 5) The deliverables and their payment milestones.
insert into engagement_deliverables (
  client_id, code, title, milestone_no, milestone_label,
  payment_amount, payment_currency, due_window, sort_order, status
)
select * from (values
  ('client-ikore', 'Inception', 'Inception Report, workplan, methodology note and baseline cost structure', 1, 'Inception',                 7800.00,  'USD', 'July 2026',      1, 'accepted'),
  ('client-ikore', 'D1',        'Refined service bundles',                                                  2, 'Service Bundle Refinement', 13650.00, 'USD', 'August 2026',    2, 'in_progress'),
  ('client-ikore', 'D2',        'Value propositions per priority segment',                                  2, 'Service Bundle Refinement', null,     'USD', 'September 2026', 3, 'in_progress'),
  ('client-ikore', 'D3',        'Pricing models, cost report and market reference',                         2, 'Service Bundle Refinement', null,     'USD', 'September 2026', 4, 'pending'),
  ('client-ikore', 'D4',        'Go to market plan and communications toolkit',                             3, 'Iteration I',               9750.00,  'USD', 'October 2026',   5, 'pending'),
  ('client-ikore', 'D5',        'Lessons from the pilot rounds',                                            3, 'Iteration I',               null,     'USD', 'November 2026',  6, 'pending'),
  ('client-ikore', 'Final',     'Priced bundles, lessons learnt report, tools handover and close out',      4, 'Final Delivery',            7800.00,  'USD', 'December 2026',  7, 'pending')
) as v(client_id, code, title, milestone_no, milestone_label, payment_amount, payment_currency, due_window, sort_order, status)
where not exists (select 1 from engagement_deliverables d where d.client_id = 'client-ikore');

-- 6) The mapping of each deliverable onto the decision gates that evidence
--    it, with the means of verification. Approved here because this mapping
--    was confirmed by the lead consultant.
insert into deliverable_gate_map (client_id, deliverable_id, dp_id, required_evidence, approved, source)
select 'client-ikore', d.id, m.dp_id, m.evidence, true, 'manual'
from engagement_deliverables d
join (values
  ('Inception', 'setup',    'Signed pre-engagement diagnostic record and agreed workplan'),
  ('Inception', 'phase_0',  'Continue, pause or kill decision recorded for every activity'),
  ('D1',        'dp01',     'Service inventory with grant logic and market logic classification, and the stop, pause or redesign register'),
  ('D2',        'dp02',     'At least five validation conversations per segment, with three converging, and a named budget holder'),
  ('D2',        'dp03',     'Client tested value proposition per priority segment, signed off'),
  ('D3',        'dp04',     'Working cost model, price floor, at least two pricing tiers and a calculated break even'),
  ('D4',        'dp05',     'Priority client list, tested messaging and a live pipeline with a committed launch date'),
  ('D4',        'dp06',     'Commercial identity statement and partner map, with conflicts addressed'),
  ('D5',        'dp07',     'Two pilot iterations with real paying clients, revision log and pilot learning summary'),
  ('Final',     'dp08',     'Scale pathway map with independent channels and a board approved commitment'),
  ('Final',     'dp09',     'Commercial readiness scored at baseline, mid point and close, with the investment case'),
  ('Final',     'handover', 'The five independence tests passed and the completion record signed')
) as m(code, dp_id, evidence) on m.code = d.code
where d.client_id = 'client-ikore'
on conflict (deliverable_id, dp_id) do nothing;

-- 7) A draft Charter, version 1, ready to review.
insert into engagement_charters (client_id, version, title, status, content)
select
  'client-ikore', 1,
  'How we work together and what commercial viability will ask of Ikore',
  'draft',
  jsonb_build_object(
    'governance', jsonb_build_object(
      'gates_in_order', true,
      'evidence_standard', 'Every block closes on evidence, generated by the organisation, guided by the coach, signed off by the Executive Director and accepted by the funder.',
      'momentum', 'green, amber, red'
    )
  )
where not exists (
  select 1 from engagement_charters c where c.client_id = 'client-ikore' and c.version = 1
);
