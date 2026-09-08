-- ============================================================
-- THE DATABASE DID NOT BELIEVE IN FUNDERS.  8 September 2026.
--
-- user_profiles.role carried a CHECK listing six roles and 'funder' was not
-- among them, while the application has referred to 'funder' throughout:
-- resolveClientAccess grants a programme funder read access by it, the coach
-- dashboard turns them away by it, assignable-roles lets a super_coach mint
-- one, and the sign-in page routes them by it.
--
-- So every path that tried to create a funder login failed on a constraint,
-- including /api/invite-user. Nobody noticed because no funder had ever been
-- created: the count of funder profiles in production is zero. It surfaced the
-- first time Habib sent the welcome letter to a paying client, where the
-- failure to create the login correctly stopped the whole send.
--
-- 'co_implementer' is added at the same time. types.ts has carried it as a
-- role since the auth model was written and the constraint never did.
--
-- SAFE TO RUN TWICE.
-- ============================================================

alter table user_profiles drop constraint if exists user_profiles_role_check;

alter table user_profiles add constraint user_profiles_role_check
  check (role = any (array[
    'super_coach',
    'coach',
    'co_implementer',
    'funder',
    'ceo',
    'finance_manager',
    'unit_head',
    'accounts_assistant'
  ]));
