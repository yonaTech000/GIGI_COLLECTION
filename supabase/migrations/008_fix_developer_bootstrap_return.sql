-- Fix the bootstrap function return contract without changing its security model.
-- The function must return a single public.profiles row value, not a rowset with
-- multiple columns.

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

    select * into target_profile
    from public.profiles
    where id = target_user_id;

    return target_profile;
end;
$$;

alter function public.bootstrap_first_developer(uuid) owner to postgres;
