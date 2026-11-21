-- pgbench runs this fixture transaction concurrently in the isolated local cluster.
\set online_client :client_id % 2
begin;
with created_order as (
  insert into public.orders (user_id, order_type, customer_name, business_date, total_amount)
  values (
    case when :online_client = 1 then '00000000-0000-0000-0000-000000000001'::uuid else null end,
    case when :online_client = 1 then 'online' else 'walk_in' end,
    'Concurrency test fixture', date '2099-12-31', 20
  )
  returning id
)
insert into public.order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity)
select o.id, m.id, m.name, m.price, 1
from created_order o cross join public.menu_items m where m.name = 'Samosa';
commit;
