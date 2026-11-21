-- LOCAL FIXTURE TESTS ONLY. The runner creates an isolated cluster with Auth stubs.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-0000-0000-000000000001', 'student-a@example.test', '{"full_name":"Student A","role":"admin"}'),
  ('20000000-0000-0000-0000-000000000002', 'student-b@example.test', '{"full_name":"Student B"}'),
  ('20000000-0000-0000-0000-000000000003', 'staff@example.test', '{}'),
  ('20000000-0000-0000-0000-000000000004', 'kitchen@example.test', '{}'),
  ('20000000-0000-0000-0000-000000000005', 'admin@example.test', '{}');

-- This fixture uses the same trusted database-owner process as first-admin setup.
update public.profiles set role = 'staff' where id = '20000000-0000-0000-0000-000000000003';
update public.profiles set role = 'kitchen' where id = '20000000-0000-0000-0000-000000000004';
update public.profiles set role = 'admin' where id = '20000000-0000-0000-0000-000000000005';
update auth.users set email = 'student-a-updated@example.test' where id = '20000000-0000-0000-0000-000000000001';

do $$
begin
  assert (select role from public.profiles where id = '20000000-0000-0000-0000-000000000001') = 'student',
    'Signup accepted a role from user-editable metadata';
  assert (select email from public.profiles where id = '20000000-0000-0000-0000-000000000001') = 'student-a-updated@example.test',
    'Auth email synchronization failed';
end;
$$;

insert into public.categories (id, name, is_active)
values ('40000000-0000-0000-0000-000000000001', 'Archived fixture category', false);
insert into public.menu_items (category_id, name, price)
values ('40000000-0000-0000-0000-000000000001', 'Hidden fixture food', 1);

insert into public.orders (id, user_id, order_type, customer_name, business_date, total_amount) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'online', 'Student A', date '2098-01-01', 20),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'online', 'Student B', date '2098-01-01', 20),
  ('30000000-0000-0000-0000-000000000003', null, 'walk_in', 'Counter fixture', date '2098-01-01', 20),
  ('30000000-0000-0000-0000-000000000004', null, 'walk_in', 'Collected fixture', date '2098-01-01', 20);

insert into public.order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity)
select o.id, m.id, m.name, m.price, 1 from public.orders o cross join public.menu_items m
where m.name = 'Samosa' and o.business_date = date '2098-01-01';

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
update public.orders set status = 'accepted' where id in (
  '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004');
update public.orders set status = 'preparing' where id = '30000000-0000-0000-0000-000000000004';
update public.orders set status = 'ready' where id = '30000000-0000-0000-0000-000000000004';
update public.orders set status = 'collected' where id = '30000000-0000-0000-0000-000000000004';
do $$
begin
  assert exists (select 1 from public.order_status_history where new_status = 'collected'
    and changed_by = '20000000-0000-0000-0000-000000000005'), 'Authenticated actor was not recorded';
end;
$$;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
begin
  assert (select count(*) from public.categories) = 5, 'Anonymous user read archived category';
  assert (select count(*) from public.menu_items) = 8, 'Anonymous menu visibility is wrong';
  assert exists (select 1 from public.menu_items where name = 'Veg Burger' and not is_available),
    'Out-of-stock food must remain visible';
  begin
    perform 1 from public.orders;
    raise exception 'Anonymous user read private orders';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.categories (name) values ('Anonymous write');
    raise exception 'Anonymous public write was allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'Student read another profile';
  assert (select count(*) from public.orders) = 1, 'Student read another order';
  assert (select count(*) from public.order_items) = 1, 'Student read another order item';
  assert (select count(*) from public.order_status_history) = 1, 'Student read another audit history';
  update public.profiles set full_name = 'Updated Student A' where id = auth.uid();
  assert (select full_name from public.profiles where id = auth.uid()) = 'Updated Student A';
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'Student promoted their own role';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set email = 'spoof@example.test' where id = auth.uid();
    raise exception 'Student changed trusted Auth email through profiles';
  exception when insufficient_privilege then null; end;
  update public.menu_items set price = 1 where name = 'Samosa';
  assert (select price from public.menu_items where name = 'Samosa') = 20, 'Student changed a price';
  begin
    insert into public.categories (name) values ('Student write');
    raise exception 'Student inserted a category';
  exception when insufficient_privilege then null; end;
  begin
    update public.orders set status = 'accepted';
    raise exception 'Client changed order status without an authorized server operation';
  exception when insufficient_privilege then null; end;
  begin
    perform canteen_private.allocate_daily_token(date '2098-01-01');
    raise exception 'Client executed the internal token allocator';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.daily_token_counters;
    raise exception 'Client read private token counters';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.orders) = 4, 'Counter staff cannot read operational orders';
  assert (select count(*) from public.order_items) = 4, 'Counter staff cannot read operational items';
  update public.menu_items set price = 1 where name = 'Samosa';
  assert (select price from public.menu_items where name = 'Samosa') = 20, 'Counter staff changed a menu price';
  begin
    update public.orders set status = 'accepted' where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'Direct status writes bypassed future server authorization';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.orders) = 1, 'Kitchen read Placed or historical orders';
  assert (select count(*) from public.order_items) = 1, 'Kitchen item visibility is wrong';
  assert (select count(*) from public.order_status_history) = 0, 'Kitchen read unrelated private history';
  assert (select count(*) from public.profiles) = 1, 'Kitchen read other profiles';
  update public.canteen_settings set is_open = true;
  assert not (select is_open from public.canteen_settings), 'Kitchen changed canteen settings';
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.profiles) = 6, 'Admin cannot inspect profiles';
  assert (select count(*) from public.categories) = 6, 'Admin cannot read archived categories';
  assert (select count(*) from public.menu_items) = 9, 'Admin cannot read archived-category food';
  update public.menu_items set price = 25 where name = 'Samosa';
  assert (select price from public.menu_items where name = 'Samosa') = 25, 'Admin price update failed';
  update public.canteen_settings set is_open = true;
  assert (select is_open from public.canteen_settings), 'Admin settings update failed';
  begin
    update public.profiles set role = 'staff' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Browser role assignment bypassed the trusted admin process';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.orders;
    raise exception 'Historical order deletion was allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Even the trusted backend gets token allocation through order creation, and no audit writes.
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
insert into public.orders (order_type, customer_name, business_date, total_amount)
values ('walk_in', 'Trusted backend fixture', date '2098-01-01', 0);
do $$
begin
  assert (select count(*) from public.orders) = 5, 'Trusted backend insert failed';
  begin
    update public.daily_token_counters set last_token_number = 0;
    raise exception 'Trusted backend reset the counter directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.order_status_history (order_id, new_status)
    values ('30000000-0000-0000-0000-000000000001', 'collected');
    raise exception 'Trusted backend forged an audit row directly';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

rollback;
