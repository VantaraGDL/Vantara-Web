begin;
create function public.update_catalog_product(p_product_id bigint, p_changes jsonb, p_variants jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_product public.products;
  next_product public.products;
  item jsonb;
  k text;
  variant_id bigint;
  stock_value integer;
  seen bigint[] := '{}';
begin
  if auth.uid() is null or not public.is_catalog_admin() then
    raise exception 'Acceso de administrador requerido' using errcode='42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or
     p_variants is null or jsonb_typeof(p_variants)<>'array' then
    raise exception 'Formato de cambios inválido' using errcode='22023';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured','published'])) then
      raise exception 'Campo no editable: %',k using errcode='22023';
    end if;
    if k in ('featured','published') then
      if jsonb_typeof(p_changes->k)<>'boolean' then raise exception 'Booleano inválido' using errcode='22023'; end if;
    elsif k='price' then
      if jsonb_typeof(p_changes->k) not in ('number','null') then raise exception 'Precio inválido' using errcode='22023'; end if;
      if jsonb_typeof(p_changes->k)='number' and ((p_changes->>k)::numeric<0 or (p_changes->>k)::numeric<>round((p_changes->>k)::numeric,2)) then raise exception 'Precio inválido' using errcode='22023'; end if;
    elsif jsonb_typeof(p_changes->k) not in ('string','null') then
      raise exception 'Texto inválido' using errcode='22023';
    end if;
  end loop;
  select * into current_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto inexistente o sin acceso' using errcode='22023'; end if;
  next_product := jsonb_populate_record(current_product,p_changes);
  if next_product.name is null or length(trim(next_product.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  update public.products set name=next_product.name, model=next_product.model, color=next_product.color,
    brand_id=next_product.brand_id, category_id=next_product.category_id, price=next_product.price,
    material=next_product.material, description=next_product.description, collection_id=next_product.collection_id,
    featured=next_product.featured, published=next_product.published where id=p_product_id;
  for item in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(item)<>'object' or not (item ? 'id' and item ? 'stock') or
       (select count(*) from jsonb_object_keys(item))<>2 then raise exception 'Variante inválida' using errcode='22023'; end if;
    if jsonb_typeof(item->'id')<>'number' or (item->>'id')::numeric<>trunc((item->>'id')::numeric) then raise exception 'ID inválido' using errcode='22023'; end if;
    variant_id := (item->>'id')::bigint;
    if variant_id=any(seen) then raise exception 'Variante duplicada' using errcode='22023'; end if;
    seen := array_append(seen,variant_id);
    if jsonb_typeof(item->'stock') not in ('null','number') then raise exception 'Stock inválido' using errcode='22023'; end if;
    if jsonb_typeof(item->'stock')='number' and ((item->>'stock')::numeric<0 or (item->>'stock')::numeric<>trunc((item->>'stock')::numeric)) then raise exception 'Stock inválido' using errcode='22023'; end if;
    stock_value := (item->>'stock')::integer;
    update public.product_variants set stock=stock_value where id=variant_id and product_id=p_product_id;
    if not found then raise exception 'Variante inexistente o ajena al producto' using errcode='22023'; end if;
  end loop;
end;
$$;
revoke all on function public.update_catalog_product(bigint,jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.update_catalog_product(bigint,jsonb,jsonb) to authenticated;
commit;
