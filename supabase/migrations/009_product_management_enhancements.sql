-- Final safety corrections for migration 009.
-- This migration remains additive and does not modify migrations 001-008.
-- It keeps the schema-compatible product id as bigint and avoids any silent assumption
-- that historical product rows had stock values. When null stock is encountered,
-- the migration defaults that record to 0 stock so the application can safely manage
-- inventory without changing non-null values already present in the database.

alter table public.catalog_products
    add column if not exists sku text,
    add column if not exists brand text,
    add column if not exists selling_price numeric(10,2),
    add column if not exists marked_price numeric(10,2),
    add column if not exists stock_quantity integer,
    add column if not exists low_stock_threshold integer,
    add column if not exists primary_image text,
    add column if not exists status text,
    add column if not exists is_published boolean,
    add column if not exists is_archived boolean;

-- Backfill product price aliases without overwriting real values that are already present.
update public.catalog_products
set selling_price = price
where selling_price is null and price is not null;

-- Existing product rows are never rewritten unless the source value is null.
-- This intentionally preserves real stock that already exists in the database.
update public.catalog_products
set stock_quantity = 0
where stock_quantity is null;

update public.catalog_products
set low_stock_threshold = 5
where low_stock_threshold is null;

update public.catalog_products
set is_published = true
where is_published is null;

update public.catalog_products
set is_archived = false
where is_archived is null;

update public.catalog_products
set status = case
    when is_archived then 'Archived'
    when not is_published then 'Draft'
    when availability = 'Sold out' then 'Sold out'
    when availability = 'Low stock' then 'Low stock'
    when availability = 'In stock' then 'In stock'
    else 'In stock'
end
where status is null or status = '';

-- Clamp only impossible historical negatives before validation. This ensures the
-- migration preserves existing valid records while keeping the database consistent.
update public.catalog_products
set stock_quantity = 0
where stock_quantity < 0;

update public.catalog_products
set low_stock_threshold = 0
where low_stock_threshold < 0;

alter table public.catalog_products
    alter column stock_quantity set default 0,
    alter column low_stock_threshold set default 5,
    alter column is_published set default true,
    alter column is_archived set default false,
    alter column status set default 'In stock';

alter table public.catalog_products
    alter column stock_quantity set not null,
    alter column low_stock_threshold set not null,
    alter column is_published set not null,
    alter column is_archived set not null,
    alter column status set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.catalog_products'::regclass
          and conname = 'catalog_products_stock_quantity_non_negative'
    ) then
        alter table public.catalog_products
            add constraint catalog_products_stock_quantity_non_negative
            check (stock_quantity >= 0) not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.catalog_products'::regclass
          and conname = 'catalog_products_low_stock_threshold_non_negative'
    ) then
        alter table public.catalog_products
            add constraint catalog_products_low_stock_threshold_non_negative
            check (low_stock_threshold >= 0) not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.catalog_products'::regclass
          and conname = 'catalog_products_status_check'
    ) then
        alter table public.catalog_products
            add constraint catalog_products_status_check
            check (status in ('Draft', 'In stock', 'Low stock', 'Sold out', 'Archived')) not valid;
    end if;
end $$;

alter table public.catalog_products validate constraint catalog_products_stock_quantity_non_negative;
alter table public.catalog_products validate constraint catalog_products_low_stock_threshold_non_negative;
alter table public.catalog_products validate constraint catalog_products_status_check;

create unique index if not exists catalog_products_sku_idx
    on public.catalog_products (lower(sku))
    where sku is not null;

create index if not exists catalog_products_visibility_idx
    on public.catalog_products (is_published, is_archived, stock_quantity);

create index if not exists catalog_products_inventory_idx
    on public.catalog_products (low_stock_threshold, stock_quantity);

create table if not exists public.catalog_stock_adjustments (
    id bigserial primary key,
    product_id bigint not null references public.catalog_products(id) on delete cascade,
    quantity_delta integer not null check (quantity_delta <> 0),
    previous_quantity integer not null default 0 check (previous_quantity >= 0),
    new_quantity integer not null default 0 check (new_quantity >= 0),
    reason text not null default 'Manual stock adjustment',
    created_at timestamptz not null default now()
);

alter table public.catalog_stock_adjustments enable row level security;

-- Audit history is read-only to authenticated developer/owner users.
-- Ordinary authenticated users and anonymous users must not read or alter it.
revoke all on public.catalog_stock_adjustments from public;
revoke all on public.catalog_stock_adjustments from anon;
revoke all on public.catalog_stock_adjustments from authenticated;
revoke insert, update, delete on public.catalog_stock_adjustments from authenticated;
revoke insert, update, delete on public.catalog_stock_adjustments from anon;
revoke insert, update, delete on public.catalog_stock_adjustments from public;

grant select on public.catalog_stock_adjustments to authenticated;
grant select on public.catalog_stock_adjustments to postgres;
grant insert on public.catalog_stock_adjustments to postgres;

drop policy if exists "Authorized admins can read stock adjustments" on public.catalog_stock_adjustments;
create policy "Authorized admins can read stock adjustments"
on public.catalog_stock_adjustments for select
using (
    auth.uid() is not null
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
);

