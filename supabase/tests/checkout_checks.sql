-- Isolated local cluster only. Every fixture change rolls back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('70000000-0000-4000-8000-000000000001','checkout-a@example.test','{"full_name":"Checkout A"}'),
 ('70000000-0000-4000-8000-000000000002','checkout-b@example.test','{"full_name":"Checkout B"}'),
 ('70000000-0000-4000-8000-000000000003','checkout-staff@example.test','{"full_name":"Counter"}');
update public.profiles set role='staff' where id='70000000-0000-4000-8000-000000000003';
update public.canteen_settings set is_open=true;
update public.menu_items set price=0.29 where name='Samosa';
create temp table checkout_test_state(k text primary key,v jsonb);
grant select,insert,update on checkout_test_state to authenticated;
insert into checkout_test_state values ('items',(
 select jsonb_agg(jsonb_build_object('menu_item_id',id,'quantity',case name when 'Samosa' then 3 else 2 end))
 from public.menu_items where name in ('Samosa','Veg Sandwich')));

do $$ begin
 assert not has_function_privilege('anon','public.place_online_order(uuid,jsonb,text)','EXECUTE');
 assert not has_table_privilege('authenticated','public.orders','INSERT');
 assert not has_table_privilege('authenticated','canteen_private.order_requests','SELECT');
 assert not has_function_privilege('authenticated','canteen_private.checkout_quote(jsonb)','EXECUTE');
 assert canteen_private.canteen_business_date(timestamptz '2026-11-21 18:29:59+00')=date '2026-11-21';
 assert canteen_private.canteen_business_date(timestamptz '2026-11-21 18:30:00+00')=date '2026-11-22';
end $$;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare items jsonb; quote jsonb; receipt jsonb; bad jsonb;
begin
 select v into items from checkout_test_state where k='items';
 quote:=public.preview_online_order(items);
 assert (quote->>'total_amount')::numeric=90.87,'Decimal arithmetic is not exact';
 insert into checkout_test_state values ('quote',quote);
 receipt:=public.place_online_order('71000000-0000-4000-8000-000000000001',items,quote->>'fingerprint');
 insert into checkout_test_state values ('receipt',receipt);
 assert receipt->>'status'='placed';
 assert (select accepted_at is null and order_type='online' and customer_name='Checkout A'
   from public.orders where id=(receipt->>'order_id')::uuid);
 assert not exists(select 1 from public.orders where id=(receipt->>'order_id')::uuid and status='accepted');
 assert (select count(*) from public.order_items where order_id=(receipt->>'order_id')::uuid)=2;
 assert (select sum(subtotal) from public.order_items where order_id=(receipt->>'order_id')::uuid)=90.87;
 assert (select count(*) from public.order_status_history where order_id=(receipt->>'order_id')::uuid
   and old_status is null and new_status='placed' and changed_by=auth.uid())=1;
 assert public.place_online_order('71000000-0000-4000-8000-000000000001',items,quote->>'fingerprint')=receipt;
 assert public.check_online_order_request('71000000-0000-4000-8000-000000000001')=receipt;
 begin
   perform public.place_online_order('71000000-0000-4000-8000-000000000001',items,repeat('0',64));
   raise exception 'Expected conflict';
 exception when raise_exception then assert sqlerrm='REQUEST_CONFLICT'; end;
 for bad in select value from jsonb_array_elements('[null,{},[],[{"menu_item_id":"bad","quantity":1}]]') loop
   begin perform public.preview_online_order(bad); raise exception 'Expected invalid cart';
   exception when raise_exception then assert sqlerrm='INVALID_CART'; end;
 end loop;
 for bad in select jsonb_set(items,'{0,quantity}',value) from jsonb_array_elements('[0,-1,21,1.5,"1",null]') loop
   begin perform public.preview_online_order(bad); raise exception 'Expected invalid quantity';
   exception when raise_exception then assert sqlerrm in ('INVALID_CART','QUANTITY_LIMIT'); end;
 end loop;
 begin perform public.preview_online_order(items||items); raise exception 'Expected duplicate rejection';
 exception when raise_exception then assert sqlerrm='INVALID_CART'; end;
 begin perform public.preview_online_order(jsonb_set(items,'{0,price}','0')); raise exception 'Expected forged price rejection';
 exception when raise_exception then assert sqlerrm='INVALID_CART'; end;
 begin perform public.preview_online_order('[{"menu_item_id":"79999999-0000-4000-8000-000000000001","quantity":1}]');
   raise exception 'Expected missing item rejection';
 exception when raise_exception then assert sqlerrm='ITEM_UNAVAILABLE'; end;
 begin
   perform public.preview_online_order((select jsonb_agg(jsonb_build_object('menu_item_id',id,'quantity',20))
     from (select id from public.menu_items where is_available limit 3) foods));
   raise exception 'Expected total quantity limit';
 exception when raise_exception then assert sqlerrm='QUANTITY_LIMIT'; end;
 -- Boundary success: exactly 20 on each of two items and 10 on a third.
 bad := (select jsonb_agg(jsonb_build_object('menu_item_id',id,'quantity',case when row_position<3 then 20 else 10 end))
   from (select id,row_number() over(order by id) as row_position from public.menu_items where is_available order by id limit 3) foods);
 assert (select sum((value->>'quantity')::integer) from jsonb_array_elements(public.preview_online_order(bad)->'items'))=50;
 begin
   perform public.preview_online_order((select jsonb_build_array(jsonb_build_object('menu_item_id',id,'quantity',1))
     from public.menu_items where name='Veg Burger'));
   raise exception 'Expected unavailable rejection';
 exception when raise_exception then assert sqlerrm='ITEM_UNAVAILABLE'; end;
 begin
   insert into public.orders(user_id,order_type,customer_name,business_date,total_amount)
     values(auth.uid(),'online','Spoof',current_date,0);
   raise exception 'Direct browser insert succeeded';
 exception when insufficient_privilege then null; end;
 begin perform 1 from canteen_private.order_requests; raise exception 'Private requests exposed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A committed success is replayed before present-day availability/closed checks.
