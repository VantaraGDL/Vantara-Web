begin;
create table public.catalog_sizes (
 id bigint generated always as identity primary key,
 code text not null check(length(code) between 1 and 40 and code=btrim(code)),
 label text not null check(length(btrim(label)) between 1 and 120),
 sort_order integer not null check(sort_order>=0),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index catalog_sizes_code_unique on public.catalog_sizes(lower(regexp_replace(code,'\s+',' ','g')));
alter table public.catalog_sizes enable row level security;
revoke all on public.catalog_sizes from PUBLIC,anon,authenticated;
revoke all on sequence public.catalog_sizes_id_seq from PUBLIC,anon,authenticated;
grant select,insert,update on public.catalog_sizes to authenticated;
grant usage on sequence public.catalog_sizes_id_seq to authenticated;
create policy sizes_admin_read on public.catalog_sizes for select to authenticated using(public.is_catalog_admin());
create policy sizes_admin_insert on public.catalog_sizes for insert to authenticated with check(public.is_catalog_admin());
create policy sizes_admin_update on public.catalog_sizes for update to authenticated using(public.is_catalog_admin()) with check(public.is_catalog_admin());
insert into public.catalog_sizes(code,label,sort_order) values
 ('XS','Extra chica',10),('S','Chica',20),('M','Mediana',30),('L','Grande',40),('XL','Extra grande',50),('Única','Unitalla',100);

create function public.save_catalog_size(p_id bigint,p_code text,p_label text,p_sort_order integer,p_active boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; normalized text:=regexp_replace(btrim(p_code),'\s+',' ','g');
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if normalized is null or length(normalized) not between 1 and 40 or p_label is null or length(btrim(p_label)) not between 1 and 120 or p_sort_order is null or p_sort_order<0 or p_active is null then raise exception 'Datos de talla inválidos' using errcode='22023'; end if;
 if p_id is null then
   insert into public.catalog_sizes(code,label,sort_order,active) values(normalized,btrim(p_label),p_sort_order,p_active) returning to_jsonb(catalog_sizes.*) into result;
 else
   -- A code identifies existing variants: edit its label/order/status, never rename it.
   update public.catalog_sizes set label=btrim(p_label),sort_order=p_sort_order,active=p_active
    where id=p_id and code=normalized returning to_jsonb(catalog_sizes.*) into result;
   if not found then raise exception 'Talla inexistente o código modificado' using errcode='22023'; end if;
 end if;
 return result;
end;
$$;
revoke all on function public.save_catalog_size(bigint,text,text,integer,boolean) from PUBLIC,anon,authenticated;
grant execute on function public.save_catalog_size(bigint,text,text,integer,boolean) to authenticated;
create or replace function public.create_catalog_product(p_product jsonb, p_variants jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare r public.products; k text; v jsonb; sizes text[] := '{}'; s text; n numeric; new_id bigint; accessory boolean; i integer:=0;
begin
  if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
  if p_product is null or jsonb_typeof(p_product)<>'object' or p_variants is null or jsonb_typeof(p_variants)<>'array' then raise exception 'Formato inválido' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_product) loop
    if not(k=any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured','new_release'])) then raise exception 'Campo no permitido: %',k using errcode='22023'; end if;
    if k in ('featured','new_release') then
      if jsonb_typeof(p_product->k)<>'boolean' then raise exception 'Destacado inválido' using errcode='22023'; end if;
    elsif k='price' then
      if jsonb_typeof(p_product->k) not in ('null','number') then raise exception 'Precio inválido' using errcode='22023'; end if;
      n:=(p_product->>k)::numeric;
      if n<0 or n<>round(n,2) then raise exception 'Precio inválido' using errcode='22023'; end if;
    elsif jsonb_typeof(p_product->k) not in ('null','string') then raise exception 'Texto inválido' using errcode='22023'; end if;
  end loop;
  r:=jsonb_populate_record(null::public.products,p_product);
  if r.name is null or length(trim(r.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  accessory:=jsonb_array_length(p_variants)=1 and p_variants @> '[{"size":"Única"}]'::jsonb;
  if jsonb_array_length(p_variants)=0 then raise exception 'Selecciona variantes' using errcode='22023'; end if;
  insert into public.products(name,model,color,brand_id,category_id,price,material,description,collection_id,featured,new_release,published,requires_size)
  values(r.name,r.model,r.color,r.brand_id,r.category_id,r.price,r.material,r.description,r.collection_id,coalesce(r.featured,false),coalesce(r.new_release,false),false,not accessory) returning id into new_id;
  for v in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v)<>'object' or not(v?'size' and v?'stock') or (select count(*) from jsonb_object_keys(v))<>2 then raise exception 'Variante inválida' using errcode='22023'; end if;
    s:=v->>'size';
    if jsonb_typeof(v->'size')<>'string' or s=any(sizes) or
      not exists(select 1 from public.catalog_sizes where code=s and active) then raise exception 'Talla inválida o duplicada' using errcode='22023'; end if;
    sizes:=array_append(sizes,s);
    if jsonb_typeof(v->'stock') not in ('null','number') then raise exception 'Stock inválido' using errcode='22023'; end if;
    n:=(v->>'stock')::numeric;
    if n<0 or n<>trunc(n) or n>2147483647 then raise exception 'Stock inválido' using errcode='22023'; end if;
    insert into public.product_variants(product_id,size,stock,position) values(new_id,s,n::integer,(select sort_order from public.catalog_sizes where code=s));
    i:=i+1;
  end loop;
  return new_id;
end;
$$;
revoke all on function public.create_catalog_product(jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_product(jsonb,jsonb) to authenticated;

create or replace function public.update_catalog_product(p_product_id bigint, p_changes jsonb, p_variants jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_product public.products;
  next_product public.products;
  item jsonb;
  k text;
  variant_id bigint;
  stock_value integer;
  seen bigint[] := '{}';
  new_size text;

begin
  if auth.uid() is null or not public.is_catalog_admin() then
    raise exception 'Acceso de administrador requerido' using errcode='42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or
     p_variants is null or jsonb_typeof(p_variants)<>'array' then
    raise exception 'Formato de cambios inválido' using errcode='22023';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured','published','new_release'])) then
      raise exception 'Campo no editable: %',k using errcode='22023';
    end if;
    if k in ('featured','published','new_release') then
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
  if current_product.deletion_pending then raise exception 'Producto en proceso de eliminación' using errcode='22023'; end if;
  next_product := jsonb_populate_record(current_product,p_changes);
  if next_product.name is null or length(trim(next_product.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  update public.products set name=next_product.name, model=next_product.model, color=next_product.color,
    brand_id=next_product.brand_id, category_id=next_product.category_id, price=next_product.price,
    material=next_product.material, description=next_product.description, collection_id=next_product.collection_id,
    featured=next_product.featured, new_release=next_product.new_release, published=next_product.published where id=p_product_id;
  -- Delete only within this transaction and only from the locked product.
  for item in select value from jsonb_array_elements(p_variants) where value ? 'delete' loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2
       or not(item?'id') or item->'delete'<>'true'::jsonb
       or jsonb_typeof(item->'id')<>'number'
       or (item->>'id')::numeric<>trunc((item->>'id')::numeric) then
      raise exception 'Eliminación de talla inválida' using errcode='22023';
    end if;
    variant_id:=(item->>'id')::bigint;
    if variant_id=any(seen) then raise exception 'Variante duplicada' using errcode='22023'; end if;
    seen:=array_append(seen,variant_id);
    delete from public.product_variants where id=variant_id and product_id=p_product_id;
    if not found then raise exception 'Variante inexistente o ajena al producto' using errcode='22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_variants) where not(value ? 'delete') loop
    if jsonb_typeof(item)<>'object' or not(item?'stock') or
      (select count(*) from jsonb_object_keys(item))<>2 or (item?'id')=(item?'size') then
      raise exception 'Variante inválida: usa id y stock, o size y stock' using errcode='22023'; end if;
    if jsonb_typeof(item->'stock') not in ('null','number') then raise exception 'Stock inválido' using errcode='22023'; end if;
    if jsonb_typeof(item->'stock')='number' and ((item->>'stock')::numeric<0 or (item->>'stock')::numeric<>trunc((item->>'stock')::numeric) or (item->>'stock')::numeric>2147483647) then raise exception 'Stock inválido' using errcode='22023'; end if;
    stock_value:=(item->>'stock')::integer;
    if item?'id' then
      if jsonb_typeof(item->'id')<>'number' or (item->>'id')::numeric<>trunc((item->>'id')::numeric) then raise exception 'ID inválido' using errcode='22023'; end if;
      variant_id:=(item->>'id')::bigint;
      if variant_id=any(seen) then raise exception 'Variante duplicada' using errcode='22023'; end if;
      seen:=array_append(seen,variant_id);
      update public.product_variants set stock=stock_value where id=variant_id and product_id=p_product_id;
      if not found then raise exception 'Variante inexistente o ajena al producto' using errcode='22023'; end if;
    else
      new_size:=item->>'size';
      if jsonb_typeof(item->'size')<>'string' or not exists(select 1 from public.catalog_sizes where code=new_size and active) then raise exception 'Talla inválida' using errcode='22023'; end if;
      if exists(select 1 from public.product_variants where product_id=p_product_id and size=new_size) then raise exception 'La talla ya existe' using errcode='22023'; end if;
      insert into public.product_variants(product_id,size,stock,position)
      values(p_product_id,new_size,stock_value,coalesce((select max(position)+1 from public.product_variants where product_id=p_product_id),0));
    end if;
  end loop;
  if jsonb_array_length(p_variants)>0 and not exists(select 1 from public.product_variants where product_id=p_product_id) then
    raise exception 'Conserva al menos una talla' using errcode='22023';
  end if;
  update public.product_variants set position=coalesce((select sort_order from public.catalog_sizes where code=product_variants.size),position)
    where product_id=p_product_id;
  -- Only a sole Única is unitalla; mixed variants still require a size selection.
  update public.products set requires_size=not (
    (select count(*) from public.product_variants where product_id=p_product_id)=1 and
    exists(select 1 from public.product_variants where product_id=p_product_id and size='Única')
  ) where id=p_product_id;

end;
$$;
revoke all on function public.update_catalog_product(bigint,jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.update_catalog_product(bigint,jsonb,jsonb) to authenticated;



commit;
