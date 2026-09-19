begin;

-- The previous UPDATE reused PL/pgSQL record names as SQL aliases (v/r),
-- making v.stock and r.required ambiguous. Distinct names remove the conflict.
-- Return type changes from void to jsonb, so replace the signature atomically.
drop function public.confirm_catalog_order(bigint);
create function public.confirm_catalog_order(p_order_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict error
declare
 order_record public.orders;
 demand_record record;
 variant_record public.product_variants;
 expected_variants integer:=0;
 updated_variants integer;
begin
 if auth.uid() is null or not public.is_catalog_admin() then
  raise exception 'Administrador requerido' using errcode='42501';
 end if;
 select ord.* into order_record from public.orders as ord where ord.id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado' using errcode='22023'; end if;
 if order_record.status<>'pending' then
  raise exception 'Solo se puede confirmar un pedido pendiente' using errcode='22023';
 end if;
 if not exists(select 1 from public.order_items as item where item.order_id=order_record.id) then
  raise exception 'Pedido sin artículos' using errcode='22023';
 end if;

 -- Lock each distinct variant once, in ID order, including package components.
 for demand_record in
  select item.variant_id,sum(item.quantity)::bigint as required,
   min(item.product_id) as product_id,min(item.product_name_snapshot) as name,
   min(item.size_snapshot) as size,count(distinct item.product_id) as products
  from public.order_items as item where item.order_id=order_record.id
  group by item.variant_id order by item.variant_id
 loop
  select variant.* into variant_record from public.product_variants as variant
   where variant.id=demand_record.variant_id for update;
  if not found or demand_record.products<>1 or variant_record.product_id<>demand_record.product_id then
   raise exception 'La variante de % — talla % ya no existe',demand_record.name,demand_record.size using errcode='22023';
  end if;
  if variant_record.stock is null or variant_record.stock<demand_record.required then
   raise exception 'No hay stock suficiente de % — talla %',demand_record.name,demand_record.size using errcode='22023';
  end if;
  expected_variants:=expected_variants+1;
 end loop;

 update public.product_variants as target_variant
 set stock=target_variant.stock-demand.required::integer
 from (select item.variant_id,sum(item.quantity) as required
       from public.order_items as item where item.order_id=order_record.id
       group by item.variant_id) as demand
 where target_variant.id=demand.variant_id;
 get diagnostics updated_variants = row_count;
 if updated_variants<>expected_variants then
  raise exception 'No se pudieron actualizar todas las variantes. El pedido sigue pendiente.' using errcode='22023';
 end if;

 update public.orders as ord
 set status='confirmed',confirmed_at=now(),confirmed_by=auth.uid()
 where ord.id=order_record.id and ord.status='pending'
 returning ord.* into order_record;
 if not found then raise exception 'No se pudo confirmar el pedido' using errcode='22023'; end if;
 return jsonb_build_object('order_id',order_record.id,'public_code',order_record.public_code,'status',order_record.status);
end; $$;
revoke all on function public.confirm_catalog_order(bigint) from PUBLIC,anon,authenticated;
grant execute on function public.confirm_catalog_order(bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
