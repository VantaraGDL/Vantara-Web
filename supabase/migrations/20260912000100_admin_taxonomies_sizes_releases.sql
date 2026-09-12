begin;
alter table public.products add column new_release boolean not null default false;

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
  accessory:=p_variants @> '[{"size":"Única"}]'::jsonb;
  if jsonb_array_length(p_variants)=0 or jsonb_array_length(p_variants)>5 then raise exception 'Selecciona variantes' using errcode='22023'; end if;
  insert into public.products(name,model,color,brand_id,category_id,price,material,description,collection_id,featured,new_release,published,requires_size)
  values(r.name,r.model,r.color,r.brand_id,r.category_id,r.price,r.material,r.description,r.collection_id,coalesce(r.featured,false),coalesce(r.new_release,false),false,not accessory) returning id into new_id;
  for v in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v)<>'object' or not(v?'size' and v?'stock') or (select count(*) from jsonb_object_keys(v))<>2 then raise exception 'Variante inválida' using errcode='22023'; end if;
    s:=v->>'size';
    if jsonb_typeof(v->'size')<>'string' or s=any(sizes) or
      (accessory and (s<>'Única' or jsonb_array_length(p_variants)<>1)) or
      (not accessory and not(s=any(array['XS','S','M','L','XL']))) then raise exception 'Talla inválida o duplicada' using errcode='22023'; end if;
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
  for item in select value from jsonb_array_elements(p_variants) loop
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
      if jsonb_typeof(item->'size')<>'string' or not(new_size=any(array['XS','S','M','L','XL','Única'])) then raise exception 'Talla inválida' using errcode='22023'; end if;
      if exists(select 1 from public.product_variants where product_id=p_product_id and size=new_size) then raise exception 'La talla ya existe' using errcode='22023'; end if;
      if (new_size='Única' and exists(select 1 from public.product_variants where product_id=p_product_id and size<>'Única')) or
         (new_size<>'Única' and exists(select 1 from public.product_variants where product_id=p_product_id and size='Única')) then
        raise exception 'Única no se combina con otras tallas' using errcode='22023'; end if;
      insert into public.product_variants(product_id,size,stock,position)
      values(p_product_id,new_size,stock_value,coalesce((select max(position)+1 from public.product_variants where product_id=p_product_id),0));
    end if;
  end loop;
  -- Derive size requirement from variants, including recovery of a product with no variants.
  update public.products set requires_size=not exists(select 1 from public.product_variants where product_id=p_product_id and size='Única') where id=p_product_id;

