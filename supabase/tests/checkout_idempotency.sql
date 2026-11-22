-- LOCAL ISOLATED CLUSTER ONLY. Exact snapshots prove retries leave no extra writes.
begin;
insert into auth.users(id,email,raw_user_meta_data)
  values('74000000-0000-4000-8000-000000000001','idempotency@example.test','{"full_name":"Idempotency Student"}');
update public.canteen_settings set is_open=true;
create temp table checkout_retry_state(k text primary key,v jsonb);
grant select,insert on checkout_retry_state to authenticated;
select set_config('request.jwt.claim.sub','74000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare items jsonb; quote jsonb; receipt jsonb;
begin
  select jsonb_agg(jsonb_build_object('menu_item_id',id,'quantity',1) order by name) into items
    from public.menu_items where name in ('Samosa','Cold Coffee');
  assert jsonb_array_length(items)=2;
  quote:=public.preview_online_order(items);
  receipt:=public.place_online_order('75000000-0000-4000-8000-000000000001',items,quote->>'fingerprint');
  insert into checkout_retry_state values('items',items),('quote',quote),('receipt',receipt);
end $$;
reset role;
create function pg_temp.checkout_persisted_snapshot() returns jsonb language sql as $$
  select jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(o) order by id) from public.orders o),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.order_items i),
    'history',(select jsonb_agg(to_jsonb(h) order by id) from public.order_status_history h),
    'requests',(select jsonb_agg(to_jsonb(r) order by user_id,request_id) from canteen_private.order_requests r),
    'counters',(select jsonb_agg(to_jsonb(c) order by business_date) from public.daily_token_counters c));
$$;
insert into checkout_retry_state values('snapshot',pg_temp.checkout_persisted_snapshot());
set local role authenticated;
do $$
declare items jsonb; quote jsonb; original jsonb; changed jsonb; replacement uuid; reversed jsonb;
begin
  select v into items from checkout_retry_state where k='items';
  select v into quote from checkout_retry_state where k='quote';
  select v into original from checkout_retry_state where k='receipt';
  assert public.place_online_order('75000000-0000-4000-8000-000000000001',items,quote->>'fingerprint')=original,
    'Identical retry did not return the original order';
  select jsonb_agg(value order by ordinality desc) into reversed from jsonb_array_elements(items) with ordinality;
  assert public.place_online_order('75000000-0000-4000-8000-000000000001',reversed,quote->>'fingerprint')=original,
    'Equivalent canonical request was incorrectly rejected';
  select id into replacement from public.menu_items where name='Veg Sandwich';
  -- Keep the original fingerprint to isolate changed canonical contents, then
  -- repeat with each changed request's valid NEW server fingerprint.
  for changed in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(items,'{0,quantity}','2'),
    jsonb_set(items,'{0,menu_item_id}',to_jsonb(replacement)),
    items - 0,
    items || jsonb_build_array(jsonb_build_object('menu_item_id',replacement,'quantity',1))
  )) loop
    begin
      perform public.place_online_order('75000000-0000-4000-8000-000000000001',changed,quote->>'fingerprint');
      raise exception 'Changed request was accepted';
    exception when raise_exception then assert sqlerrm='REQUEST_CONFLICT'; end;
    begin
      perform public.place_online_order('75000000-0000-4000-8000-000000000001',changed,
        public.preview_online_order(changed)->>'fingerprint');
      raise exception 'Changed request with valid new quote was accepted';
    exception when raise_exception then assert sqlerrm='REQUEST_CONFLICT'; end;
  end loop;
  begin
    perform public.place_online_order('75000000-0000-4000-8000-000000000001',items,repeat('0',64));
    raise exception 'Changed fingerprint was accepted';
  exception when raise_exception then assert sqlerrm='REQUEST_CONFLICT'; end;
  assert public.check_online_order_request('75000000-0000-4000-8000-000000000001')=original;
  assert public.place_online_order('75000000-0000-4000-8000-000000000001',items,quote->>'fingerprint')=original,
    'Rejected changes damaged the original request';
end $$;
reset role;
do $$ declare receipt jsonb;
begin
  assert pg_temp.checkout_persisted_snapshot()=(select v from checkout_retry_state where k='snapshot'),
    'A retry changed an order, item snapshot, token counter, private request or history entry';
  select v into receipt from checkout_retry_state where k='receipt';
  assert (select count(*) from public.orders where user_id='74000000-0000-4000-8000-000000000001')=1;
  assert (select count(*) from canteen_private.order_requests where user_id='74000000-0000-4000-8000-000000000001')=1;
  assert (select count(*) from public.order_items where order_id=(receipt->>'order_id')::uuid)=2;
  assert (select count(*) from public.order_status_history where order_id=(receipt->>'order_id')::uuid)=1;
  assert (select token from public.orders where id=(receipt->>'order_id')::uuid)=receipt->>'token';
end $$;
rollback;
