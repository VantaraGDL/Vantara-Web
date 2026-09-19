begin;

alter table public.orders add column idempotency_key text
 check(idempotency_key is null or (
  length(idempotency_key) between 32 and 200
  and idempotency_key ~ '^[A-Za-z0-9_-]+$'
 ));
create unique index orders_idempotency_key_unique on public.orders(idempotency_key)
 where idempotency_key is not null;
comment on column public.orders.idempotency_key is 'Random per-attempt retry key; never use a folio or customer identifier. NULL preserves legacy creation behavior.';

-- Preserve the already-deployed validation and pricing implementation verbatim.
-- Rename instead of leaving an ambiguous overloaded public RPC with defaults.
alter function public.create_catalog_order(text,jsonb,text,text)
 rename to _create_catalog_order_internal;
revoke all on function public._create_catalog_order_internal(text,jsonb,text,text) from PUBLIC,anon,authenticated;

create function public.create_catalog_order(
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
  -- Serialize requests BEFORE validation/creation. A retry waits for the first
  -- transaction, then reads its committed order. Rollback releases the lock too.
  -- Hash collisions only serialize unrelated requests; equality uses the full key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vantara-order:'||p_idempotency_key,0));
  select ord.* into existing_order from public.orders as ord
   where ord.idempotency_key=p_idempotency_key;
  if found then
   -- No catalog reads or price recalculation on retries, even after cancellation
   -- or confirmation. Return historical snapshots, not customer contact details.
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

 created_response:=public._create_catalog_order_internal(p_source,p_items,p_customer_name,p_customer_phone);
 if p_idempotency_key is not null then
  update public.orders as ord set idempotency_key=p_idempotency_key
   where ord.id=(created_response->>'id')::bigint;
  if not found then raise exception 'No se pudo asociar la clave al pedido' using errcode='22023'; end if;
 end if;
 -- The order, items and key all commit together. The unique index is the final
 -- database safeguard, independent of client-side buttons or retries.
 return created_response||jsonb_build_object('order_id',created_response->'id','reused',false);
end; $$;
revoke all on function public.create_catalog_order(text,jsonb,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_order(text,jsonb,text,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
