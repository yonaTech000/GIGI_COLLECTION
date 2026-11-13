-- Corrective migration for customer onboarding, profile validation, and permission tightening.
-- This migration is intentionally additive and should be used for fresh projects or projects
-- that have not already applied the older, narrower profile schema.

alter table public.profiles
    add column if not exists phone text;

alter table public.profiles
    alter column role set default 'customer';

-- Replace the legacy developer/owner-only role constraint with a role set that includes customer.
do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_role_check'
    ) then
        alter table public.profiles drop constraint profiles_role_check;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_role_check'
    ) then
        alter table public.profiles
            add constraint profiles_role_check
            check (role in ('customer', 'developer', 'owner'));
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_phone_format_check'
    ) then
        alter table public.profiles
            add constraint profiles_phone_format_check
            check (phone is null or phone ~ '^\+[1-9]\d{7,14}$');
    end if;
end $$;

create unique index if not exists profiles_phone_unique
    on public.profiles (phone)
    where phone is not null;

create unique index if not exists profiles_email_unique
    on public.profiles (lower(email))
    where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    next_username text;
    next_phone text;
begin
    if NEW.id is null then
        raise exception 'auth.users.id is required when creating a profile.';
    end if;

    next_phone := coalesce(NEW.phone, NEW.raw_user_meta_data ->> 'phone');
    next_username := coalesce(
        NEW.raw_user_meta_data ->> 'username',
        split_part(coalesce(NEW.email, ''), '@', 1),
        coalesce(next_phone, 'customer')
    );

    insert into public.profiles (id, username, email, phone, role)
    values (
        NEW.id,
        next_username,
        NEW.email,
        nullif(next_phone, ''),
        'customer'
    )
    on conflict (id) do update set
        username = excluded.username,
        email = excluded.email,
        phone = coalesce(public.profiles.phone, excluded.phone),
        role = coalesce(public.profiles.role, excluded.role);

    return NEW;
end;
$$;

-- The account limit is enforced only for the two privileged account roles.
create or replace function public.enforce_profile_account_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    developer_count integer;
    owner_count integer;
begin
    perform pg_advisory_xact_lock(hashtext('gigi_authorized_accounts'));

    select count(*) into developer_count
    from public.profiles
    where role = 'developer';

    select count(*) into owner_count
    from public.profiles
    where role = 'owner';

    if TG_OP = 'INSERT' then
        if NEW.role = 'developer' and developer_count >= 1 then
            raise exception 'Only one developer account is allowed.';
        end if;

        if NEW.role = 'owner' and owner_count >= 1 then
            raise exception 'Only one owner account is allowed.';
        end if;
    end if;

    if TG_OP = 'UPDATE' then
        if NEW.role is distinct from OLD.role then
            raise exception 'Profile role changes are restricted to the trusted bootstrap functions.';
        end if;

        if NEW.id is distinct from OLD.id then
            raise exception 'Profile identity is immutable.';
        end if;
    end if;

    return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_account_limit on public.profiles;
create trigger profiles_account_limit
before insert or update on public.profiles
for each row execute function public.enforce_profile_account_limit();

-- Customers may update their own non-role metadata. Role and identity changes remain
-- blocked by the existing profile triggers in migrations 001 and 006.
do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'Users can update their own profile metadata'
    ) then
        create policy "Users can update their own profile metadata"
        on public.profiles for update
        using (auth.uid() = id)
        with check (auth.uid() = id);
    end if;
end $$;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (username, phone, email, updated_at) on public.profiles to authenticated;
revoke insert on public.profiles from authenticated;
revoke delete on public.profiles from authenticated;

-- Keep the trusted admin roles authoritative and separate from public signup.
revoke all on function public.bootstrap_first_developer(uuid) from public;
revoke all on function public.assign_authorized_role(uuid, text) from public;
revoke all on function public.authorized_account_status() from public;
revoke all on function public.is_developer() from public;
revoke all on function public.is_authorized_admin() from public;

-- The trusted database/admin role can still execute the required helpers.
grant execute on function public.bootstrap_first_developer(uuid) to postgres;
grant execute on function public.assign_authorized_role(uuid, text) to authenticated;
grant execute on function public.authorized_account_status() to postgres;
grant execute on function public.is_developer() to authenticated;
grant execute on function public.is_authorized_admin() to authenticated;
