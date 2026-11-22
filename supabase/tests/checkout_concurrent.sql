-- pgbench: actual RPC as an authenticated Student. Local runner only.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
with selection as materialized (
  select jsonb_build_array(jsonb_build_object('menu_item_id',id,'quantity',1)) as items
  from public.menu_items where name='Samosa'
), quote as materialized (
  select items,public.preview_online_order(items) as value from selection
)
select public.place_online_order(
  case when :duplicate_mode=1 then md5('phase7-duplicate-' || (:client_id % 2)::text)::uuid else gen_random_uuid() end,
  items,value->>'fingerprint') from quote;
commit;
