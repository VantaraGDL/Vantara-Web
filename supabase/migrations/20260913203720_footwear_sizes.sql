begin;
alter table public.categories add column size_type text not null default 'clothing' check(size_type in ('clothing','footwear'));
alter table public.catalog_sizes add column size_type text not null default 'clothing' check(size_type in ('clothing','footwear'));
-- Reuse the existing category, preserving its ID and visible name.
update public.categories set size_type='footwear' where id='tenis';
insert into public.categories(id,name,position,size_type)
 select 'tenis','Tenis',coalesce(max(position)+1,0),'footwear' from public.categories
 having not exists(select 1 from public.categories where id='tenis');
alter table public.catalog_sizes add constraint footwear_numeric_code check(size_type<>'footwear' or code ~ '^[1-9][0-9]*([.][0-9]+)?$');
insert into public.catalog_sizes(code,label,sort_order,active,size_type) values
 ('24','24',240,true,'footwear'),('25','25',250,true,'footwear'),('26','26',260,true,'footwear'),
 ('27','27',270,true,'footwear'),('28','28',280,true,'footwear'),('29','29',290,true,'footwear');
-- Type is immutable after creation, avoiding concurrent reclassification of existing variants.
create function public.prevent_size_type_change() returns trigger language plpgsql set search_path='' as $$
begin
 if new.size_type is distinct from old.size_type then raise exception 'El tipo no puede cambiarse después de crearlo' using errcode='22023'; end if;
 return new;
end; $$;
revoke all on function public.prevent_size_type_change() from PUBLIC,anon,authenticated;
create trigger category_size_type_fixed before update of size_type on public.categories for each row execute function public.prevent_size_type_change();
create trigger catalog_size_type_fixed before update of size_type on public.catalog_sizes for each row execute function public.prevent_size_type_change();
-- Also protect direct writes; deferred validation checks the final atomic state.
create function public.validate_product_size_type() returns trigger language plpgsql security definer set search_path='' as $$
declare target_id bigint;
begin
 if tg_table_name='products' then target_id:=new.id; else target_id:=new.product_id; end if;
 if exists(select 1 from public.products p join public.categories c on c.id=p.category_id
 join public.product_variants v on v.product_id=p.id left join public.catalog_sizes s on s.code=v.size
 where p.id=target_id and (s.id is null or s.size_type<>c.size_type)) then
 raise exception 'Tallas incompatibles con la categoría' using errcode='22023'; end if;
 return null;
end; $$;
revoke all on function public.validate_product_size_type() from PUBLIC,anon,authenticated;
create constraint trigger product_size_type_consistent after insert or update on public.products deferrable initially deferred for each row execute function public.validate_product_size_type();
create constraint trigger variant_size_type_consistent after insert or update on public.product_variants deferrable initially deferred for each row execute function public.validate_product_size_type();
-- Replace the old signature so there is a single unambiguous RPC endpoint.
drop function public.save_catalog_size(bigint,text,text,integer,boolean);
create function public.save_catalog_size(p_id bigint,p_code text,p_label text,p_sort_order integer,p_active boolean,p_size_type text default 'clothing')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; normalized text:=regexp_replace(btrim(p_code),'\s+',' ','g');
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if normalized is null or length(normalized) not between 1 and 40 or p_label is null or length(btrim(p_label)) not between 1 and 120 or p_sort_order is null or p_sort_order<0 or p_active is null or p_size_type is null or p_size_type not in ('clothing','footwear') then raise exception 'Datos de talla inválidos' using errcode='22023'; end if;
 if p_id is null then
 insert into public.catalog_sizes(code,label,sort_order,active,size_type) values(normalized,btrim(p_label),p_sort_order,p_active,p_size_type) returning to_jsonb(catalog_sizes.*) into result;
 else
 update public.catalog_sizes set label=btrim(p_label),sort_order=p_sort_order,active=p_active
 where id=p_id and code=normalized and size_type=p_size_type returning to_jsonb(catalog_sizes.*) into result;
 if not found then raise exception 'Talla inexistente o código/tipo modificado' using errcode='22023'; end if;
 end if;
 return result;
