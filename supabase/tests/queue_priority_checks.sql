-- LOCAL FIXTURE TESTS ONLY. Acceptance order deliberately differs from creation order.
begin;

insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('50000000-0000-0000-0000-000000000001', 'walk_in', 'Oldest still Placed', date '2097-01-01', 0);
insert into public.orders (id, user_id, order_type, customer_name, business_date, total_amount)
values ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
  'online', 'Created first, accepted second', date '2097-01-01', 0);
insert into public.orders (id, order_type, customer_name, business_date, total_amount)
values ('50000000-0000-0000-0000-000000000003', 'walk_in', 'Created second, accepted first', date '2097-01-01', 0);

update public.orders set status = 'accepted' where id = '50000000-0000-0000-0000-000000000003';
update public.orders set status = 'accepted' where id = '50000000-0000-0000-0000-000000000002';

do $$
declare
  candidate_ids uuid[];
  preserved_acceptance timestamptz;
begin
  assert (select created_at from public.orders where id = '50000000-0000-0000-0000-000000000002')
    < (select created_at from public.orders where id = '50000000-0000-0000-0000-000000000003'),
    'Fixture must create the online order first';
  assert (select accepted_at from public.orders where id = '50000000-0000-0000-0000-000000000003')
    < (select accepted_at from public.orders where id = '50000000-0000-0000-0000-000000000002'),
    'Fixture must accept the walk-in order first';

  select array_agg(id order by accepted_at asc, queue_sequence asc) into candidate_ids
  from public.orders where status = 'accepted';
  assert candidate_ids = array[
    '50000000-0000-0000-0000-000000000003'::uuid,
    '50000000-0000-0000-0000-000000000002'::uuid
  ], 'Preparation candidates must follow acceptance order and exclude Placed orders';

  -- Project real fixture rows onto a shared acceptance timestamp to exercise ties.
  select array_agg(id order by accepted_at asc, queue_sequence asc) into candidate_ids
  from (
    select id, min(accepted_at) over () as accepted_at, queue_sequence
    from public.orders where status = 'accepted'
  ) tied_candidates;
  assert candidate_ids = array[
    '50000000-0000-0000-0000-000000000002'::uuid,
    '50000000-0000-0000-0000-000000000003'::uuid
  ], 'Equal acceptance timestamps must use the stable queue_sequence tie-breaker';

  select accepted_at into preserved_acceptance from public.orders
  where id = '50000000-0000-0000-0000-000000000003';
  update public.orders set accepted_at = timestamptz '2097-01-01 00:00:00+00'
  where id = '50000000-0000-0000-0000-000000000003';
  assert (select accepted_at from public.orders where id = '50000000-0000-0000-0000-000000000003') = preserved_acceptance,
    'A later update changed the trusted acceptance timestamp';
end;
$$;

update public.orders set status = 'preparing' where id = '50000000-0000-0000-0000-000000000003';
do $$
begin
  assert (select array_agg(id order by accepted_at asc, queue_sequence asc)
    from public.orders where status = 'accepted') = array['50000000-0000-0000-0000-000000000002'::uuid],
    'Preparing orders must leave the waiting preparation candidates';
end;
$$;
update public.orders set status = 'ready' where id = '50000000-0000-0000-0000-000000000003';
do $$
begin
  assert (select array_agg(id order by accepted_at asc, queue_sequence asc)
    from public.orders where status = 'accepted') = array['50000000-0000-0000-0000-000000000002'::uuid],
    'Ready orders must stay outside the waiting preparation candidates';
end;
$$;

rollback;
