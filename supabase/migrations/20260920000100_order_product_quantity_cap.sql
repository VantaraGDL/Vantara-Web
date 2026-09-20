begin;

-- Keep the idempotency wrapper and variant-level stock checks unchanged.
create or replace function public._create_catalog_order_internal(p_source text,p_items jsonb,p_customer_name text default null,p_customer_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 line jsonb; component jsonb; components jsonb; rows jsonb:='[]'; package_rows jsonb;
 p public.products; v public.product_variants; pack public.packages; c public.collections;
 q integer; n integer:=0; group_no integer:=0; package_count integer; ids bigint[];
 brand text; original numeric:=0; effective numeric:=0; normal_effective numeric:=0;
 pack_original numeric; pack_final numeric; cumulative numeric; allocated numeric; allocation numeric;
 price numeric; percentage integer; collection_discount numeric:=0; collection_rows jsonb:='[]';
 r record; new_order public.orders; seen text[]:='{}'; signature text;
begin
 if p_source is null or p_source not in ('product','package','cart') then raise exception 'Origen de pedido inválido' using errcode='22023'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Artículos inválidos' using errcode='22023'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'El pedido debe contener entre 1 y 100 líneas' using errcode='22023'; end if;
 if length(p_customer_name)>160 or length(p_customer_phone)>40 then raise exception 'Datos de contacto demasiado largos' using errcode='22023'; end if;
 if p_source='package' and (jsonb_array_length(p_items)<>1 or p_items->0->>'type' is distinct from 'package') then raise exception 'Pedido de paquete inválido' using errcode='22023'; end if;

 for line in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(line)<>'object' or coalesce(line->>'type','') not in ('product','package') then raise exception 'Tipo de artículo inválido' using errcode='22023'; end if;
  if p_source='product' and line->>'type'<>'product' then raise exception 'Origen incompatible' using errcode='22023'; end if;
  group_no:=group_no+1;
  if line->>'type'='package' then
   if exists(select 1 from jsonb_object_keys(line) k where k not in ('type','package_id','items')) then raise exception 'Campo de paquete no permitido' using errcode='22023'; end if;
   if coalesce(line->>'package_id','') !~ '^[1-9][0-9]{0,15}$' then raise exception 'Paquete inválido' using errcode='22023'; end if;
   select * into pack from public.packages where id=(line->>'package_id')::bigint and published for share;
   if not found then raise exception 'Paquete no disponible' using errcode='22023'; end if;
   components:=line->'items';
   if components is null or jsonb_typeof(components)<>'array' then raise exception 'Selecciona los productos del paquete' using errcode='22023'; end if;
   select count(*) into package_count from public.package_items where package_id=pack.id;
   if package_count<2 or jsonb_array_length(components)<>package_count or package_count>100 then raise exception 'El paquete cambió. Vuelve a seleccionarlo.' using errcode='22023'; end if;
   ids:='{}'; package_rows:='[]'; pack_original:=0;
  else
   if exists(select 1 from jsonb_object_keys(line) k where k not in ('type','product_id','variant_id','quantity')) then raise exception 'Campo de producto no permitido' using errcode='22023'; end if;
   components:=jsonb_build_array(line);
  end if;
  for component in select value from jsonb_array_elements(components) loop
   if jsonb_typeof(component)<>'object' or coalesce(component->>'product_id','') !~ '^[1-9][0-9]{0,15}$' or coalesce(component->>'variant_id','') !~ '^[1-9][0-9]{0,15}$' then raise exception 'Producto o talla inválidos' using errcode='22023'; end if;
   if line->>'type'='package' then
    if exists(select 1 from jsonb_object_keys(component) k where k not in ('product_id','variant_id')) then raise exception 'Campo interno de paquete no permitido' using errcode='22023'; end if;
    if (component->>'product_id')::bigint=any(ids) or not exists(select 1 from public.package_items where package_id=pack.id and product_id=(component->>'product_id')::bigint) then raise exception 'La composición del paquete no coincide' using errcode='22023'; end if;
    ids:=array_append(ids,(component->>'product_id')::bigint); q:=1;
   else
    if coalesce(component->>'quantity','') !~ '^[1-5]$' then raise exception 'Cantidad inválida' using errcode='22023'; end if;
    q:=(component->>'quantity')::integer;
   end if;
   select * into p from public.products where id=(component->>'product_id')::bigint and published and not deletion_pending for share;
   if not found or p.price is null then raise exception 'Producto no disponible o sin precio' using errcode='22023'; end if;
   if line->>'type'='product' and q>p.max_quantity then raise exception 'Cantidad máxima superada para %',p.name using errcode='22023'; end if;
   select * into v from public.product_variants where id=(component->>'variant_id')::bigint and product_id=p.id for share;
   if not found then raise exception 'Talla no válida para %',p.name using errcode='22023'; end if;
   if v.stock is null or v.stock<q then raise exception 'No hay stock suficiente de % — talla %',p.name,v.size using errcode='22023'; end if;
   select name into brand from public.brands where id=p.brand_id;
   percentage:=case when line->>'type'='product' and p.on_sale then p.discount_percent else null end;
   price:=case when percentage is not null then round(p.price*(100-percentage)/100) else p.price end;
   component:=jsonb_build_object('product_id',p.id,'variant_id',v.id,'product_name_snapshot',p.name,'brand_snapshot',brand,'size_snapshot',v.size,'quantity',q,'unit_original_price',p.price,'unit_effective_price',price,'discount_percent_snapshot',percentage,'line_total',price*q,
    'collection_id_snapshot',case when line->>'type'='product' then p.collection_id else null end,
    'line_type',case when line->>'type'='product' then 'product' else 'package_item' end,
    'package_id',case when line->>'type'='package' then pack.id else null end,
    'package_group',case when line->>'type'='package' then group_no else null end,
    'package_name_snapshot',case when line->>'type'='package' then pack.name else null end,
    'package_discount_percent_snapshot',case when line->>'type'='package' then pack.discount_percent else null end);
   if line->>'type'='package' then
    package_rows:=package_rows||jsonb_build_array(component); pack_original:=pack_original+p.price;
   else
    rows:=rows||jsonb_build_array(component); normal_effective:=normal_effective+price*q;
   end if;
   n:=n+1;
   if n>300 then raise exception 'Demasiados artículos en el pedido' using errcode='22023'; end if;
  end loop;
  if line->>'type'='package' then
   select pack.id::text||':'||string_agg(x->>'variant_id',',' order by (x->>'variant_id')::bigint) into signature from jsonb_array_elements(package_rows) x;
   if signature=any(seen) then raise exception 'El mismo paquete y tallas están repetidos' using errcode='22023'; end if;
   seen:=array_append(seen,signature);
   pack_final:=round(pack_original*(100-pack.discount_percent)/100);
   cumulative:=0; allocated:=0;
   -- Allocate the rounded package total in cents; cumulative rounding preserves
   -- exactly the backend package total without applying individual offers.
   for component in select value from jsonb_array_elements(package_rows) loop
    cumulative:=cumulative+(component->>'unit_original_price')::numeric;
    allocation:=case when pack_original=0 then 0 else round(pack_final*cumulative/pack_original,2)-allocated end;
    allocated:=allocated+allocation;
    rows:=rows||jsonb_build_array(component||jsonb_build_object('unit_effective_price',allocation,'line_total',allocation));
   end loop;
  end if;
 end loop;
 -- Normal products share their configured quantity cap across all sizes.
 for r in select (x->>'product_id')::bigint id,sum((x->>'quantity')::integer) quantity
  from jsonb_array_elements(rows) x where x->>'line_type'='product' group by 1 loop
  if r.quantity>(select max_quantity from public.products where id=r.id) then raise exception 'Cantidad máxima superada para un producto' using errcode='22023'; end if;
 end loop;
 -- Sum repeated variants across ordinary products AND package components.
 for r in select (x->>'variant_id')::bigint id,sum((x->>'quantity')::integer) required,
  min(x->>'product_name_snapshot') name,min(x->>'size_snapshot') size
  from jsonb_array_elements(rows) x group by (x->>'variant_id')::bigint order by 1 loop
  select * into v from public.product_variants where id=r.id for share;
  if not found or v.stock is null or v.stock<r.required then raise exception 'No hay stock suficiente de % — talla %',r.name,r.size using errcode='22023'; end if;
 end loop;
 -- Match the existing normal-cart rule: one promotion per collection, capped
 -- at the normal products' effective subtotal. Package components are excluded.
 for r in select x->>'collection_id_snapshot' id,sum((x->>'quantity')::integer) pieces
  from jsonb_array_elements(rows) x where x->>'line_type'='product' and x->>'collection_id_snapshot' is not null group by 1 loop
  select * into c from public.collections where id=r.id for share;
  if found and c.discount_enabled and r.pieces>=c.minimum_pieces then
   collection_discount:=collection_discount+c.discount_amount;
   collection_rows:=collection_rows||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'pieces',r.pieces,'minimum_pieces',c.minimum_pieces,'amount',c.discount_amount));
  end if;
 end loop;
 collection_discount:=least(collection_discount,normal_effective);
 select sum((x->>'unit_original_price')::numeric*(x->>'quantity')::integer),sum((x->>'line_total')::numeric) into original,effective from jsonb_array_elements(rows) x;
 insert into public.orders(source,customer_name,customer_phone,subtotal,discount_total,total,collection_discount_total,collection_snapshot,total_units)
 values(p_source,nullif(btrim(p_customer_name),''),nullif(btrim(p_customer_phone),''),original,original-effective+collection_discount,effective-collection_discount,collection_discount,collection_rows,
  (select sum((x->>'quantity')::integer) from jsonb_array_elements(rows) x)) returning * into new_order;
 insert into public.order_items(order_id,position,line_type,product_id,variant_id,package_id,package_group,package_name_snapshot,package_discount_percent_snapshot,product_name_snapshot,brand_snapshot,size_snapshot,quantity,unit_original_price,unit_effective_price,discount_percent_snapshot,line_total,collection_id_snapshot)
 select new_order.id,(ord-1)::integer,x.line_type,x.product_id,x.variant_id,x.package_id,x.package_group,x.package_name_snapshot,x.package_discount_percent_snapshot,x.product_name_snapshot,x.brand_snapshot,x.size_snapshot,x.quantity,x.unit_original_price,x.unit_effective_price,x.discount_percent_snapshot,x.line_total,x.collection_id_snapshot
 from jsonb_array_elements(rows) with ordinality j(value,ord) cross join lateral jsonb_populate_record(null::public.order_items,j.value) x;
 -- Only this new order is returned; there is no public history/read endpoint.
 return jsonb_build_object('id',new_order.id,'public_code',new_order.public_code,'status',new_order.status,'subtotal',new_order.subtotal,'discount_total',new_order.discount_total,'total',new_order.total,'collection_discount_total',collection_discount,'items',rows);
end; $$;


revoke all on function public._create_catalog_order_internal(text,jsonb,text,text) from PUBLIC,anon,authenticated;

commit;
