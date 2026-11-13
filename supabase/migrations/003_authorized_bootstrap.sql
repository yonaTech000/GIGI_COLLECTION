-- Secure bootstrap workflow for the two authorised accounts.
-- This file is intentionally not a public signup path. It provides a trusted,
-- database-side way to move a newly created Auth user into the developer or owner
-- role while enforcing the maximum of two profiles and preventing self-assignment.
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

grant usage on schema private to postgres;
alter schema private owner to postgres;

create table if not exists private.role_authorizations (
    id uuid primary key default gen_random_uuid(),
    target_profile_id uuid not null references public.profiles(id) on delete cascade,
    requested_role text not null check (requested_role in ('developer', 'owner')),
    approved_by uuid null references public.profiles(id),
    approved_at timestamptz not null default now(),
    txid bigint not null default txid_current(),
    consumed_at timestamptz null,
    unique (target_profile_id, requested_role, txid)
);

revoke all on table private.role_authorizations from public;
revoke all on table private.role_authorizations from anon;
revoke all on table private.role_authorizations from authenticated;

grant all on table private.role_authorizations to postgres;
alter table private.role_authorizations owner to postgres;
alter table private.role_authorizations enable row level security;

drop policy if exists "private_role_authorizations_deny_all_to_clients" on private.role_authorizations;
create policy "private_role_authorizations_deny_all_to_clients"
on private.role_authorizations
for all
using (false)
with check (false);

create or replace function public.bootstrap_first_developer(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    target_profile public.profiles%rowtype;
    auth_row private.role_authorizations%rowtype;
begin
    if current_user <> 'postgres' then
        raise exception 'Only the trusted database owner may bootstrap the first developer.';
    end if;

    perform pg_advisory_xact_lock(hashtext('gigi_authorized_accounts'));

    if exists (
        select 1
        from public.profiles
        where role = 'developer'
    ) then
        raise exception 'A developer account already exists. The first developer bootstrap is single-use.';
    end if;

    select * into target_profile
    from public.profiles
    where id = target_user_id
    for update;

    if target_profile.id is null then
        raise exception 'Target profile was not found.';
    end if;

    insert into private.role_authorizations (
        target_profile_id,
        requested_role,
        approved_by,
        approved_at,
        txid,
        consumed_at
    ) values (
        target_user_id,
        'developer',
        null,
        now(),
        txid_current(),
        null
    )
    returning * into auth_row;

    update public.profiles
    set role = 'developer',
        updated_at = now()
    where id = target_user_id;

    return (
        select *
        from public.profiles
        where id = target_user_id
    );
end;
$$;

alter function public.bootstrap_first_developer(uuid) owner to postgres;

create or replace function public.assign_authorized_role(target_user_id uuid, target_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    target_profile public.profiles%rowtype;
    auth_row private.role_authorizations%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to assign authorised roles.';
    end if;

    if not public.is_developer() then
        raise exception 'Only the developer account may assign roles.';
    end if;

    if target_user_id = auth.uid() then
        raise exception 'You cannot change your own role.';
    end if;

    if target_role not in ('developer', 'owner') then
        raise exception 'Only developer and owner roles are permitted.';
    end if;

    if target_role = 'developer' then
        raise exception 'Developer assignment is reserved for the trusted first-developer bootstrap flow.';
    end if;

    select * into target_profile
    from public.profiles
    where id = target_user_id
    for update;

    if target_profile.id is null then
        raise exception 'Target profile was not found.';
    end if;

    perform pg_advisory_xact_lock(hashtext('gigi_authorized_accounts'));

    if exists (
        select 1
        from public.profiles
        where role = 'owner'
          and id <> target_user_id
    ) then
        raise exception 'An owner account already exists. Exactly one owner is allowed.';
    end if;

    insert into private.role_authorizations (
        target_profile_id,
        requested_role,
        approved_by,
        approved_at,
        txid,
        consumed_at
    ) values (
        target_user_id,
        target_role,
        auth.uid(),
        now(),
        txid_current(),
        null
    )
    returning * into auth_row;

    update public.profiles
    set role = target_role,
        updated_at = now()
    where id = target_user_id;

    return (
        select *
        from public.profiles
        where id = target_user_id
    );
end;
$$;

alter function public.assign_authorized_role(uuid, text) owner to postgres;

create or replace function public.authorized_account_status()
returns table (
    developer_id uuid,
    owner_id uuid,
    profile_count bigint,
    bootstrap_complete boolean
)
language sql
security definer
set search_path = public, pg_catalog, auth
as $$
    select
        (select id from public.profiles where role = 'developer' limit 1) as developer_id,
        (select id from public.profiles where role = 'owner' limit 1) as owner_id,
        (select count(*) from public.profiles) as profile_count,
        (
            (select count(*) from public.profiles where role = 'developer') = 1
            and (select count(*) from public.profiles where role = 'owner') = 1
        ) as bootstrap_complete;
$$;

alter function public.authorized_account_status() owner to postgres;

-- Manual usage examples:
-- 1. First developer bootstrap, run by the trusted database owner/admin project role:
-- select public.bootstrap_first_developer(
--   (select id from public.profiles where email = 'developer@example.com')
-- );
--
-- 2. Owner provisioning, run by an authenticated developer session:
-- select public.assign_authorized_role(
--   (select id from public.profiles where email = 'owner@example.com'),
--   'owner'
-- );