end; $$;
revoke all on function public.save_catalog_size(bigint,text,text,integer,boolean,text) from PUBLIC,anon,authenticated;
grant execute on function public.save_catalog_size(bigint,text,text,integer,boolean,text) to authenticated;
create or replace function public.create_catalog_product(p_product jsonb, p_variants jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare r public.products; k text; v jsonb; sizes text[] := '{}'; s text; n numeric; new_id bigint; accessory boolean; i integer:=0;
begin
  if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
  if p_product is null or jsonb_typeof(p_product)<>'object' or p_variants is null or jsonb_typeof(p_variants)<>'array' then raise exception 'Formato inválido' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_product) loop
    if not(k=any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured','new_release','on_sale','discount_percent'])) then raise exception 'Campo no permitido: %',k using errcode='22023'; end if;
    if k in ('featured','new_release','on_sale') then
      if jsonb_typeof(p_product->k)<>'boolean' then raise exception 'Destacado inválido' using errcode='22023'; end if;
    elsif k='discount_percent' then
      if jsonb_typeof(p_product->k) not in ('null','number') then raise exception 'Porcentaje inválido' using errcode='22023'; end if;
      if (p_product->>k)::numeric<=0 or (p_product->>k)::numeric>=100 or (p_product->>k)::numeric<>trunc((p_product->>k)::numeric) then raise exception 'Usa un porcentaje entero entre 1 y 99' using errcode='22023'; end if;
    elsif k='price' then
      if jsonb_typeof(p_product->k) not in ('null','number') then raise exception 'Precio inválido' using errcode='22023'; end if;
      n:=(p_product->>k)::numeric;
      if n<0 or n<>round(n,2) then raise exception 'Precio inválido' using errcode='22023'; end if;
    elsif jsonb_typeof(p_product->k) not in ('null','string') then raise exception 'Texto inválido' using errcode='22023'; end if;
  end loop;
  r:=jsonb_populate_record(null::public.products,p_product);
  r.on_sale:=coalesce(r.on_sale,false);
  if not r.on_sale then r.discount_percent:=null; end if;
  if r.on_sale and r.discount_percent is null then raise exception 'Porcentaje obligatorio' using errcode='22023'; end if;
  if r.name is null or length(trim(r.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  accessory:=jsonb_array_length(p_variants)=1 and p_variants @> '[{"size":"Única"}]'::jsonb;
  if jsonb_array_length(p_variants)=0 then raise exception 'Selecciona variantes' using errcode='22023'; end if;
  insert into public.products(name,model,color,brand_id,category_id,price,material,description,collection_id,featured,new_release,on_sale,discount_percent,published,requires_size)
  values(r.name,r.model,r.color,r.brand_id,r.category_id,r.price,r.material,r.description,r.collection_id,coalesce(r.featured,false),coalesce(r.new_release,false),r.on_sale,r.discount_percent,false,not accessory) returning id into new_id;
  for v in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v)<>'object' or not(v?'size' and v?'stock') or (select count(*) from jsonb_object_keys(v))<>2 then raise exception 'Variante inválida' using errcode='22023'; end if;
    s:=v->>'size';
    if jsonb_typeof(v->'size')<>'string' or s=any(sizes) or
      not exists(select 1 from public.catalog_sizes where code=s and active and size_type=(select size_type from public.categories where id=r.category_id)) then raise exception 'Talla inválida o duplicada' using errcode='22023'; end if;
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
    if not (k = any(array['name','model','color','brand_id','category_id','price','material','description','collection_id','featured','published','new_release','on_sale','discount_percent'])) then
      raise exception 'Campo no editable: %',k using errcode='22023';
    end if;
    if k in ('featured','published','new_release','on_sale') then
      if jsonb_typeof(p_changes->k)<>'boolean' then raise exception 'Booleano inválido' using errcode='22023'; end if;
    elsif k='discount_percent' then
      if jsonb_typeof(p_changes->k) not in ('null','number') then raise exception 'Porcentaje inválido' using errcode='22023'; end if;
      if (p_changes->>k)::numeric<=0 or (p_changes->>k)::numeric>=100 or (p_changes->>k)::numeric<>trunc((p_changes->>k)::numeric) then raise exception 'Usa un porcentaje entero entre 1 y 99' using errcode='22023'; end if;
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
  if not next_product.on_sale then next_product.discount_percent:=null; end if;
  if next_product.on_sale and next_product.discount_percent is null then raise exception 'Porcentaje obligatorio' using errcode='22023'; end if;
  if next_product.name is null or length(trim(next_product.name))=0 then raise exception 'Nombre obligatorio' using errcode='22023'; end if;
  update public.products set name=next_product.name, model=next_product.model, color=next_product.color,
    brand_id=next_product.brand_id, category_id=next_product.category_id, price=next_product.price,
    material=next_product.material, description=next_product.description, collection_id=next_product.collection_id,
    on_sale=next_product.on_sale, discount_percent=next_product.discount_percent, featured=next_product.featured, new_release=next_product.new_release, published=next_product.published where id=p_product_id;
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
      if jsonb_typeof(item->'size')<>'string' or not exists(select 1 from public.catalog_sizes where code=new_size and active and size_type=(select size_type from public.categories where id=next_product.category_id)) then raise exception 'Talla inválida' using errcode='22023'; end if;
      if exists(select 1 from public.product_variants where product_id=p_product_id and size=new_size) then raise exception 'La talla ya existe' using errcode='22023'; end if;
      insert into public.product_variants(product_id,size,stock,position)
      values(p_product_id,new_size,stock_value,coalesce((select max(position)+1 from public.product_variants where product_id=p_product_id),0));
    end if;
  end loop;
  if jsonb_array_length(p_variants)>0 and not exists(select 1 from public.product_variants where product_id=p_product_id) then
    raise exception 'Conserva al menos una talla' using errcode='22023';
  end if;
  if exists(select 1 from public.product_variants v left join public.catalog_sizes s on s.code=v.size
    where v.product_id=p_product_id and (s.id is null or s.size_type<>(select size_type from public.categories where id=next_product.category_id))) then
    raise exception 'Hay tallas incompatibles con la categoría. Elimínalas explícitamente o conserva la categoría anterior.' using errcode='22023';
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
