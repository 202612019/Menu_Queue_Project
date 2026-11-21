-- Read-only checks for the Supabase SQL Editor after applying the migration.
-- These queries inspect the eight application tables. They do not change data.

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'profiles', 'categories', 'menu_items', 'orders', 'order_items',
  'order_status_history', 'daily_token_counters', 'canteen_settings'
) and c.relkind = 'r'
order by c.relname;

select table_name, column_name, data_type, is_nullable, column_default, is_generated
from information_schema.columns
where table_schema = 'public' and table_name in (
  'profiles', 'categories', 'menu_items', 'orders', 'order_items',
  'order_status_history', 'daily_token_counters', 'canteen_settings'
)
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.profiles'::regclass, 'public.categories'::regclass, 'public.menu_items'::regclass,
    'public.orders'::regclass, 'public.order_items'::regclass,
    'public.order_status_history'::regclass, 'public.daily_token_counters'::regclass,
    'public.canteen_settings'::regclass
  )
order by table_name, constraint_name;

select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in (
  'profiles', 'categories', 'menu_items', 'orders', 'order_items',
  'order_status_history', 'daily_token_counters', 'canteen_settings'
) order by tablename, indexname;

select tablename, policyname, roles, cmd, qual as using_rule, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'profiles', 'categories', 'menu_items', 'orders', 'order_items',
  'order_status_history', 'daily_token_counters', 'canteen_settings'
) order by tablename, policyname;

-- Expected result: zero rows. Anonymous/public write policies are forbidden.
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and cmd <> 'SELECT'
  and tablename in (
    'profiles', 'categories', 'menu_items', 'orders', 'order_items',
    'order_status_history', 'daily_token_counters', 'canteen_settings'
  )
  and (roles @> array['public']::name[] or roles @> array['anon']::name[]);

-- Expected result: zero rows. Existing orders keep their complete, unique tokens.
select business_date, token_number, count(*) from public.orders
group by business_date, token_number having count(*) > 1;

select
  has_function_privilege('authenticated', 'canteen_private.allocate_daily_token(date)', 'EXECUTE') as client_can_allocate_tokens,
  has_table_privilege('authenticated', 'public.orders', 'INSERT') as client_can_insert_orders,
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as client_can_assign_roles;
-- All three values above must be false in this foundation phase.

select c.name, c.is_active, count(m.id) as menu_items
from public.categories c left join public.menu_items m on m.category_id = c.id
group by c.id order by c.name;
-- A fresh database with only seed.sql has five categories and eight menu items.

select id, is_open, opening_time, closing_time from public.canteen_settings;

-- Waiting preparation candidates, oldest acceptance first with deterministic ties.
select id, token, order_type, accepted_at, queue_sequence
from public.orders
where status = 'accepted'
order by accepted_at asc, queue_sequence asc;
