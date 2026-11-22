-- Phase 7. Additive migration; apply only after local review and hosted approval.
begin;

create table canteen_private.order_requests (
  user_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  items jsonb not null,
  review_fingerprint text not null,
  order_id uuid not null unique references public.orders(id) on delete restrict
    deferrable initially deferred,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_id)
);
alter table canteen_private.order_requests enable row level security;
revoke all on canteen_private.order_requests from public, anon, authenticated, service_role;

create function canteen_private.checkout_student()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into p from public.profiles where id = auth.uid() for share;
  if not found or p.role <> 'student' then raise exception 'STUDENT_REQUIRED' using errcode = 'P0001'; end if;
  return p;
end;
$$;

create function canteen_private.normalize_checkout_items(p_items jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare entry jsonb; normalized jsonb := '[]'; item_id uuid; qty numeric; total_qty numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_CART' using errcode = 'P0001';
  end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(entry) <> 'object' then raise exception 'INVALID_CART' using errcode = 'P0001'; end if;
    if (select count(*) from jsonb_object_keys(entry)) <> 2
       or jsonb_typeof(entry->'menu_item_id') is distinct from 'string'
       or jsonb_typeof(entry->'quantity') is distinct from 'number' then
      raise exception 'INVALID_CART' using errcode = 'P0001';
    end if;
    begin item_id := (entry->>'menu_item_id')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_CART' using errcode = 'P0001'; end;
    qty := (entry->>'quantity')::numeric;
    if qty <> trunc(qty) or qty not between 1 and 20 then
      raise exception 'QUANTITY_LIMIT' using errcode = 'P0001';
    end if;
    total_qty := total_qty + qty;
    normalized := normalized || jsonb_build_array(jsonb_build_object('menu_item_id', item_id, 'quantity', qty::integer));
  end loop;
  if total_qty > 50 then raise exception 'QUANTITY_LIMIT' using errcode = 'P0001'; end if;
  if (select count(distinct value->>'menu_item_id') from jsonb_array_elements(normalized)) <> jsonb_array_length(normalized) then
    raise exception 'INVALID_CART' using errcode = 'P0001';
  end if;
  return (select jsonb_agg(value order by value->>'menu_item_id') from jsonb_array_elements(normalized));
end;
$$;

create function canteen_private.checkout_quote(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare opened boolean; lines jsonb; amount numeric; line_count integer;
begin
  select is_open into opened from public.canteen_settings where id = 1 for share;
  if opened is distinct from true then raise exception 'CANTEEN_CLOSED' using errcode = 'P0001'; end if;
  -- Lock menu rows before categories, with UUID ordering in each group.
  -- Shared locks block price/availability/category edits until this transaction ends.
  perform m.id from public.menu_items m
    join jsonb_to_recordset(p_items) as wanted(menu_item_id uuid, quantity integer) on wanted.menu_item_id = m.id
    order by m.id for share of m;
  perform c.id from public.categories c where c.id in (
    select m.category_id from public.menu_items m
    join jsonb_to_recordset(p_items) as wanted(menu_item_id uuid, quantity integer) on wanted.menu_item_id = m.id
  ) order by c.id for share of c;

  select jsonb_agg(jsonb_build_object(
      'menu_item_id', m.id, 'name', m.name, 'unit_price', m.price,
      'quantity', wanted.quantity, 'subtotal', m.price * wanted.quantity
    ) order by m.id), sum(m.price * wanted.quantity), count(*)
    into lines, amount, line_count
  from jsonb_to_recordset(p_items) as wanted(menu_item_id uuid, quantity integer)
  join public.menu_items m on m.id = wanted.menu_item_id
  join public.categories c on c.id = m.category_id
  where m.is_available and c.is_active;
  if line_count <> jsonb_array_length(p_items) then raise exception 'ITEM_UNAVAILABLE' using errcode = 'P0001'; end if;
  if amount is null or amount < 0 or amount > 999999999999.99 then
    raise exception 'INVALID_TOTAL' using errcode = 'P0001';
  end if;
  return jsonb_build_object('items', lines, 'total_amount', amount,
    'fingerprint', encode(sha256(convert_to(lines::text, 'UTF8')), 'hex'));
end;
$$;

create function canteen_private.checkout_receipt(p_order_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('order_id', o.id, 'token', o.token, 'status', o.status,
    'total_amount', o.total_amount, 'items', (
      select jsonb_agg(jsonb_build_object('menu_item_id', i.menu_item_id, 'quantity', i.quantity) order by i.menu_item_id)
      from public.order_items i where i.order_id = o.id
    ))
  from public.orders o where o.id = p_order_id and o.user_id = p_user_id and o.order_type = 'online';
$$;

create function canteen_private.canteen_business_date(p_time timestamptz)
returns date language sql immutable set search_path = '' as $$
  select (p_time at time zone 'Asia/Kolkata')::date;
$$;

create function public.preview_online_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.profiles;
begin
  student := canteen_private.checkout_student();
  if nullif(btrim(student.full_name), '') is null or nullif(btrim(student.email), '') is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0001';
  end if;
  return canteen_private.checkout_quote(canteen_private.normalize_checkout_items(p_items));
end;
$$;

create function public.place_online_order(p_request_id uuid, p_items jsonb, p_review_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.profiles; normalized jsonb; request canteen_private.order_requests;
  quote jsonb; receipt jsonb;
begin
  student := canteen_private.checkout_student();
  normalized := canteen_private.normalize_checkout_items(p_items);
  if p_request_id is null or p_review_fingerprint is null or p_review_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;

  -- Reserve before token allocation. A concurrent duplicate waits for the first
  -- transaction; a failed transaction rolls this reservation back as well.
  insert into canteen_private.order_requests(user_id, request_id, items, review_fingerprint, order_id)
    values (student.id, p_request_id, normalized, p_review_fingerprint, gen_random_uuid())
    on conflict (user_id, request_id) do nothing;
  select * into request from canteen_private.order_requests
    where user_id = student.id and request_id = p_request_id for update;
  if request.items <> normalized or request.review_fingerprint <> p_review_fingerprint then
    raise exception 'REQUEST_CONFLICT' using errcode = 'P0001';
  end if;
  receipt := canteen_private.checkout_receipt(request.order_id, student.id);
  -- Replay precedes current canteen/menu checks: an existing order stays successful.
  if receipt is not null then return receipt; end if;

  if nullif(btrim(student.full_name), '') is null or nullif(btrim(student.email), '') is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  quote := canteen_private.checkout_quote(normalized);
  if quote->>'fingerprint' <> p_review_fingerprint then raise exception 'PRICE_CHANGED' using errcode = 'P0001'; end if;
  insert into public.orders(id, user_id, order_type, customer_name, business_date, total_amount, status)
    values (request.order_id, student.id, 'online', btrim(student.full_name),
      canteen_private.canteen_business_date(clock_timestamp()), (quote->>'total_amount')::numeric, 'placed');
  -- The existing triggers allocate the token and record exactly one initial history entry.
  insert into public.order_items(order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity)
    select request.order_id, line.menu_item_id, line.name, line.unit_price, line.quantity
    from jsonb_to_recordset(quote->'items') as line(menu_item_id uuid, name text, unit_price numeric, quantity integer);
  if (select count(*) from public.order_items where order_id = request.order_id) <> jsonb_array_length(normalized)
     or (select sum(subtotal) from public.order_items where order_id = request.order_id) is distinct from (quote->>'total_amount')::numeric then
    raise exception 'INVALID_TOTAL' using errcode = 'P0001';
  end if;
  return canteen_private.checkout_receipt(request.order_id, student.id);
end;
$$;

create function public.check_online_order_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.profiles; order_id uuid;
begin
  student := canteen_private.checkout_student();
  select r.order_id into order_id from canteen_private.order_requests r
    where r.user_id = student.id and r.request_id = p_request_id;
  -- NULL is not proof that an overlapping uncommitted request failed. Retry must use the same key.
  return canteen_private.checkout_receipt(order_id, student.id);
end;
$$;

revoke all on function canteen_private.checkout_student(),
  canteen_private.normalize_checkout_items(jsonb), canteen_private.checkout_quote(jsonb),
  canteen_private.checkout_receipt(uuid, uuid), canteen_private.canteen_business_date(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.preview_online_order(jsonb), public.place_online_order(uuid, jsonb, text),
  public.check_online_order_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.preview_online_order(jsonb), public.place_online_order(uuid, jsonb, text),
  public.check_online_order_request(uuid) to authenticated;

commit;