update public.profiles set full_name='' where id='70000000-0000-4000-8000-000000000001';
update public.canteen_settings set is_open=false;
update public.menu_items set is_available=false, price=99 where name='Veg Sandwich';
update public.categories set is_active=false where name='Breakfast';
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare items jsonb; quote jsonb; receipt jsonb;
begin
 select v into items from checkout_test_state where k='items';
 select v into quote from checkout_test_state where k='quote';
 select v into receipt from checkout_test_state where k='receipt';
 assert public.place_online_order('71000000-0000-4000-8000-000000000001',items,quote->>'fingerprint')=receipt;
  assert public.check_online_order_request('71000000-0000-4000-8000-000000000001')=receipt,
    'An existing result must remain recoverable if profile display details change';
  update public.profiles set full_name='Checkout A' where id=auth.uid();
 assert (select unit_price_snapshot from public.order_items where order_id=(receipt->>'order_id')::uuid
   and item_name_snapshot='Veg Sandwich')=45,'Historical price changed';
 begin perform public.place_online_order('71000000-0000-4000-8000-000000000002',items,quote->>'fingerprint');
   raise exception 'Expected closed rejection';
 exception when raise_exception then assert sqlerrm='CANTEEN_CLOSED'; end;
end $$;
reset role;
update public.profiles set full_name='Checkout A' where id='70000000-0000-4000-8000-000000000001';
update public.canteen_settings set is_open=true;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order((select v from checkout_test_state where k='items'));
   raise exception 'Expected archived/unavailable rejection';
 exception when raise_exception then assert sqlerrm='ITEM_UNAVAILABLE'; end;
