-- LOCAL FIXTURE TESTS ONLY. All fixture changes roll back.
begin;

do $$
begin
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r') = 8, 'Expected eight application tables';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) = 8, 'RLS must cover all eight tables';
  assert (select count(*) from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace) = 8,
    'Expected eight foreign key relationships';
  assert exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass
    and conname = 'orders_daily_token_unique' and contype = 'u'), 'Missing daily token uniqueness constraint';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
    and (roles @> array['public']::name[] or roles @> array['anon']::name[])), 'Unsafe public write policy';
  assert not has_function_privilege('authenticated', 'canteen_private.allocate_daily_token(date)', 'EXECUTE'),
    'Client can execute the internal token allocator';
  assert not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
    'Client can assign application roles';
  assert to_regclass('public.orders_accepted_time_idx') is not null, 'Missing acceptance-time queue index';
  assert pg_get_indexdef('public.orders_accepted_time_idx'::regclass, 1, true) = 'accepted_at',
    'Preparation index must prioritize accepted_at';
  assert pg_get_indexdef('public.orders_accepted_time_idx'::regclass, 2, true) = 'queue_sequence',
    'Preparation index must use queue_sequence for ties';
  assert to_regclass('public.orders_accepted_creation_idx') is null,
    'Obsolete creation-time preparation index remains';
  assert (select count(*) from public.categories) = 5, 'Repeated seed duplicated categories';
  assert (select count(*) from public.menu_items) = 8, 'Repeated seed duplicated dishes';
  assert (select price from public.menu_items where name = 'Veg Sandwich') = 45.00, 'Paise conversion is wrong';
  assert not (select is_available from public.menu_items where name = 'Veg Burger'), 'Unavailable demo dish changed';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'student',
    'Backfill trusted user-editable role metadata';
  assert not (select is_open from public.canteen_settings where id = 1), 'Initial canteen status must be Closed';
end;
$$;

-- Bad names, prices, roles, references, singleton IDs, and quantities must fail.
do $$
begin
  begin
    insert into public.categories (name) values (' breakfast ');
    raise exception 'Normalized duplicate category was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.menu_items (category_id, name, price) values (gen_random_uuid(), 'Bad reference', 1);
    raise exception 'Invalid category reference was accepted';
  exception when foreign_key_violation or restrict_violation then null; end;
  begin
    update public.menu_items set price = -1 where name = 'Veg Sandwich';
    raise exception 'Negative price was accepted';
  exception when check_violation then null; end;
  begin
    update public.menu_items set price = 'NaN'::numeric where name = 'Veg Sandwich';
    raise exception 'NaN price was accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'Unknown profile role was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.canteen_settings (id) values (2);
    raise exception 'Multiple settings rows were accepted';
  exception when check_violation then null; end;
end;
$$;

insert into public.orders (id, user_id, order_type, customer_name, business_date, total_amount)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'online', 'Fixture student', date '2099-01-01', 45);
insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('10000000-0000-0000-0000-000000000002', 'walk_in', 'Fixture counter', date '2099-01-01', 20);

insert into public.order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity)
select '10000000-0000-0000-0000-000000000001', id, name, price, 1 from public.menu_items where name = 'Veg Sandwich';

do $$
begin
  assert (select token from public.orders where id = '10000000-0000-0000-0000-000000000001') = '20990101-001';
  assert (select token from public.orders where id = '10000000-0000-0000-0000-000000000002') = '20990101-002';
  assert (select count(*) from public.order_status_history) = 2, 'Initial statuses were not audited';
  begin
    insert into public.orders (order_type, customer_name, business_date, total_amount) values ('online', 'Missing owner', date '2099-01-01', 1);
    raise exception 'Online order without an owner was accepted';
  exception when check_violation then null; end;
  assert (select last_token_number from public.daily_token_counters where business_date = date '2099-01-01') = 2,
    'Failed insert did not roll back counter allocation';
  begin
    update public.order_items set quantity = 0 where order_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Zero quantity was accepted';
  exception when check_violation then null; end;
  begin
    update public.order_items set quantity = '1.5' where order_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Non-integer quantity input was accepted';
  exception when invalid_text_representation then null; end;
  begin
    update public.orders set token_number = 7 where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Existing token was changed';
  exception when check_violation then null; end;
  begin
    update public.orders set status = 'rejected' where id = '10000000-0000-0000-0000-000000000002';
    raise exception 'Rejection without a reason was accepted';
  exception when check_violation then null; end;