end;
$$;
revoke all on function public.update_catalog_product(bigint,jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.update_catalog_product(bigint,jsonb,jsonb) to authenticated;

-- Slugs are the existing text IDs; preserve all historical IDs and foreign keys.
create function public.catalog_taxonomy_slug(value text) returns text
language sql immutable strict security invoker set search_path='' as $$
 select trim(both '-' from regexp_replace(lower(translate(trim(value),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z0-9]+','-','g'));
$$;
revoke all on function public.catalog_taxonomy_slug(text) from PUBLIC,anon,authenticated;
grant execute on function public.catalog_taxonomy_slug(text) to authenticated;
create unique index brands_normalized_name_unique on public.brands(public.catalog_taxonomy_slug(name));
create unique index brands_normalized_id_unique on public.brands(public.catalog_taxonomy_slug(id));
create unique index categories_normalized_name_unique on public.categories(public.catalog_taxonomy_slug(name));
create unique index categories_normalized_id_unique on public.categories(public.catalog_taxonomy_slug(id));
create unique index collections_normalized_name_unique on public.collections(public.catalog_taxonomy_slug(name));
create unique index collections_normalized_id_unique on public.collections(public.catalog_taxonomy_slug(id));

create function public.create_catalog_taxonomy(p_kind text,p_name text,p_slug text,p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare label text:=trim(p_name); slug text:=p_slug; result jsonb; amount numeric:=150; minimum integer:=2; enabled boolean:=true; k text;
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('brands','categories','collections') then raise exception 'Tipo inválido' using errcode='22023'; end if;
 if label is null or length(label) not between 1 and 120 or public.catalog_taxonomy_slug(label)='' then raise exception 'Nombre inválido' using errcode='22023'; end if;
 if slug is null or length(slug) not between 1 and 80 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug inválido: usa minúsculas, números y guiones' using errcode='22023'; end if;
 if p_options is null or jsonb_typeof(p_options)<>'object' then raise exception 'Opciones inválidas' using errcode='22023'; end if;
 for k in select jsonb_object_keys(p_options) loop
   if p_kind<>'collections' or k not in ('discount_enabled','discount_amount','minimum_pieces') then raise exception 'Opción inválida' using errcode='22023'; end if;
 end loop;
 if p_options?'discount_enabled' then
   if jsonb_typeof(p_options->'discount_enabled')<>'boolean' then raise exception 'Descuento inválido' using errcode='22023'; end if;
   enabled:=(p_options->>'discount_enabled')::boolean;
 end if;
 if p_options?'discount_amount' then
   if jsonb_typeof(p_options->'discount_amount')<>'number' then raise exception 'Importe inválido' using errcode='22023'; end if;
   amount:=(p_options->>'discount_amount')::numeric;
   if amount<0 or amount>9999999999.99 or amount<>round(amount,2) then raise exception 'Importe inválido' using errcode='22023'; end if;
 end if;
 if p_options?'minimum_pieces' then
   if jsonb_typeof(p_options->'minimum_pieces')<>'number' or (p_options->>'minimum_pieces')::numeric<>trunc((p_options->>'minimum_pieces')::numeric) then raise exception 'Mínimo inválido' using errcode='22023'; end if;
   minimum:=(p_options->>'minimum_pieces')::integer;
   if minimum<2 then raise exception 'El mínimo debe ser de dos piezas' using errcode='22023'; end if;
 end if;
 -- Serialize cross-checks with inserts; indexes also prevent direct duplicate writes.
 if p_kind='brands' then
   lock table public.brands in share row exclusive mode;
   if exists(select 1 from public.brands where public.catalog_taxonomy_slug(name) in (slug,public.catalog_taxonomy_slug(label)) or public.catalog_taxonomy_slug(id) in (slug,public.catalog_taxonomy_slug(label))) then raise exception 'La marca ya existe' using errcode='23505'; end if;
   insert into public.brands(id,name,position) values(slug,label,coalesce((select max(position)+1 from public.brands),0)) returning to_jsonb(brands.*) into result;
 elsif p_kind='categories' then
   lock table public.categories in share row exclusive mode;
   if exists(select 1 from public.categories where public.catalog_taxonomy_slug(name) in (slug,public.catalog_taxonomy_slug(label)) or public.catalog_taxonomy_slug(id) in (slug,public.catalog_taxonomy_slug(label))) then raise exception 'La categoría ya existe' using errcode='23505'; end if;
   insert into public.categories(id,name,position) values(slug,label,coalesce((select max(position)+1 from public.categories),0)) returning to_jsonb(categories.*) into result;
 else
   lock table public.collections in share row exclusive mode;
   if exists(select 1 from public.collections where public.catalog_taxonomy_slug(name) in (slug,public.catalog_taxonomy_slug(label)) or public.catalog_taxonomy_slug(id) in (slug,public.catalog_taxonomy_slug(label))) then raise exception 'La colección ya existe' using errcode='23505'; end if;
   insert into public.collections(id,name,discount_enabled,discount_amount,minimum_pieces) values(slug,label,enabled,amount,minimum) returning to_jsonb(collections.*) into result;
 end if;
 return result;
end;
$$;
revoke all on function public.create_catalog_taxonomy(text,text,text,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_taxonomy(text,text,text,jsonb) to authenticated;
commit;
