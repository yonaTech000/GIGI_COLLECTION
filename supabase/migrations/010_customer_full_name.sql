-- Additive migration for persisting customer full names in the trusted profile creation flow.
-- This migration does not modify historical migrations and intentionally avoids introducing a second trigger.

alter table public.profiles
    add column if not exists full_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    next_username text;
    next_phone text;
    next_full_name text;
begin
    if NEW.id is null then
        raise exception 'auth.users.id is required when creating a profile.';
    end if;

    next_phone := coalesce(
        nullif(trim(NEW.phone), ''),
        nullif(trim(NEW.raw_user_meta_data ->> 'phone'), '')
    );
    next_full_name := coalesce(
        nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(NEW.raw_user_meta_data ->> 'name'), '')
    );
    next_username := coalesce(
        nullif(trim(NEW.raw_user_meta_data ->> 'username'), ''),
        nullif(trim(split_part(trim(coalesce(NEW.email, '')), '@', 1)), ''),
        next_phone,
        'customer'
    );

    insert into public.profiles (id, username, email, phone, full_name, role)
    values (
        NEW.id,
        next_username,
        NEW.email,
        next_phone,
        next_full_name,
        'customer'
    )
    on conflict (id) do update set
        username = excluded.username,
        email = excluded.email,
        phone = coalesce(public.profiles.phone, excluded.phone),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);

    return NEW;
end;
$$;

-- Intentionally left unchanged:
-- - no second trigger is created
-- - no historical migration files are edited
-- - no RLS or permission hardening is relaxed
-- - developer/owner bootstrap logic remains authoritative
