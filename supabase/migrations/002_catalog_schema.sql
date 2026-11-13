create table if not exists public.catalog_categories (
    id bigserial primary key,
    name text not null unique,
    slug text not null unique,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.catalog_products (
    id bigserial primary key,
    name text not null,
    slug text not null unique,
    category text not null,
    price numeric(10,2) not null default 0,
    description text not null default '',
    images text[] not null default '{}',
    availability text not null default 'In stock' check (availability in ('In stock', 'Low stock', 'Sold out')),
    featured boolean not null default false,
    is_new boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists catalog_categories_slug_idx on public.catalog_categories (slug);
create index if not exists catalog_products_slug_idx on public.catalog_products (slug);
create index if not exists catalog_products_category_idx on public.catalog_products (category);

alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists catalog_categories_updated_at on public.catalog_categories;
create trigger catalog_categories_updated_at
before update on public.catalog_categories
for each row execute function public.set_updated_at();

drop trigger if exists catalog_products_updated_at on public.catalog_products;
create trigger catalog_products_updated_at
before update on public.catalog_products
for each row execute function public.set_updated_at();

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'catalog_categories'
          and policyname = 'Public can read categories'
    ) then
        create policy "Public can read categories"
        on public.catalog_categories for select
        using (true);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'catalog_products'
          and policyname = 'Public can read products'
    ) then
        create policy "Public can read products"
        on public.catalog_products for select
        using (true);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'catalog_categories'
          and policyname = 'Authorized admins can manage categories'
    ) then
        create policy "Authorized admins can manage categories"
        on public.catalog_categories for all
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
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'catalog_products'
          and policyname = 'Authorized admins can manage products'
    ) then
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
    end if;
end $$;