end;
$$;

update public.orders set status = 'cancelled', status_reason = 'Fixture cancellation'
where id = '10000000-0000-0000-0000-000000000001';
update public.orders set status = 'rejected', status_reason = 'Fixture rejection'
where id = '10000000-0000-0000-0000-000000000002';
insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('10000000-0000-0000-0000-000000000003', 'walk_in', 'Next fixture', date '2099-01-01', 0);
insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('10000000-0000-0000-0000-000000000004', 'walk_in', 'Next day fixture', date '2099-01-02', 0);
insert into public.daily_token_counters (business_date, last_token_number) values (date '2099-01-03', 999);
insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('10000000-0000-0000-0000-000000000005', 'walk_in', 'Large token fixture', date '2099-01-03', 0);

do $$
begin
  assert (select token_number from public.orders where id = '10000000-0000-0000-0000-000000000003') = 3,
    'Cancelled/rejected tokens were reused';
  assert (select token from public.orders where id = '10000000-0000-0000-0000-000000000004') = '20990102-001',
    'Daily sequence did not reset with a new date prefix';
  assert (select token from public.orders where id = '10000000-0000-0000-0000-000000000005') = '20990103-1000',
    'Token suffix was truncated after 999';
end;
$$;

update public.orders set status = 'accepted' where id in (
  '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
update public.orders set status = 'preparing' where id = '10000000-0000-0000-0000-000000000003';
do $$
begin
  assert (select accepted_at is not null from public.orders where id = '10000000-0000-0000-0000-000000000003');
  begin
    update public.orders set status = 'preparing' where id = '10000000-0000-0000-0000-000000000004';
    raise exception 'Two orders entered Preparing';
  exception when unique_violation then null; end;
  begin
    update public.orders set status = 'cancelled' where id = '10000000-0000-0000-0000-000000000003';
    raise exception 'Preparing order was cancelled';
  exception when check_violation then null; end;
end;
$$;
update public.orders set status = 'ready' where id = '10000000-0000-0000-0000-000000000003';
update public.orders set status = 'preparing' where id = '10000000-0000-0000-0000-000000000004';
update public.orders set status = 'ready' where id = '10000000-0000-0000-0000-000000000004';
update public.orders set status = 'collected' where id = '10000000-0000-0000-0000-000000000004';

update public.menu_items set price = 99, name = 'Edited fixture sandwich' where name = 'Veg Sandwich';
update public.categories set is_active = false where name = 'Breakfast';
do $$
begin
  assert (select item_name_snapshot from public.order_items where order_id = '10000000-0000-0000-0000-000000000001') = 'Veg Sandwich';
  assert (select unit_price_snapshot from public.order_items where order_id = '10000000-0000-0000-0000-000000000001') = 45;
  assert (select subtotal from public.order_items where order_id = '10000000-0000-0000-0000-000000000001') = 45;
  assert (select count(*) from public.orders) = 5, 'Archiving removed historical orders';
  assert not exists (select 1 from public.order_status_history h
    join public.orders o on o.id = h.order_id where h.changed_at < o.created_at),
    'Audit timestamps precede the actual order creation time';
  begin
    delete from public.categories where name = 'Breakfast';
    raise exception 'Referenced category was deleted';
  exception when foreign_key_violation or restrict_violation then null; end;
  begin
    delete from public.menu_items where name = 'Edited fixture sandwich';
    raise exception 'Referenced menu item was deleted';
  exception when foreign_key_violation or restrict_violation then null; end;
  begin
    update public.orders set status = 'accepted' where id = '10000000-0000-0000-0000-000000000004';
    raise exception 'Collected order moved backwards';
  exception when check_violation then null; end;
end;
$$;

rollback;
