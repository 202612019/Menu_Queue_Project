-- READ-ONLY REPORT, prepared for a separately authorized hosted preflight.
-- This file does NOT apply migrations or call any checkout/token RPC.
-- Compare every result with hosted-preflight.md and the original Phase 4 SQL.
-- Successful execution alone does NOT mean that every prerequisite matched.
begin transaction read only;

select current_database() as database_name,current_user as inspection_role,
  current_setting('server_version') as postgres_version,
  to_regprocedure('pg_catalog.sha256(bytea)') is not null as has_sha256,
  to_regprocedure('pg_catalog.gen_random_uuid()') is not null as has_uuid_generator;

with expected(name) as (values ('profiles'),('categories'),('menu_items'),('orders'),
  ('order_items'),('order_status_history'),('daily_token_counters'),('canteen_settings'))
select e.name,c.oid is not null as present,c.relkind,c.relrowsecurity as rls_enabled,
  pg_get_userbyid(c.relowner) as owner
from expected e left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.name
order by e.name;

select c.relname as table_name,a.attname as column_name,
  format_type(a.atttypid,a.atttypmod) as column_type,a.attnotnull as not_null,
  a.attidentity as identity_kind,a.attgenerated as generated_kind,
  pg_get_expr(d.adbin,d.adrelid) as default_or_generation
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in ('profiles','categories','menu_items','orders',
  'order_items','order_status_history','daily_token_counters','canteen_settings')
order by c.relname,a.attnum;

select c.relname as table_name,k.conname,k.contype,k.condeferrable,k.condeferred,
  k.convalidated,pg_get_constraintdef(k.oid,true) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','categories','menu_items','orders',
  'order_items','order_status_history','daily_token_counters','canteen_settings')
order by c.relname,k.conname;

select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('profiles','categories','menu_items','orders','order_items',
    'order_status_history','daily_token_counters','canteen_settings')
order by tablename,indexname;

select n.nspname as table_schema,c.relname as table_name,t.tgname,t.tgenabled,
  pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and ((n.nspname='public' and c.relname in (
  'profiles','categories','menu_items','orders','order_items','order_status_history',
  'daily_token_counters','canteen_settings'))
  or (n.nspname='auth' and c.relname='users' and t.tgname='canteen_auth_profile_sync'))
order by n.nspname,c.relname,t.tgname;

select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
  p.proconfig,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='canteen_private' or (n.nspname='auth' and p.proname='uid')
order by n.nspname,p.proname,arguments;

select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','categories','menu_items','orders',
  'order_items','order_status_history','daily_token_counters','canteen_settings')
order by tablename,policyname;

with actors(name) as (values ('anon'),('authenticated'),('service_role')),
objects(name) as (values ('profiles'),('categories'),('menu_items'),('orders'),('order_items'),
  ('order_status_history'),('daily_token_counters'),('canteen_settings'))
select a.name as actor,o.name as table_name,
  has_table_privilege(a.name,format('public.%I',o.name),'SELECT') as can_select,
  has_table_privilege(a.name,format('public.%I',o.name),'INSERT') as can_insert,
  has_table_privilege(a.name,format('public.%I',o.name),'UPDATE') as can_update,
  has_table_privilege(a.name,format('public.%I',o.name),'DELETE') as can_delete,
  has_table_privilege(a.name,format('public.%I',o.name),'TRUNCATE') as can_truncate
from actors a cross join objects o order by a.name,o.name;

select has_column_privilege('authenticated','public.profiles','full_name','UPDATE') as can_edit_own_name_subject_to_rls,
  has_column_privilege('authenticated','public.profiles','email','UPDATE') as can_edit_email,
  has_column_privilege('authenticated','public.profiles','role','UPDATE') as can_edit_role;
select r.rolname,has_sequence_privilege(r.rolname,'public.orders_queue_sequence_seq','USAGE') as sequence_usage
from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by r.rolname;

select r.rolname,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege(r.rolname,p.oid,'EXECUTE') as can_execute
from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
where r.rolname in ('anon','authenticated','service_role') and n.nspname='canteen_private'
order by n.nspname,p.proname,arguments,r.rolname;

-- All target names must be absent before the NEW migration is applied once.
select to_regclass('canteen_private.order_requests') is null as new_request_relation_absent;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('preview_online_order','place_online_order','check_online_order_request'))
   or (n.nspname='canteen_private' and p.proname in ('checkout_student','normalize_checkout_items',
     'checkout_quote','checkout_receipt','canteen_business_date'))
order by n.nspname,p.proname;

select r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls from pg_roles r
where r.rolname in ('anon','authenticated','service_role') order by r.rolname;
select member_role.rolname as member,granted_role.rolname as granted_role
from pg_auth_members m join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where member_role.rolname in ('anon','authenticated','service_role') order by member,granted_role;
select pg_get_userbyid(d.defaclrole) as creator,coalesce(n.nspname,'(global)') as object_schema,
  d.defaclobjtype,d.defaclacl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
order by creator,object_schema,d.defaclobjtype;
-- This setting can be NULL when configured outside PostgreSQL. Check the
-- dashboard's exposed schemas separately; NULL is not proof of non-exposure.
select current_setting('pgrst.db_schemas',true) as database_configured_exposed_schemas,
  current_setting('statement_timeout') as current_inspection_statement_timeout,
  current_setting('lock_timeout') as current_inspection_lock_timeout;

-- Aggregate baselines only: no student names/emails or order contents.
select (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as order_items,
  (select count(*) from public.order_status_history) as history_entries;
select count(*) as counters_behind_recorded_orders
from (select business_date,max(token_number) as max_token from public.orders group by business_date) o
left join public.daily_token_counters c using(business_date)
where c.business_date is null or c.last_token_number<o.max_token;

commit;
