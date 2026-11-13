-- Explicit privilege model for the GIGI COLLECTION Supabase project.
-- This file documents and applies the minimum required grants for the browser,
-- authenticated app users, and trusted database administration.
--
-- Important: the browser uses the anon key only. The service role and database
-- admin privileges must stay outside the browser and outside the frontend code.

-- 1) Public schema access required by Postgres for RLS-aware sessions.
grant usage on schema public to anon, authenticated;

-- 2) Public storefront reads are allowed without requiring auth.
grant select on public.catalog_categories to anon, authenticated;
grant select on public.catalog_products to anon, authenticated;

-- 2a) Fresh-project compatibility: the customer profile fix adds the phone column if it is
--     absent before any phone-based privilege or metadata grant is applied.
alter table public.profiles
    add column if not exists phone text;

-- 3) Authenticated users may read their own profile row, and the RLS policies
--    enforce the rest. Keep granted access to the minimum required profile metadata.
grant select on public.profiles to authenticated;
grant update (username, phone, email, updated_at) on public.profiles to authenticated;

grant execute on function public.is_developer() to authenticated;
grant execute on function public.is_authorized_admin() to authenticated;

-- Do not grant direct insert or delete to authenticated users. Profile rows are created
-- by the trusted trigger after Auth user creation, and privileged role changes must remain
-- database-side via assign_authorized_role().
revoke insert on public.profiles from authenticated;
revoke delete on public.profiles from authenticated;

-- 4) Trusted database administration is performed by the project owner / service role
--    or a dedicated DB admin session, not by the frontend.
grant all on public.profiles to postgres;
grant all on public.catalog_categories to postgres;
grant all on public.catalog_products to postgres;

grant all on all sequences in schema public to postgres;

-- 5) Explicitly revoke unmanaged access from public before any privileged function execution.
revoke all on function public.bootstrap_first_developer(uuid) from public;
revoke all on function public.assign_authorized_role(uuid, text) from public;
revoke all on function public.authorized_account_status() from public;
revoke all on function public.is_developer() from public;
revoke all on function public.is_authorized_admin() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.update_profiles_updated_at() from public;
revoke all on function public.enforce_profile_account_limit() from public;
revoke all on function public.enforce_profile_role_guard() from public;

-- 6) Only the trusted database admin should be able to invoke the first developer bootstrap.
-- The owner-provisioning flow is available to authenticated developers, but only after
-- the function verifies their developer profile and prevents self-promotion.
grant execute on function public.bootstrap_first_developer(uuid) to postgres;
grant execute on function public.assign_authorized_role(uuid, text) to authenticated;
grant execute on function public.authorized_account_status() to postgres;
grant execute on function public.is_developer() to authenticated;
grant execute on function public.is_authorized_admin() to authenticated;
grant execute on function public.handle_new_user() to postgres;
grant execute on function public.update_profiles_updated_at() to postgres;
grant execute on function public.enforce_profile_account_limit() to postgres;
grant execute on function public.enforce_profile_role_guard() to postgres;

-- 7) RLS helper functions must remain callable by authenticated roles when they are used in
--    policies. The bootstrap function remains restricted to the trusted database owner,
--    while the developer-owned owner-provisioning function is guarded by profile checks.
