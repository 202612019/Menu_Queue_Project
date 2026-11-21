-- Phase 4 database foundation. Run once as the project database owner.
-- Existing objects with the same names cause a rollback instead of being replaced.
begin;

create schema canteen_private;
revoke all on schema canteen_private from public, anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'student'
    constraint profiles_role_check check (role in ('student', 'staff', 'kitchen', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint categories_name_check check (btrim(name) <> ''),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_name_unique on public.categories (lower(btrim(name)));

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null constraint menu_items_name_check check (btrim(name) <> ''),
  description text not null default '',
  price numeric(12, 2) not null
    constraint menu_items_price_check check (price >= 0 and price <> 'NaN'::numeric),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index menu_items_category_name_unique
  on public.menu_items (category_id, lower(btrim(name)));

create table public.daily_token_counters (
  business_date date primary key,
  last_token_number bigint not null default 0 check (last_token_number >= 0),
  updated_at timestamptz not null default now()
);

create table public.canteen_settings (
  id smallint primary key default 1 check (id = 1),
  is_open boolean not null default false,
  opening_time time,
  closing_time time,
  updated_at timestamptz not null default now(),
  constraint canteen_settings_hours_check check (
    (opening_time is null and closing_time is null)
    or (opening_time is not null and closing_time is not null)
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete restrict,
  order_type text not null check (order_type in ('online', 'walk_in')),
  customer_name text not null check (btrim(customer_name) <> ''),
  token_number bigint not null check (token_number > 0),
  business_date date not null references public.daily_token_counters (business_date) on delete restrict,
  -- Full token is assigned by the insert trigger, including the business-date prefix.
  token text not null unique,
  queue_sequence bigint generated always as identity unique,
  status text not null default 'placed'
    check (status in ('placed', 'accepted', 'preparing', 'ready', 'collected', 'cancelled', 'rejected')),
  status_reason text,
  total_amount numeric(14, 2) not null check (total_amount >= 0 and total_amount <> 'NaN'::numeric),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_daily_token_unique unique (business_date, token_number),
  constraint orders_online_owner_check check (order_type <> 'online' or user_id is not null),
  constraint orders_accepted_at_check check (
    (status in ('placed', 'rejected') and accepted_at is null)
    or (status in ('accepted', 'preparing', 'ready', 'collected') and accepted_at is not null)
    or status = 'cancelled'
  ),
  constraint orders_rejection_reason_check check (
    status <> 'rejected' or nullif(btrim(status_reason), '') is not null
  )
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_business_date_status_idx on public.orders (business_date, status);
-- Preparation priority is the oldest trusted acceptance time, with a stable tie-breaker.
create index orders_accepted_time_idx on public.orders (accepted_at, queue_sequence)
  where status = 'accepted';
-- Ready orders automatically leave this one-slot constraint.
create unique index orders_single_preparing on public.orders ((true)) where status = 'preparing';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  item_name_snapshot text not null check (btrim(item_name_snapshot) <> ''),
  unit_price_snapshot numeric(12, 2) not null
    check (unit_price_snapshot >= 0 and unit_price_snapshot <> 'NaN'::numeric),
  quantity integer not null check (quantity > 0),
  subtotal numeric(14, 2) generated always as (unit_price_snapshot * quantity) stored,
  created_at timestamptz not null default now(),
  constraint order_items_one_line_per_item unique (order_id, menu_item_id)
);

create index order_items_menu_item_idx on public.order_items (menu_item_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  old_status text check (old_status in ('placed', 'accepted', 'preparing', 'ready', 'collected', 'cancelled', 'rejected')),
  new_status text not null check (new_status in ('placed', 'accepted', 'preparing', 'ready', 'collected', 'cancelled', 'rejected')),
  changed_by uuid references public.profiles (id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  reason text
);

create index order_status_history_order_changed_idx on public.order_status_history (order_id, changed_at, id);
create index order_status_history_actor_idx on public.order_status_history (changed_by);

create function canteen_private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function canteen_private.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function canteen_private.set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function canteen_private.set_updated_at();
create trigger daily_token_counters_updated_at before update on public.daily_token_counters
  for each row execute function canteen_private.set_updated_at();
create trigger canteen_settings_updated_at before update on public.canteen_settings
  for each row execute function canteen_private.set_updated_at();

-- Role checks read protected profiles as the function owner to avoid recursive RLS.
-- This helper returns only the caller's own role. It accepts no arbitrary user ID.
create function canteen_private.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

-- Auth metadata may supply a display name. It never supplies an application role.
create function canteen_private.sync_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, full_name, email, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'student');
  else
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger canteen_auth_profile_sync
  after insert or update of email on auth.users
  for each row execute function canteen_private.sync_auth_profile();

-- Existing Auth users receive Student access. Existing accounts are not promoted.
insert into public.profiles (id, full_name, email, role)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email, 'student'
from auth.users
on conflict (id) do nothing;

-- INSERT ... ON CONFLICT takes a row lock. Both order sources share this allocator.
-- The counter change rolls back if the surrounding order transaction fails.
create function canteen_private.allocate_daily_token(p_business_date date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  allocated_number bigint;
begin
  if p_business_date is null then
    raise exception 'A trusted business date is required' using errcode = '23502';
  end if;
  insert into public.daily_token_counters as counter (business_date, last_token_number)
  values (p_business_date, 1)
  on conflict (business_date) do update
    set last_token_number = counter.last_token_number + 1
  returning last_token_number into allocated_number;
  return allocated_number;
end;
$$;

create function canteen_private.initialize_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'placed' or new.accepted_at is not null then
    raise exception 'New orders must start as Placed and await acceptance' using errcode = '23514';
  end if;
  new.token_number := canteen_private.allocate_daily_token(new.business_date);
  new.token := to_char(new.business_date, 'YYYYMMDD') || '-'
    || lpad(new.token_number::text, greatest(3, length(new.token_number::text)), '0');
  -- Assign after acquiring the counter lock so a waiting transaction gets a later time.
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  return new;
end;
$$;

create trigger orders_initialize before insert on public.orders
  for each row execute function canteen_private.initialize_order();

-- These guards protect historical identity and forward-only status transitions.
-- A later server operation starts the oldest (accepted_at, queue_sequence) candidate.
create function canteen_private.guard_order_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.user_id, new.order_type, new.customer_name, new.business_date,
         new.token_number, new.token, new.queue_sequence, new.created_at, new.total_amount)
     is distinct from
     row(old.id, old.user_id, old.order_type, old.customer_name, old.business_date,
         old.token_number, old.token, old.queue_sequence, old.created_at, old.total_amount) then
    raise exception 'Order identity, token, and recorded total are immutable' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'placed' and new.status in ('accepted', 'cancelled', 'rejected'))
      or (old.status = 'accepted' and new.status in ('preparing', 'cancelled'))
      or (old.status = 'preparing' and new.status = 'ready')
      or (old.status = 'ready' and new.status = 'collected')
    ) then
      raise exception 'Invalid order status transition from % to %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if old.status = 'placed' and new.status = 'accepted' then
    new.accepted_at := clock_timestamp();
  else
    new.accepted_at := old.accepted_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger orders_guard_update before update on public.orders
  for each row execute function canteen_private.guard_order_update();

create function canteen_private.record_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, old_status, new_status, changed_by, reason)
    values (new.id, null, new.status, auth.uid(), new.status_reason);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, old_status, new_status, changed_by, reason)
    values (new.id, old.status, new.status, auth.uid(), new.status_reason);
  end if;
  return new;