end $$;
reset role;
update public.menu_items set is_available=true where name='Veg Sandwich';
-- Still archived, even though available.
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order((select v from checkout_test_state where k='items'));
   raise exception 'Expected archived category rejection';
 exception when raise_exception then assert sqlerrm='ITEM_UNAVAILABLE'; end;
end $$;
reset role;
update public.categories set is_active=true where name='Breakfast';
set local role authenticated;
do $$ begin
 begin perform public.place_online_order('71000000-0000-4000-8000-000000000002',
   (select v from checkout_test_state where k='items'),(select v->>'fingerprint' from checkout_test_state where k='quote'));
   raise exception 'Expected explicit price review';
 exception when raise_exception then assert sqlerrm='PRICE_CHANGED'; end;
end $$;
reset role;

-- Force an item insert to fail AFTER the order/token/audit insert.
create function pg_temp.fail_checkout_item() returns trigger language plpgsql as $$
begin raise exception 'TEST_ITEM_FAILURE'; end $$;
create trigger test_checkout_partial_failure before insert on public.order_items
  for each row execute function pg_temp.fail_checkout_item();
insert into checkout_test_state values ('counts',jsonb_build_object(
 'orders',(select count(*) from public.orders),'history',(select count(*) from public.order_status_history),
 'counter',(select coalesce(sum(last_token_number),0) from public.daily_token_counters)));
set local role authenticated;
do $$ declare items jsonb; quote jsonb;
begin
 select v into items from checkout_test_state where k='items';
 quote:=public.preview_online_order(items);
 begin perform public.place_online_order('71000000-0000-4000-8000-000000000003',items,quote->>'fingerprint');
   raise exception 'Expected injected rollback';
 exception when raise_exception then assert sqlerrm='TEST_ITEM_FAILURE'; end;
end $$;
reset role;
drop trigger test_checkout_partial_failure on public.order_items;
do $$ declare counts jsonb;
begin
 select v into counts from checkout_test_state where k='counts';
 assert (select count(*) from public.orders)=(counts->>'orders')::integer;
 assert (select count(*) from public.order_status_history)=(counts->>'history')::integer;
 assert (select coalesce(sum(last_token_number),0) from public.daily_token_counters)=(counts->>'counter')::numeric;
 assert not exists(select 1 from canteen_private.order_requests where request_id in (
   '71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003'));
end $$;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare items jsonb; quote jsonb;
begin
 assert (select count(*) from public.orders)=0,'Another student read the order';
 assert (select count(*) from public.order_items)=0;
 assert (select count(*) from public.order_status_history)=0;
 assert public.check_online_order_request('71000000-0000-4000-8000-000000000001') is null;
 select v into items from checkout_test_state where k='items';
 quote:=public.preview_online_order(items);
 perform public.place_online_order('71000000-0000-4000-8000-000000000001',items,quote->>'fingerprint');
 assert (select count(*) from public.orders)=1,'Request keys must be scoped to the user';
end $$;
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order((select v from checkout_test_state where k='items'));
   raise exception 'Expected staff rejection';
 exception when raise_exception then assert sqlerrm='STUDENT_REQUIRED'; end;
end $$;
reset role;
update public.profiles set role='kitchen' where id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order('[]'); raise exception 'Expected kitchen rejection';
 exception when raise_exception then assert sqlerrm='STUDENT_REQUIRED'; end;
end $$;
reset role;
update public.profiles set role='admin' where id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order('[]'); raise exception 'Expected admin rejection';
 exception when raise_exception then assert sqlerrm='STUDENT_REQUIRED'; end;
end $$;
reset role;
update public.profiles set full_name='' where id='70000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order((select v from checkout_test_state where k='items'));
   raise exception 'Expected missing profile details rejection';
 exception when raise_exception then assert sqlerrm='PROFILE_REQUIRED'; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$ begin
 begin perform public.preview_online_order('[]'); raise exception 'Expected missing identity rejection';
 exception when raise_exception then assert sqlerrm='AUTH_REQUIRED'; end;
end $$;
reset role;
rollback;
