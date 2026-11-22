-- LOCAL ISOLATED CLUSTER ONLY. No production permission changes.
begin;

create temp table checkout_function_matrix (
  signature text primary key,
  authenticated_execute boolean not null,
  definer boolean not null,
  denied_call text
);
-- Cover every Phase 7 RPC/helper AND all private Phase 4 dependencies.
-- current_app_role is the intentional authenticated-only exception used by RLS.
insert into checkout_function_matrix values
 ('public.preview_online_order(jsonb)',true,true,$call$select public.preview_online_order('[]'::jsonb)$call$),
 ('public.place_online_order(uuid,jsonb,text)',true,true,$call$select public.place_online_order('76000000-0000-4000-8000-000000000001','[]'::jsonb,repeat('0',64))$call$),
 ('public.check_online_order_request(uuid)',true,true,$call$select public.check_online_order_request('76000000-0000-4000-8000-000000000001')$call$),
 ('canteen_private.checkout_student()',false,true,'select canteen_private.checkout_student()'),
 ('canteen_private.normalize_checkout_items(jsonb)',false,false,$call$select canteen_private.normalize_checkout_items('[]'::jsonb)$call$),
 ('canteen_private.checkout_quote(jsonb)',false,true,$call$select canteen_private.checkout_quote('[]'::jsonb)$call$),
 ('canteen_private.checkout_receipt(uuid,uuid)',false,true,'select canteen_private.checkout_receipt(null::uuid,null::uuid)'),
 ('canteen_private.canteen_business_date(timestamp with time zone)',false,false,$call$select canteen_private.canteen_business_date(timestamptz '2026-11-22 00:00:00+00')$call$),
 ('canteen_private.current_app_role()',true,true,'select canteen_private.current_app_role()'),
 ('canteen_private.allocate_daily_token(date)',false,true,$call$select canteen_private.allocate_daily_token(date '2096-01-01')$call$),
 ('canteen_private.set_updated_at()',false,false,null),
 ('canteen_private.sync_auth_profile()',false,true,null),
 ('canteen_private.initialize_order()',false,true,null),
 ('canteen_private.guard_order_update()',false,false,null),
 ('canteen_private.record_order_status()',false,true,null);
grant select on checkout_function_matrix to anon,authenticated,service_role;

do $$
declare target record; actor text; allowed boolean; permission text; col record;
begin
  assert (select count(*) from checkout_function_matrix)=15;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='canteen_private')=12,'A private helper is missing from the matrix';
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='canteen_private' and not exists(
      select 1 from checkout_function_matrix m where to_regprocedure(m.signature)=p.oid));
  for target in select * from checkout_function_matrix loop
    assert to_regprocedure(target.signature) is not null, 'Missing function: '||target.signature;
    assert (select p.prosecdef=target.definer and coalesce(p.proconfig @> array['search_path=""'],false)
      and pg_get_userbyid(p.proowner) not in ('anon','authenticated','service_role')
      from pg_proc p where p.oid=to_regprocedure(target.signature)),
      'Unexpected owner, security mode or search_path: '||target.signature;
    assert not exists(select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=to_regprocedure(target.signature) and acl.grantee=0 and acl.privilege_type='EXECUTE'),
      'PUBLIC execution remains: '||target.signature;
    foreach actor in array array['anon','authenticated','service_role'] loop
      allowed:=actor='authenticated' and target.authenticated_execute;
      assert has_function_privilege(actor,to_regprocedure(target.signature),'EXECUTE')=allowed,
        'Wrong effective EXECUTE privilege: '||actor||' / '||target.signature;
    end loop;
  end loop;
  assert (select relrowsecurity from pg_class where oid='canteen_private.order_requests'::regclass);
  assert not exists(select 1 from pg_policy where polrelid='canteen_private.order_requests'::regclass),
    'Private request table unexpectedly has a client policy';
  foreach actor in array array['anon','authenticated','service_role'] loop
    foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      assert not has_table_privilege(actor,'canteen_private.order_requests',permission),
        'Private table privilege: '||actor||' / '||permission;
    end loop;
    for col in select attname from pg_attribute where attrelid='canteen_private.order_requests'::regclass
      and attnum>0 and not attisdropped loop
      foreach permission in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        assert not has_column_privilege(actor,'canteen_private.order_requests',col.attname,permission),
          'Private column privilege: '||actor||' / '||col.attname||' / '||permission;
      end loop;
    end loop;
  end loop;
end $$;

-- Permission failures must actually be 42501, not a business-validation failure.
-- Trigger-only helpers are checked by effective ACL above; direct SQL invocation
-- is not a valid call context even for their owner.
create function pg_temp.probe_denied_checkout_calls() returns void language plpgsql as $$
declare target record; statement text;
begin
  for target in select * from checkout_function_matrix
    where denied_call is not null and not (current_user='authenticated' and authenticated_execute) loop
    begin
      execute target.denied_call;
      raise exception 'Forbidden function call succeeded: % / %',current_user,target.signature;
    exception when insufficient_privilege then null; end;
  end loop;
  foreach statement in array array[
    'select * from canteen_private.order_requests limit 0',
    $probe$insert into canteen_private.order_requests(user_id,request_id,items,review_fingerprint,order_id)
      select '00000000-0000-0000-0000-000000000001'::uuid,gen_random_uuid(),'[]'::jsonb,repeat('0',64),gen_random_uuid() where false$probe$,
    'update canteen_private.order_requests set items=items where false',
    'delete from canteen_private.order_requests where false'
  ] loop
    begin execute statement; raise exception 'Forbidden private-table access succeeded: %',current_user;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
-- Fixture-only invoker function runs as the tested role, never as the owner.
grant execute on function pg_temp.probe_denied_checkout_calls() to anon,authenticated,service_role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role anon;
select pg_temp.probe_denied_checkout_calls();
reset role;
set local role service_role;
select pg_temp.probe_denied_checkout_calls();
reset role;
set local role authenticated;
select pg_temp.probe_denied_checkout_calls();
do $$ begin
  assert canteen_private.current_app_role()='student';
  begin perform public.preview_online_order('[]'); raise exception 'Expected INVALID_CART';
  exception when raise_exception then assert sqlerrm='INVALID_CART'; end;
  begin perform public.place_online_order('76000000-0000-4000-8000-000000000001','[]',repeat('0',64));
    raise exception 'Expected INVALID_CART';
  exception when raise_exception then assert sqlerrm='INVALID_CART'; end;
  assert public.check_online_order_request('76000000-0000-4000-8000-000000000001') is null;
end $$;
reset role;
do $$ begin
  assert not exists(select 1 from canteen_private.order_requests where request_id='76000000-0000-4000-8000-000000000001');
end $$;
rollback;
