-- Phase 1: secure profile layer for exactly two authorised accounts.
-- The browser app must never create or assign roles. Only trusted database-side
-- admin functions should do that after the Auth users are created.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (length(username) >= 3),
    email text not null unique,
    role text not null default 'owner' check (role in ('developer', 'owner')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists profiles_developer_role_unique
    on public.profiles (role)
    where role = 'developer';

create unique index if not exists profiles_owner_role_unique
    on public.profiles (role)
    where role = 'owner';

create index if not exists profiles_role_idx
    on public.profiles (role);

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, auth
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'developer'
    );
$$;

create or replace function public.is_authorized_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, auth
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    next_username text;
begin
    if NEW.id is null then
        raise exception 'auth.users.id is required when creating a profile.';
    end if;

    next_username := coalesce(
        NEW.raw_user_meta_data ->> 'username',
        split_part(NEW.email, '@', 1)
    );

    insert into public.profiles (id, username, email, role)
    values (
        NEW.id,
        next_username,
        NEW.email,
        'owner'
    )
    on conflict (id) do nothing;

    return NEW;
end;
$$;

create or replace function public.update_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
    NEW.updated_at = now();
    return NEW;
end;
$$;

create or replace function public.enforce_profile_account_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    developer_count integer;
    owner_count integer;
    total_profiles integer;
begin
    perform pg_advisory_xact_lock(hashtext('gigi_authorized_accounts'));

    select count(*) into developer_count
    from public.profiles
    where role = 'developer';

    select count(*) into owner_count
    from public.profiles
    where role = 'owner';

    select count(*) into total_profiles
    from public.profiles;

    if TG_OP = 'INSERT' then
        if NEW.role = 'developer' and developer_count >= 1 then
            raise exception 'Only one developer account is allowed.';
        end if;

        if NEW.role = 'owner' and owner_count >= 1 then
            raise exception 'Only one owner account is allowed.';
        end if;

        if total_profiles >= 2 then
            raise exception 'Only two authorised profiles are allowed.';
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

create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
    if NEW.id is distinct from OLD.id then
        raise exception 'Profile identity is immutable.';
    end if;

    if NEW.role is distinct from OLD.role then
        if not exists (
            select 1
            from private.role_authorizations ra
            where ra.target_profile_id = NEW.id
              and ra.requested_role = NEW.role
              and ra.consumed_at is null
              and ra.txid = txid_current()
              and (
                  ra.approved_by is null
                  or ra.approved_by = auth.uid()
              )
        ) then
            raise exception 'Role changes are not allowed through direct profile updates.';
        end if;

        update private.role_authorizations
        set consumed_at = now()
        where target_profile_id = NEW.id
          and requested_role = NEW.role
          and consumed_at is null
          and txid = txid_current();
    end if;

    return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.update_profiles_updated_at();

drop trigger if exists profiles_account_limit on public.profiles;
create trigger profiles_account_limit
before insert or update on public.profiles
for each row execute function public.enforce_profile_account_limit();

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
before update on public.profiles
for each row execute function public.enforce_profile_role_guard();

alter table public.profiles enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'Profiles are readable by the owner or developer'
    ) then
        create policy "Profiles are readable by the owner or developer"
        on public.profiles for select
        using (
            auth.uid() = id
            or public.is_developer()
        );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'Developers can manage profile metadata'
    ) then
        create policy "Developers can manage profile metadata"
        on public.profiles for update
        using (public.is_developer())
        with check (public.is_developer());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'Developers can view all profiles'
    ) then
        create policy "Developers can view all profiles"
        on public.profiles for select
        using (public.is_developer());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'No direct profile insertion from clients'
    ) then
        create policy "No direct profile insertion from clients"
        on public.profiles for insert
        with check (false);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'No direct profile deletion from clients'
    ) then
        create policy "No direct profile deletion from clients"
        on public.profiles for delete
        using (false);
    end if;
end $$;

-- Trusted bootstrap workflow:
-- 1. Create the developer Auth user.
-- 2. Create the owner Auth user.
-- 3. Use the database admin function in the secure SQL workflow to assign roles.
-- 4. Do not enable public sign-up or direct role assignment from the frontend.
