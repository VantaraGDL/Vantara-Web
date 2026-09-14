begin;
create table public.packages (
 id bigint generated always as identity primary key,
 name text not null check(length(btrim(name)) between 1 and 160),
 slug text not null unique check(length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text,
 discount_percent integer not null check(discount_percent between 1 and 99),
 published boolean not null default false,
 featured boolean not null default false,
 image_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.package_items (
 id bigint generated always as identity primary key,
 package_id bigint not null references public.packages(id) on delete cascade,
 product_id bigint not null references public.products(id) on delete restrict,
 position integer not null check(position>=0),
 unique(package_id,product_id),unique(package_id,position)
);
create index package_items_product_idx on public.package_items(product_id);
create table public.package_assets (
 path text primary key,
 package_id bigint references public.packages(id) on delete set null,
 state text not null default 'uploading' check(state in ('uploading','ready','deleting')),
 created_at timestamptz not null default now(),
 check(path ~ '^packages/[0-9]+/[0-9a-f-]{36}[.](jpg|png|webp)$')
);
create index package_assets_package_idx on public.package_assets(package_id);
alter table public.packages add constraint packages_image_fk foreign key(image_path) references public.package_assets(path) on delete restrict;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.package_assets enable row level security;
revoke all on public.packages,public.package_items,public.package_assets from PUBLIC,anon,authenticated;
revoke all on sequence public.packages_id_seq,public.package_items_id_seq from PUBLIC,anon,authenticated;
grant select on public.packages,public.package_items to anon,authenticated;
grant select on public.package_assets to authenticated;
create policy packages_read on public.packages for select to anon,authenticated using(published or public.is_catalog_admin());
create policy package_items_read on public.package_items for select to anon,authenticated using(exists(select 1 from public.packages p where p.id=package_id and (p.published or public.is_catalog_admin())));
create policy package_assets_read on public.package_assets for select to authenticated using(public.is_catalog_admin());
-- Writes are only through admin-checked atomic RPCs; no direct client DML privileges.
create function public.check_package_items() returns trigger language plpgsql security definer set search_path='' as $$
declare target bigint;
begin
 if tg_table_name='packages' then target:=new.id;
 elsif tg_op='DELETE' then target:=old.package_id; else target:=new.package_id; end if;
 if exists(select 1 from public.packages where id=target) and (select count(*) from public.package_items where package_id=target)<2 then
 raise exception 'Un paquete requiere al menos dos productos' using errcode='23514'; end if;
 if tg_table_name='package_items' and tg_op='UPDATE' then
  if old.package_id<>new.package_id and exists(select 1 from public.packages where id=old.package_id) and (select count(*) from public.package_items where package_id=old.package_id)<2 then
   raise exception 'Un paquete requiere al menos dos productos' using errcode='23514';
  end if;
 end if;
 return null;
end; $$;
revoke all on function public.check_package_items() from PUBLIC,anon,authenticated;
create constraint trigger package_minimum after insert or update on public.packages deferrable initially deferred for each row execute function public.check_package_items();
create constraint trigger package_items_minimum after insert or update or delete on public.package_items deferrable initially deferred for each row execute function public.check_package_items();

create function public.write_catalog_package(p_id bigint,p_data jsonb,p_product_ids jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r public.packages; k text; v jsonb; ids bigint[]:='{}'; product_key bigint; old_path text; image_state text;
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
 r:=jsonb_populate_record(r,p_data);
 r.name:=btrim(r.name);r.slug:=lower(btrim(r.slug));
 if r.name is null or r.slug is null or r.discount_percent is null then raise exception 'Completa nombre, slug y descuento' using errcode='22023'; end if;
 if r.image_path is not null then
  select state into image_state from public.package_assets where path=r.image_path and package_id=p_id for update;
  if image_state is distinct from 'ready' then raise exception 'Imagen no disponible o ajena al paquete' using errcode='22023'; end if;
 end if;
 if p_id is null then
  if coalesce(r.published,false) then raise exception 'Los paquetes nuevos se crean ocultos' using errcode='22023'; end if;
  insert into public.packages(name,slug,description,discount_percent,featured,published)
  values(r.name,r.slug,r.description,r.discount_percent,coalesce(r.featured,false),false) returning id into p_id;
 else
  update public.packages set name=r.name,slug=r.slug,description=r.description,discount_percent=r.discount_percent,
   featured=r.featured,published=r.published,image_path=r.image_path,updated_at=now() where id=p_id;
  if old_path is distinct from r.image_path and old_path is not null then update public.package_assets set state='deleting' where path=old_path; end if;
  delete from public.package_items where package_id=p_id;
 end if;
 insert into public.package_items(package_id,product_id,position) select p_id,id,(ord-1)::integer from unnest(ids) with ordinality as x(id,ord);
 return p_id;
end; $$;
revoke all on function public.write_catalog_package(bigint,jsonb,jsonb) from PUBLIC,anon,authenticated;
create function public.create_catalog_package(p_data jsonb,p_product_ids jsonb) returns bigint language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 return public.write_catalog_package(null,p_data,p_product_ids);
end; $$;
create function public.update_catalog_package(p_package_id bigint,p_data jsonb,p_product_ids jsonb) returns bigint language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_package_id is null then raise exception 'ID requerido' using errcode='22023'; end if;
 return public.write_catalog_package(p_package_id,p_data,p_product_ids);
end; $$;
create function public.delete_catalog_package(p_package_id bigint,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_confirmation is distinct from 'ELIMINAR' then raise exception 'Escribe ELIMINAR' using errcode='22023'; end if;
 perform 1 from public.packages where id=p_package_id for update;
 if not found then raise exception 'Paquete inexistente' using errcode='22023'; end if;
 update public.packages set image_path=null where id=p_package_id;
 update public.package_assets set state='deleting' where package_id=p_package_id;
 delete from public.packages where id=p_package_id;
end; $$;
revoke all on function public.create_catalog_package(jsonb,jsonb),public.update_catalog_package(bigint,jsonb,jsonb),public.delete_catalog_package(bigint,text) from PUBLIC,anon,authenticated;
grant execute on function public.create_catalog_package(jsonb,jsonb),public.update_catalog_package(bigint,jsonb,jsonb),public.delete_catalog_package(bigint,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('package-images','package-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy package_storage_read on storage.objects for select to anon,authenticated using(bucket_id='package-images' and (public.is_catalog_admin() or exists(select 1 from public.packages p where p.published and p.image_path=storage.objects.name)));
create policy package_storage_upload on storage.objects for insert to authenticated with check(bucket_id='package-images' and public.is_catalog_admin() and exists(select 1 from public.package_assets a where a.path=storage.objects.name and a.state='uploading' and a.package_id is not null));
create policy package_storage_delete on storage.objects for delete to authenticated using(bucket_id='package-images' and public.is_catalog_admin() and exists(select 1 from public.package_assets a where a.path=storage.objects.name and a.state='deleting'));
-- Serialize a late upload against retirement/cleanup of its reserved asset.
create function public.guard_package_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='package-images' then
  if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
  perform 1 from public.package_assets where path=new.name and state='uploading' and package_id is not null for update;
  if not found then raise exception 'La reserva de imagen ya no está disponible' using errcode='22023'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.guard_package_upload() from PUBLIC,anon,authenticated;
create trigger package_upload_reservation before insert on storage.objects for each row when(new.bucket_id='package-images') execute function public.guard_package_upload();
create function public.manage_package_image(p_package_id bigint,p_action text,p_path text default null,p_extension text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.package_assets;
begin
 if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
 if p_action='finish_delete' then
  select * into asset from public.package_assets where path=p_path and state='deleting' for update;
  if not found then raise exception 'Eliminación no registrada' using errcode='22023'; end if;
  if exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) then raise exception 'El archivo sigue en Storage' using errcode='22023'; end if;
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
   if asset.state<>'uploading' or not exists(select 1 from storage.objects where bucket_id='package-images' and name=p_path) then raise exception 'Subida pendiente o inválida' using errcode='22023'; end if;
   update public.package_assets set state='ready' where path=p_path returning * into asset;
  else
   if exists(select 1 from public.packages where image_path=p_path) then raise exception 'Quita la imagen y guarda primero' using errcode='22023'; end if;
   update public.package_assets set state='deleting' where path=p_path returning * into asset;
  end if;
 else raise exception 'Acción inválida' using errcode='22023'; end if;
 return to_jsonb(asset);
end; $$;
revoke all on function public.manage_package_image(bigint,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.manage_package_image(bigint,text,text,text) to authenticated;
-- Phase B pricing: original prices only; no individual or collection discounts.
create function public.get_catalog_package_price(p_package_id bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('complete_price',count(p.id)=count(i.id) and count(p.price)=count(i.id),
 'original_subtotal',case when count(p.id)=count(i.id) and count(p.price)=count(i.id) then sum(p.price) else null end,
 'discount_percent',k.discount_percent,
 'final_total',case when count(p.id)=count(i.id) and count(p.price)=count(i.id) then round(sum(p.price)*(100-k.discount_percent)/100) else null end)
 from public.packages k join public.package_items i on i.package_id=k.id left join public.products p on p.id=i.product_id
 where k.id=p_package_id group by k.id,k.discount_percent;
$$;
revoke all on function public.get_catalog_package_price(bigint) from PUBLIC,anon,authenticated;
grant execute on function public.get_catalog_package_price(bigint) to anon,authenticated;
commit;