-- The inventory function inserts audit rows using its SECURITY DEFINER privileges,
-- so clients do not receive a direct write grant on the audit table.

-- Atomic stock adjustment in a single transaction. The call fails before any write
-- if validation fails, so the product row and the adjustment history remain unchanged.
create or replace function public.adjust_product_inventory(
    p_product_id bigint,
    p_delta integer,
    p_reason text default 'Manual stock adjustment'
)
returns public.catalog_products
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_product public.catalog_products%rowtype;
    v_previous bigint;
    v_threshold bigint;
    v_next bigint;
    v_next_status text;
    v_reason text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to adjust inventory.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    ) then
        raise exception 'Only developers and owners may adjust inventory.';
    end if;

    if p_product_id is null then
        raise exception 'Product id is required.';
    end if;

    if p_delta is null or p_delta = 0 then
        raise exception 'Stock delta must be a non-zero integer.';
    end if;

    if p_delta::numeric <> trunc(p_delta::numeric) then
        raise exception 'Stock delta must be an integer.';
    end if;

    select * into v_product
    from public.catalog_products
    where id = p_product_id
    for update;

    if not found then
        raise exception 'Product was not found for stock adjustment.';
    end if;

    v_previous := coalesce(v_product.stock_quantity, 0)::bigint;
    v_threshold := coalesce(v_product.low_stock_threshold, 5)::bigint;
    v_next := v_previous + p_delta::bigint;

    if v_next < 0 then
        raise exception 'Stock adjustment would result in negative inventory.';
    end if;

    if v_next > 2147483647::bigint then
        raise exception 'Stock adjustment exceeds the PostgreSQL integer maximum.';
    end if;

    v_next_status := case
        when coalesce(v_product.is_archived, false) then 'Archived'
        when not coalesce(v_product.is_published, true) then 'Draft'
        when v_next <= 0 then 'Sold out'
        when v_threshold > 0 and v_next <= v_threshold then 'Low stock'
        else 'In stock'
    end;

    v_reason := trim(coalesce(p_reason, 'Manual stock adjustment'));
    if v_reason = '' then
        v_reason := 'Manual stock adjustment';
    end if;

    update public.catalog_products
    set
        stock_quantity = v_next::integer,
        low_stock_threshold = v_threshold::integer,
        availability = case
            when v_next <= 0 then 'Sold out'
            when v_threshold > 0 and v_next <= v_threshold then 'Low stock'
            else 'In stock'
        end,
        status = v_next_status,
        updated_at = now()
    where id = p_product_id;

    insert into public.catalog_stock_adjustments (
        product_id,
        quantity_delta,
        previous_quantity,
        new_quantity,
        reason
    )
    values (
        p_product_id,
        p_delta,
        v_previous::integer,
        v_next::integer,
        v_reason
    );

    select * into v_product
    from public.catalog_products
    where id = p_product_id;

    return v_product;
end;
$$;

alter function public.adjust_product_inventory(bigint, integer, text) owner to postgres;

revoke all on function public.adjust_product_inventory(bigint, integer, text) from public;
revoke execute on function public.adjust_product_inventory(bigint, integer, text) from anon;
revoke execute on function public.adjust_product_inventory(bigint, integer, text) from authenticated;
grant execute on function public.adjust_product_inventory(bigint, integer, text) to authenticated;
grant execute on function public.adjust_product_inventory(bigint, integer, text) to postgres;

-- Product image uploads need a dedicated storage bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'product-images',
    'product-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id)
do update set
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Public storefront can read product images.
drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
on storage.objects for select
using (bucket_id = 'product-images');

-- Only authorised admins may upload or modify image files.
drop policy if exists "Authorized admins can upload product images" on storage.objects;
create policy "Authorized admins can upload product images"
on storage.objects for insert
with check (
    bucket_id = 'product-images'
    and auth.uid() is not null
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
);

drop policy if exists "Authorized admins can update product images" on storage.objects;
create policy "Authorized admins can update product images"
on storage.objects for update
using (
    bucket_id = 'product-images'
    and auth.uid() is not null
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
)
with check (
    bucket_id = 'product-images'
    and auth.uid() is not null
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
);

drop policy if exists "Authorized admins can delete product images" on storage.objects;
create policy "Authorized admins can delete product images"
on storage.objects for delete
using (
    bucket_id = 'product-images'
    and auth.uid() is not null
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
);

-- Public storefront reads only published, non-archived products.
drop policy if exists "Public can read products" on public.catalog_products;
create policy "Public can read products"
on public.catalog_products for select
using (is_published and not is_archived);

-- Admin management stays role-scoped and never public.
drop policy if exists "Authorized admins can manage products" on public.catalog_products;
create policy "Authorized admins can manage products"
on public.catalog_products for all
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('developer', 'owner')
    )
);

-- Manual dashboard notes:
-- 1) The product-images bucket must exist in Supabase Storage.
-- 2) Product cleanup is best-effort; stale or orphaned image files can remain if
--    they are not referenced by any catalog row or public URL.
-- 3) This migration does not apply to a live Supabase project and should be reviewed
--    in a controlled staging environment before production use.
