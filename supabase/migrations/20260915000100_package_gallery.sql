begin;

-- Gallery associations are the source of truth; image_path is a compatibility
-- projection of the primary image, maintained only by the gallery writer.
create table public.package_images (
 id bigint generated always as identity primary key,
 package_id bigint not null references public.packages(id) on delete cascade,
 storage_path text not null unique references public.package_assets(path) on delete restrict,
 position integer not null check(position>=0),
 is_primary boolean not null default false,
 created_at timestamptz not null default now(),
 unique(package_id,position)
);
create unique index package_images_one_primary on public.package_images(package_id) where is_primary;
alter table public.package_images enable row level security;
revoke all on public.package_images from PUBLIC,anon,authenticated;
revoke all on sequence public.package_images_id_seq from PUBLIC,anon,authenticated;
grant select on public.package_images to anon,authenticated;
create policy package_images_read on public.package_images for select to anon,authenticated
 using(exists(select 1 from public.packages p where p.id=package_id and (p.published or public.is_catalog_admin())));

-- Preserve every assigned path and its physical object, including historical
-- pending reservations. Reconciliation can still resolve their state later.
insert into public.package_images(package_id,storage_path,position,is_primary)
 select id,image_path,0,true from public.packages where image_path is not null;

create function public.set_catalog_package_images(p_package_id bigint,p_images jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; paths text[]:='{}'; primary_path text; asset public.package_assets;
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 perform 1 from public.packages where id=p_package_id for update;
 if not found then raise exception 'Paquete inexistente' using errcode='22023'; end if;
 if p_images is null or jsonb_typeof(p_images)<>'array' then raise exception 'Galería inválida' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_images) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'storage_path') is distinct from 'string'
   or jsonb_typeof(item->'is_primary') is distinct from 'boolean' then
   raise exception 'Imagen inválida' using errcode='22023';
  end if;
  if item->>'storage_path'=any(paths) then raise exception 'Imagen duplicada' using errcode='22023'; end if;
  select * into asset from public.package_assets where path=item->>'storage_path' and package_id=p_package_id for update;
  if not found or asset.state<>'ready' then raise exception 'Imagen pendiente o ajena al paquete' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='package-images' and name=asset.path) then
   raise exception 'El archivo no existe en Storage: %',asset.path using errcode='22023';
  end if;
  paths:=array_append(paths,asset.path);
  if (item->>'is_primary')::boolean then
   if primary_path is not null then raise exception 'Solo puede haber una imagen principal' using errcode='22023'; end if;
   primary_path:=asset.path;
  end if;
 end loop;
 primary_path:=coalesce(primary_path,paths[1]);
 update public.package_assets a set state='deleting'
  where exists(select 1 from public.package_images i where i.package_id=p_package_id and i.storage_path=a.path)
  and not(a.path=any(paths));
 -- Detach only this package's associations; objects are removed later through
 -- authenticated Storage cleanup. The entire association change is atomic.
 delete from public.package_images where package_id=p_package_id;
 insert into public.package_images(package_id,storage_path,position,is_primary)
  select p_package_id,path,(ord-1)::integer,path=primary_path from unnest(paths) with ordinality as x(path,ord);
 update public.packages set image_path=primary_path,updated_at=now() where id=p_package_id;
