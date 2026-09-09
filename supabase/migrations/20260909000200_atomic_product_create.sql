begin;
create function public.create_catalog_product(p_product jsonb, p_variants jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare r public.products; k text; v jsonb; sizes text[] := '{}'; s text; n numeric; new_id bigint; accessory boolean; i integer:=0;
begin
  if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
  if p_product is null or jsonb_typeof(p_product)<>'object' or p_variants is null or jsonb_typeof(p_variants)<>'array' then raise exception 'Formato inválido' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_product) loop
    if not(k=any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured'])) then raise exception 'Campo no permitido: %',k using errcode='22023'; end if;
    if k='featured' then
      if jsonb_typeof(p_product->k)<>'boolean' then raise exception 'Destacado inválido' using errcode='22023'; end if;
    elsif k='price' then
      if jsonb_typeof(p_product->k) not in ('null','number') then raise exception 'Precio inválido' using errcode='22023'; end if;
      n:=(p_product->>k)::numeric;
      if n<0 or n<>round(n,2) then raise exception 'Precio inválido' using errcode='22023'; end if;
    elsif jsonb_typeof(p_product->k) not in ('null','string') then raise exception 'Texto inválido' using errcode='22023'; end if;
  end loop;
  r:=jsonb_populate_record(null::public.products,p_product);
  if r.name is null or length(trim(r.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  accessory:=r.category_id='Accessories';
  if jsonb_array_length(p_variants)=0 or jsonb_array_length(p_variants)>4 then raise exception 'Selecciona variantes' using errcode='22023'; end if;
  insert into public.products(name,model,color,brand_id,category_id,price,material,description,collection_id,featured,published,requires_size)
  values(r.name,r.model,r.color,r.brand_id,r.category_id,r.price,r.material,r.description,r.collection_id,coalesce(r.featured,false),false,not accessory) returning id into new_id;
  for v in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v)<>'object' or not(v?'size' and v?'stock') or (select count(*) from jsonb_object_keys(v))<>2 then raise exception 'Variante inválida' using errcode='22023'; end if;
    s:=v->>'size';
    if jsonb_typeof(v->'size')<>'string' or s=any(sizes) or
      (accessory and (s<>'Única' or jsonb_array_length(p_variants)<>1)) or
      (not accessory and not(s=any(array['S','M','L','XL']))) then raise exception 'Talla inválida o duplicada' using errcode='22023'; end if;
    sizes:=array_append(sizes,s);
    if jsonb_typeof(v->'stock') not in ('null','number') then raise exception 'Stock inválido' using errcode='22023'; end if;
    n:=(v->>'stock')::numeric;
    if n<0 or n<>trunc(n) or n>2147483647 then raise exception 'Stock inválido' using errcode='22023'; end if;
    insert into public.product_variants(product_id,size,stock,position) values(new_id,s,n::integer,i);
    i:=i+1;
  end loop;
  return new_id;
end;
$$;
revoke all on function public.create_catalog_product(jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_product(jsonb,jsonb) to authenticated;
commit;
