-- LOCAL TEST CLUSTER ONLY. Never run this file in Supabase or an existing database.
-- Supabase already provides these roles, auth.users, and auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
revoke all on function auth.uid() from public;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- An existing Auth account verifies safe migration backfill and metadata handling.
insert into auth.users (id, email, raw_user_meta_data) values (
  '00000000-0000-0000-0000-000000000001', 'existing@example.test',
  '{"full_name":"Existing Student","role":"admin"}'
);
