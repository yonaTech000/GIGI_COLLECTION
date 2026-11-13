-- Local disposable database test suite for GIGI COLLECTION.
-- This file is not executed against the live Supabase project.
-- Usage: run against a disposable local Postgres/Supabase instance.

BEGIN;

-- 1) unauthenticated access
-- Expect: anonymous users cannot read profiles and cannot write catalog tables.
-- Example checks:
-- select count(*) from public.profiles; -- should be denied by RLS unless session context is set
-- select count(*) from public.catalog_products; -- should be allowed for public read only

-- 2) owner permissions
-- create owner user in auth.users, ensure profile row created;
-- set role to 'owner';
-- verify select on own profile works;
-- verify select other profile fails;
-- verify insert/update/delete on catalog tables fails;

-- 3) developer permissions
-- create developer user in auth.users, ensure profile row created;
-- set role to 'developer';
-- verify developer can read all profiles;
-- verify developer can update non-role metadata;
-- verify developer cannot change their own role if using direct update.

-- 4) role escalation attempts
-- attempt update public.profiles set role='developer' where id = auth.uid();
-- should fail due to trigger guard;
-- attempt update public.profiles set role='developer' where id <> auth.uid();
-- should fail unless trusted admin function is used.

-- 5) duplicate developer and owner roles
-- attempt insert into public.profiles values (..., 'developer');
-- should fail due to unique partial index or trigger.
-- attempt insert into public.profiles values (..., 'owner');
-- should fail due to unique partial index or trigger.

-- 6) third account creation
-- insert a third row with new auth user id and role='owner';
-- should raise due to account limit trigger.

-- 7) simultaneous account creation
-- run parallel transactions that each attempt to insert a profile row;
-- only two rows may remain after both complete.

-- 8) unauthorized function execution
-- as an authenticated non-developer session, call public.assign_authorized_role(...);
-- should fail with 'Only the developer account may assign roles.'

ROLLBACK;
