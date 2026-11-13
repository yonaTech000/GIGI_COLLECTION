-- Trusted role bootstrap fix.
--
-- This migration is intentionally narrow: it does not modify historical migrations,
-- and it does not weaken the profile protection trigger. It corrects the premature
-- rejection of legitimate database-side bootstrap updates while preserving the
-- authorization-ledger validation as the actual role-change gate.

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

    if TG_OP = 'INSERT' then
        select count(*) into developer_count
        from public.profiles
        where role = 'developer';

        select count(*) into owner_count
        from public.profiles
        where role = 'owner';

        if NEW.role = 'developer' and developer_count >= 1 then
            raise exception 'Only one developer account is allowed.';
        end if;

        if NEW.role = 'owner' and owner_count >= 1 then
            raise exception 'Only one owner account is allowed.';
        end if;
    end if;

    if TG_OP = 'UPDATE' then
        if NEW.id is distinct from OLD.id then
            raise exception 'Profile identity is immutable.';
        end if;

        if NEW.role is distinct from OLD.role then
            -- Do not try to infer trust from current_user here. That value is
            -- security-definer-owned and does not distinguish a customer-triggered
            -- update from a trusted bootstrap update. The ledger-backed role guard
            -- remains the actual authorization gate.
            if NEW.role = 'developer' then
                if exists (
                    select 1
                    from public.profiles
                    where role = 'developer'
                      and id <> NEW.id
                ) then
                    raise exception 'Only one developer account is allowed.';
                end if;
            end if;

            if NEW.role = 'owner' then
                if exists (
                    select 1
                    from public.profiles
                    where role = 'owner'
                      and id <> NEW.id
                ) then
                    raise exception 'Only one owner account is allowed.';
                end if;
            end if;
        end if;
    end if;

    return NEW;
end;
$$;

-- Keep the authorization ledger as the actual role-change verifier.
create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
    matching_auth_id uuid;
begin
    if NEW.id is distinct from OLD.id then
        raise exception 'Profile identity is immutable.';
    end if;

    if NEW.role is distinct from OLD.role then
        select ra.id into matching_auth_id
        from private.role_authorizations ra
        where ra.target_profile_id = NEW.id
          and ra.requested_role = NEW.role
          and ra.consumed_at is null
          and ra.txid = txid_current()
          and (
              ra.approved_by is null
              or ra.approved_by = auth.uid()
          )
        order by ra.approved_at desc, ra.id
        limit 1
        for update;

        if matching_auth_id is null then
            raise exception 'Role changes are not allowed through direct profile updates.';
        end if;

        update private.role_authorizations
        set consumed_at = now()
        where id = matching_auth_id
          and target_profile_id = NEW.id
          and requested_role = NEW.role
          and consumed_at is null
          and txid = txid_current()
          and (
              approved_by is null
              or approved_by = auth.uid()
          );

        if not found then
            raise exception 'Role changes are not allowed through direct profile updates.';
        end if;
    end if;

    return NEW;
end;
$$;

-- Recreate the triggers explicitly.
-- PostgreSQL does not guarantee trigger execution order by creation sequence when
-- multiple BEFORE UPDATE triggers share the same event. The security boundary is
-- therefore enforced by the role guard itself, while the account-limit trigger
-- enforces the one-developer / one-owner caps without attempting to infer trust.
drop trigger if exists profiles_account_limit on public.profiles;
create trigger profiles_account_limit
before insert or update on public.profiles
for each row execute function public.enforce_profile_account_limit();

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
before update on public.profiles
for each row execute function public.enforce_profile_role_guard();
