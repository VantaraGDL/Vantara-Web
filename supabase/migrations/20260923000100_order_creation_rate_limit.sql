begin;

-- Private operational data, never exposed as orders or through the Data API.
create schema order_security;
revoke all on schema order_security from PUBLIC,anon,authenticated,service_role;
create table order_security.secret (
 singleton boolean primary key default true check(singleton),
 hmac_key bytea not null check(octet_length(hmac_key)=32)
);
insert into order_security.secret(singleton,hmac_key)
 values(true,extensions.gen_random_bytes(32));
create table order_security.creation_slots (
 client_key bytea not null check(octet_length(client_key)=32),
 created_at timestamptz not null
);
create index creation_slots_time on order_security.creation_slots(created_at);
create index creation_slots_client_time on order_security.creation_slots(client_key,created_at);
alter table order_security.secret enable row level security;
alter table order_security.creation_slots enable row level security;
revoke all on order_security.secret,order_security.creation_slots from PUBLIC,anon,authenticated,service_role;

create function order_security.consume_creation_slot() returns void
language plpgsql security definer set search_path='' as $$
declare
 -- One source for the policy: committed NEW orders, not reused responses.
 client_short_limit constant integer:=6;
 client_hour_limit constant integer:=20;
 global_short_limit constant integer:=60;
 global_hour_limit constant integer:=300;
 headers jsonb;
 address inet;
 identity_text text:='unknown-network';
 client_hash bytea;
 at_time timestamptz;
 retry_at timestamptz;
 usage_row record;
begin
 -- Hosted Data API request context, never an RPC parameter or customer field.
 -- Forwarded headers are not a unique human identity. The global limit below
 -- remains authoritative even if an IP changes or a forwarded value is forged.
 begin
  headers:=nullif(current_setting('request.headers',true),'')::jsonb;
  address:=nullif(btrim(split_part(headers->>'x-forwarded-for',',',1)),'')::inet;
  if address is not null then
   identity_text:=case when family(address)=6 then network(set_masklen(address,64))::text else host(address) end;
  end if;
 exception when invalid_text_representation then
  identity_text:='unknown-network';
 end;
 select extensions.hmac(convert_to(identity_text,'UTF8'),s.hmac_key,'sha256')
  into strict client_hash from order_security.secret s where s.singleton;

 -- Serialize counting/insertion through commit: concurrent requests cannot all
 -- pass the same remaining slot. No per-client unbounded lock/key allocation.
 perform pg_catalog.pg_advisory_xact_lock(723091,1);
 at_time:=clock_timestamp();
 delete from order_security.creation_slots where created_at<=at_time-interval '1 hour';
 select
  count(*) filter(where created_at>at_time-interval '10 minutes') as global_short,
  count(*) as global_hour,
  count(*) filter(where client_key=client_hash and created_at>at_time-interval '10 minutes') as client_short,
  count(*) filter(where client_key=client_hash) as client_hour,
  min(created_at) filter(where created_at>at_time-interval '10 minutes') as global_short_first,
  min(created_at) as global_hour_first,
  min(created_at) filter(where client_key=client_hash and created_at>at_time-interval '10 minutes') as client_short_first,
  min(created_at) filter(where client_key=client_hash) as client_hour_first
 into usage_row from order_security.creation_slots;
 retry_at:=greatest(
  case when usage_row.global_short>=global_short_limit then usage_row.global_short_first+interval '10 minutes' end,
  case when usage_row.global_hour>=global_hour_limit then usage_row.global_hour_first+interval '1 hour' end,
  case when usage_row.client_short>=client_short_limit then usage_row.client_short_first+interval '10 minutes' end,
  case when usage_row.client_hour>=client_hour_limit then usage_row.client_hour_first+interval '1 hour' end
 );
 if retry_at is not null then
  raise sqlstate 'PGRST' using
   message=jsonb_build_object('code','ORDER_RATE_LIMIT','message','Hay demasiados intentos en este momento. Espera un momento e inténtalo de nuevo.')::text,
   detail=jsonb_build_object('status',429,'headers',jsonb_build_object('Retry-After',greatest(1,ceil(extract(epoch from retry_at-at_time))::integer)::text))::text;
 end if;
 insert into order_security.creation_slots(client_key,created_at) values(client_hash,at_time);
 -- A later validation error rolls back the slot. Failed/invalid requests do not
 -- create orders and this is not a general HTTP/DDoS request limiter.
end; $$;
revoke all on function order_security.consume_creation_slot() from PUBLIC,anon,authenticated,service_role;

-- TTL cleanup also runs when there are no subsequent customer requests.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('vantara-expire-order-rate-slots','*/5 * * * *',
 $$delete from order_security.creation_slots where created_at<=clock_timestamp()-interval '1 hour'$$);

-- The public RPC remains the only public creation entry. Keep its contract,
-- original validation helper, idempotency response and privileges unchanged.
create or replace function public.create_catalog_order(
 p_source text,
 p_items jsonb,
 p_customer_name text default null,
 p_customer_phone text default null,
 p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict error
declare
 existing_order public.orders;
 created_response jsonb;
 snapshot_items jsonb;
begin
 if p_idempotency_key is not null then
  if length(p_idempotency_key) not between 32 and 200
   or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then
   raise exception 'Clave de idempotencia inválida: usa 32–200 caracteres alfanuméricos, guion o guion bajo.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vantara-order:'||p_idempotency_key,0));
  select ord.* into existing_order from public.orders as ord
   where ord.idempotency_key=p_idempotency_key;
  if found then
   select coalesce(jsonb_agg(
    to_jsonb(item)-'id'-'order_id'-'position'-'created_at' order by item.position
   ),'[]'::jsonb) into snapshot_items
   from public.order_items as item where item.order_id=existing_order.id;
   return jsonb_build_object(
    'id',existing_order.id,'order_id',existing_order.id,
    'public_code',existing_order.public_code,'status',existing_order.status,
    'subtotal',existing_order.subtotal,'discount_total',existing_order.discount_total,
    'total',existing_order.total,'collection_discount_total',existing_order.collection_discount_total,
    'items',snapshot_items,'reused',true
   );
  end if;
 end if;

 perform order_security.consume_creation_slot();
 created_response:=public._create_catalog_order_internal(p_source,p_items,p_customer_name,p_customer_phone);
 if p_idempotency_key is not null then
  update public.orders as ord set idempotency_key=p_idempotency_key
   where ord.id=(created_response->>'id')::bigint;
  if not found then raise exception 'No se pudo asociar la clave al pedido' using errcode='22023'; end if;
 end if;
 return created_response||jsonb_build_object('order_id',created_response->'id','reused',false);
end; $$;
revoke all on function public.create_catalog_order(text,jsonb,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_order(text,jsonb,text,text,text) to anon,authenticated;
-- No direct public path around the limiter.
revoke all on function public._create_catalog_order_internal(text,jsonb,text,text) from PUBLIC,anon,authenticated;
notify pgrst,'reload schema';
commit;