end; $$;
revoke all on function public.set_catalog_package_images(bigint,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.set_catalog_package_images(bigint,jsonb) to authenticated;

alter policy package_storage_read on storage.objects using(
 bucket_id='package-images' and (public.is_catalog_admin() or exists(
  select 1 from public.package_images i join public.packages p on p.id=i.package_id
  where i.storage_path=storage.objects.name and p.published))
);
alter policy package_storage_delete on storage.objects using(
 bucket_id='package-images' and public.is_catalog_admin()
 and exists(select 1 from public.package_assets a where a.path=storage.objects.name and a.state='deleting')
 and not exists(select 1 from public.package_images i where i.storage_path=storage.objects.name)
 and not exists(select 1 from public.packages p where p.image_path=storage.objects.name)
);

-- Updated RPC definitions follow. The Storage upload trigger is deliberately
-- unchanged: its internal transaction does not carry the end-user JWT.

create or replace function public.write_catalog_package(p_id bigint,p_data jsonb,p_product_ids jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r public.packages; k text; v jsonb; ids bigint[]:='{}'; product_key bigint; old_path text;
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_product_ids is null or jsonb_typeof(p_product_ids)<>'array' then raise exception 'Datos inválidos' using errcode='22023'; end if;
 for k in select jsonb_object_keys(p_data) loop
  if k not in ('name','slug','description','discount_percent','published','featured','image_path') then raise exception 'Campo no permitido: %',k using errcode='22023'; end if;
  if k in ('published','featured') then
   if jsonb_typeof(p_data->k)<>'boolean' then raise exception 'Estado inválido' using errcode='22023'; end if;
  elsif k='discount_percent' then
   if jsonb_typeof(p_data->k)<>'number' or (p_data->>k)::numeric<>trunc((p_data->>k)::numeric) or (p_data->>k)::numeric not between 1 and 99 then raise exception 'Descuento: entero entre 1 y 99' using errcode='22023'; end if;
  elsif jsonb_typeof(p_data->k) not in ('string','null') then raise exception 'Texto inválido' using errcode='22023'; end if;
 end loop;
 for v in select value from jsonb_array_elements(p_product_ids) loop
  if jsonb_typeof(v)<>'number' or v::text::numeric<>trunc(v::text::numeric) then raise exception 'ID de producto inválido' using errcode='22023'; end if;
  product_key:=v::text::bigint;
  if product_key=any(ids) then raise exception 'Producto duplicado' using errcode='22023'; end if;
  perform 1 from public.products where id=product_key and not deletion_pending for key share;
  if not found then raise exception 'Producto inexistente o en eliminación: %',product_key using errcode='22023'; end if;
  ids:=array_append(ids,product_key);
 end loop;
 if cardinality(ids)<2 then raise exception 'Selecciona al menos dos productos diferentes' using errcode='22023'; end if;
 if p_id is not null then
  select * into r from public.packages where id=p_id for update;
  if not found then raise exception 'Paquete inexistente' using errcode='22023'; end if;
  old_path:=r.image_path;
 end if;
 if p_data ? 'image_path' and (p_data->>'image_path') is distinct from old_path then
  raise exception 'Actualiza la galería con el administrador actualizado' using errcode='22023';
 end if;
 r:=jsonb_populate_record(r,p_data-'image_path');
 r.name:=btrim(r.name);r.slug:=lower(btrim(r.slug));
 if r.name is null or r.slug is null or r.discount_percent is null then raise exception 'Completa nombre, slug y descuento' using errcode='22023'; end if;
 if p_id is null then
  if coalesce(r.published,false) then raise exception 'Los paquetes nuevos se crean ocultos' using errcode='22023'; end if;
  insert into public.packages(name,slug,description,discount_percent,featured,published)
  values(r.name,r.slug,r.description,r.discount_percent,coalesce(r.featured,false),false) returning id into p_id;
 else
  update public.packages set name=r.name,slug=r.slug,description=r.description,discount_percent=r.discount_percent,
   featured=r.featured,published=r.published,image_path=r.image_path,updated_at=now() where id=p_id;
  delete from public.package_items where package_id=p_id;
 end if;
 insert into public.package_items(package_id,product_id,position) select p_id,id,(ord-1)::integer from unnest(ids) with ordinality as x(id,ord);
 return p_id;
end; $$;
revoke all on function public.write_catalog_package(bigint,jsonb,jsonb) from PUBLIC,anon,authenticated;

create or replace function public.manage_package_image(p_package_id bigint,p_action text,p_path text default null,p_extension text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.package_assets;
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_action='finish_delete' then
  select * into asset from public.package_assets where path=p_path and state='deleting' for update;
  if not found then raise exception 'Eliminación no registrada' using errcode='22023'; end if;
  if exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) then raise exception 'El archivo sigue en Storage' using errcode='22023'; end if;
  if exists(select 1 from public.package_images where storage_path=p_path) then raise exception 'Imagen todavía asignada' using errcode='22023'; end if;
  if p_package_id is not null and asset.package_id is distinct from p_package_id then raise exception 'Imagen ajena' using errcode='22023'; end if;
  delete from public.package_assets where path=p_path;return '{}'::jsonb;
 end if;
 perform 1 from public.packages where id=p_package_id for update;
 if not found then raise exception 'Paquete inexistente' using errcode='22023'; end if;
 if p_action='reserve' then
  if p_extension is null or p_extension not in ('jpg','png','webp') then raise exception 'Formato inválido' using errcode='22023'; end if;
  insert into public.package_assets(path,package_id) values('packages/'||p_package_id||'/'||gen_random_uuid()||'.'||p_extension,p_package_id) returning * into asset;
 elsif p_action in ('complete','discard') then
  select * into asset from public.package_assets where path=p_path and package_id=p_package_id for update;
  if not found then raise exception 'Imagen ajena o inexistente' using errcode='22023'; end if;
  if p_action='complete' then
   if asset.state not in ('uploading','ready') or not exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) then raise exception 'Subida pendiente o inválida' using errcode='22023'; end if;
   update public.package_assets set state='ready' where path=p_path returning * into asset;
  else
   if exists(select 1 from public.package_images where storage_path=p_path) or exists(select 1 from public.packages where image_path=p_path) then raise exception 'Quita la imagen y guarda primero' using errcode='22023'; end if;
   update public.package_assets set state='deleting' where path=p_path returning * into asset;
  end if;
 else raise exception 'Acción inválida' using errcode='22023'; end if;
 return to_jsonb(asset);
end; $$;
revoke all on function public.manage_package_image(bigint,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.manage_package_image(bigint,text,text,text) to authenticated;

-- Reconcile only tracked package-image operations. Never delete an assigned image.
create or replace function public.reconcile_package_image(p_path text, p_finish boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.package_assets; owner_id bigint; file_exists boolean;
begin
 if auth.uid() is null or not public.is_catalog_admin() then
  raise exception 'Administrador requerido' using errcode='42501';
 end if;
 -- Same lock order as package editing: parent, then asset.
 select package_id into owner_id from public.package_assets where path=p_path;
 if owner_id is not null then perform 1 from public.packages where id=owner_id for update; end if;
 select * into asset from public.package_assets where path=p_path for update;
 if not found then return jsonb_build_object('status','resolved'); end if;
 if exists(select 1 from public.package_images where storage_path=p_path) or exists(select 1 from public.packages where image_path=p_path) then
  if asset.state='uploading' then
   if not exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) then
    raise exception 'La imagen asignada no aparece en Storage; se conserva el registro para revisión' using errcode='22023';
   end if;
   update public.package_assets set state='ready' where path=p_path;
  elsif asset.state<>'ready' then
   raise exception 'La imagen asignada tiene una eliminación pendiente; se conserva para revisión' using errcode='22023';
  end if;
  return jsonb_build_object('status','current');
 end if;
 select exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) into file_exists;
 if asset.state='ready' then return jsonb_build_object('status','ready'); end if;
 if asset.state='uploading' then
  if file_exists then
   update public.package_assets set state='ready' where path=p_path;
   return jsonb_build_object('status','recovered');
  end if;
  -- Do not cancel a fresh reservation while another tab may still be uploading.
  if asset.created_at > now()-interval '10 minutes' then
   return jsonb_build_object('status','waiting');
  end if;
  delete from public.package_assets where path=p_path;
  return jsonb_build_object('status','resolved');
 end if;
 if not file_exists then
  delete from public.package_assets where path=p_path;
  return jsonb_build_object('status','resolved');
 end if;
 if p_finish then raise exception 'El archivo sigue en Storage; la eliminación permanece pendiente' using errcode='22023'; end if;
 return jsonb_build_object('status','delete');
end; $$;
revoke all on function public.reconcile_package_image(text,boolean) from PUBLIC,anon,authenticated;
grant execute on function public.reconcile_package_image(text,boolean) to authenticated;

-- A single RPC commits package fields, items and gallery together. The optional
-- argument preserves three-argument callers that do not change the legacy image.
drop function public.update_catalog_package(bigint,jsonb,jsonb);
create function public.update_catalog_package(p_package_id bigint,p_data jsonb,p_product_ids jsonb,p_images jsonb default null)
returns bigint language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_package_id is null then raise exception 'ID requerido' using errcode='22023'; end if;
 perform public.write_catalog_package(p_package_id,p_data,p_product_ids);
 if p_images is not null then perform public.set_catalog_package_images(p_package_id,p_images); end if;
 return p_package_id;
end; $$;
revoke all on function public.update_catalog_package(bigint,jsonb,jsonb,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.update_catalog_package(bigint,jsonb,jsonb,jsonb) to authenticated;
commit;