end;
$$;

create trigger orders_record_status after insert or update on public.orders
  for each row execute function canteen_private.record_order_status();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.daily_token_counters enable row level security;
alter table public.canteen_settings enable row level security;

-- Supabase projects may have broad default grants. Replace them for these tables only.
revoke all on public.profiles, public.categories, public.menu_items, public.orders,
  public.order_items, public.order_status_history, public.daily_token_counters,
  public.canteen_settings from public, anon, authenticated, service_role;
revoke all on sequence public.orders_queue_sequence_seq from public, anon, authenticated, service_role;
revoke all on all functions in schema canteen_private from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema canteen_private to authenticated;
grant execute on function canteen_private.current_app_role() to authenticated;

grant select on public.categories, public.menu_items, public.canteen_settings to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items, public.order_status_history to authenticated;
-- Clients can edit only their own display name. Role and email changes use trusted processes.
grant update (full_name) on public.profiles to authenticated;
grant insert, update on public.categories, public.menu_items to authenticated;
grant update on public.canteen_settings to authenticated;

grant select, insert, update on public.profiles, public.categories, public.menu_items,
  public.orders, public.canteen_settings to service_role;
grant select, insert on public.order_items to service_role;
grant select on public.order_status_history to service_role;
grant usage on sequence public.orders_queue_sequence_seq to service_role;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select canteen_private.current_app_role()) = 'admin');
create policy profiles_update_own_name on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy categories_read_active on public.categories for select to anon, authenticated
  using (is_active);
create policy categories_admin_read on public.categories for select to authenticated
  using ((select canteen_private.current_app_role()) = 'admin');
create policy categories_admin_insert on public.categories for insert to authenticated
  with check ((select canteen_private.current_app_role()) = 'admin');
create policy categories_admin_update on public.categories for update to authenticated
  using ((select canteen_private.current_app_role()) = 'admin')
  with check ((select canteen_private.current_app_role()) = 'admin');

-- Out-of-stock items stay readable. An archived category hides its public menu items.
create policy menu_items_read_active_category on public.menu_items for select to anon, authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.is_active));
create policy menu_items_admin_read on public.menu_items for select to authenticated
  using ((select canteen_private.current_app_role()) = 'admin');
create policy menu_items_admin_insert on public.menu_items for insert to authenticated
  with check ((select canteen_private.current_app_role()) = 'admin');
create policy menu_items_admin_update on public.menu_items for update to authenticated
  using ((select canteen_private.current_app_role()) = 'admin')
  with check ((select canteen_private.current_app_role()) = 'admin');

create policy orders_read_owner_or_operations on public.orders for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select canteen_private.current_app_role()) in ('staff', 'admin')
    or ((select canteen_private.current_app_role()) = 'kitchen' and status in ('accepted', 'preparing', 'ready'))
  );
create policy order_items_read_visible_order on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_status_history_read_owner_or_counter on public.order_status_history for select to authenticated
  using (
    (select canteen_private.current_app_role()) in ('staff', 'admin')
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy canteen_settings_read on public.canteen_settings for select to anon, authenticated
  using (id = 1);
create policy canteen_settings_admin_update on public.canteen_settings for update to authenticated
  using ((select canteen_private.current_app_role()) = 'admin')
  with check ((select canteen_private.current_app_role()) = 'admin');

-- No client order-write, audit-write, counter, or delete policies are granted in Phase 4.
-- Future authorized RPCs must validate role, ownership, prices, availability, totals,
-- idempotency, canteen status, and accepted_at / queue_sequence FIFO selection in one transaction.
insert into public.canteen_settings (id, is_open) values (1, false);

commit;
