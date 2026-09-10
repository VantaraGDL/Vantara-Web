begin;
-- Private bucket: anonymous reads are limited by the linked published product.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,5242880,array['image/jpeg','image/png','image/webp']);
alter table public.products add column deletion_pending boolean not null default false;
alter table public.products add constraint deleting_product_hidden check(not deletion_pending or not published);
alter table public.product_images add column bucket_id text;
alter table public.product_images add column media_state text not null default 'ready'
  check(media_state in ('uploading','ready','deleting'));
alter table public.product_images add constraint product_image_storage_path check(bucket_id is null or
  (bucket_id='product-images' and path ~ ('^products/' || product_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')));
create unique index product_image_object_unique on public.product_images(bucket_id,path) where bucket_id is not null;
alter table public.product_images drop constraint product_images_product_id_position_key;
alter table public.product_images add constraint product_images_product_id_position_key unique(product_id,position) deferrable initially immediate;
drop policy public_images on public.product_images;
create policy public_images on public.product_images for select to anon,authenticated using
  (media_state='ready' and exists(select 1 from public.products p where p.id=product_id and p.published));

-- Internal safety checks need to see Storage metadata regardless of caller read policy.
-- Never delete storage.objects through SQL: physical deletion belongs to the Storage API.
create function public.catalog_object_exists(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from storage.objects where bucket_id='product-images' and name=p_path);
$$;
revoke all on function public.catalog_object_exists(text) from PUBLIC,anon,authenticated;

create function public.catalog_media_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='products' then
    if exists(select 1 from storage.objects where bucket_id='product-images' and name like 'products/'||old.id||'/%') then
      raise exception 'Primero elimina los archivos de Storage' using errcode='22023';
    end if;
    if not old.deletion_pending then raise exception 'Inicia el borrado seguro' using errcode='22023'; end if;
    return old;
  end if;
  if tg_op='DELETE' then
    if old.bucket_id is not null and public.catalog_object_exists(old.path) then
      raise exception 'El archivo aún existe; reintenta su eliminación' using errcode='22023';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and (new.path is distinct from old.path or new.product_id<>old.product_id or new.bucket_id is distinct from old.bucket_id) then
    raise exception 'La ruta y el producto de una imagen son inmutables' using errcode='22023';
  end if;
  if new.media_state<>'deleting' and exists(select 1 from public.products where id=new.product_id and deletion_pending) then
    raise exception 'Producto en proceso de borrado' using errcode='22023';
  end if;
  if new.bucket_id is not null and new.media_state='ready' and not public.catalog_object_exists(new.path) then
    raise exception 'La subida no se ha completado' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.catalog_media_guard() from PUBLIC,anon,authenticated;
create trigger product_delete_storage_guard before delete on public.products for each row execute function public.catalog_media_guard();
create trigger image_storage_guard before insert or update or delete on public.product_images for each row execute function public.catalog_media_guard();

create policy catalog_storage_read on storage.objects for select to anon,authenticated using
 (bucket_id='product-images' and (public.is_catalog_admin() or exists(
   select 1 from public.product_images i join public.products p on p.id=i.product_id
   where i.bucket_id=storage.objects.bucket_id and i.path=storage.objects.name and i.media_state='ready' and p.published)));
create policy catalog_storage_insert on storage.objects for insert to authenticated with check
 (bucket_id='product-images' and public.is_catalog_admin() and exists(
   select 1 from public.product_images i join public.products p on p.id=i.product_id
   where i.bucket_id=storage.objects.bucket_id and i.path=storage.objects.name and i.media_state='uploading' and not p.deletion_pending));
create policy catalog_storage_update on storage.objects for update to authenticated using
 (bucket_id='product-images' and public.is_catalog_admin() and exists(select 1 from public.product_images i where i.bucket_id=storage.objects.bucket_id and i.path=storage.objects.name and i.media_state='uploading'))
 with check(bucket_id='product-images' and public.is_catalog_admin() and exists(select 1 from public.product_images i join public.products p on p.id=i.product_id where i.bucket_id=storage.objects.bucket_id and i.path=storage.objects.name and i.media_state='uploading' and not p.deletion_pending));
create policy catalog_storage_delete on storage.objects for delete to authenticated using
 (bucket_id='product-images' and public.is_catalog_admin() and exists(select 1 from public.product_images i
   where i.bucket_id=storage.objects.bucket_id and i.path=storage.objects.name and i.media_state='deleting'));

create function public.manage_catalog_media(p_product_id bigint,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products; im public.product_images; ext text; img_id bigint; n integer; ids bigint[];
begin
  if auth.uid() is null or not public.is_catalog_admin() then raise exception 'Administrador requerido' using errcode='42501'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto inexistente' using errcode='22023'; end if;
  if p_action='reserve' then
    if p.deletion_pending then raise exception 'Producto en borrado' using errcode='22023'; end if;
    ext:=p_payload->>'extension';
    if ext is null or ext not in ('jpg','png','webp') then raise exception 'Formato inválido' using errcode='22023'; end if;
    insert into public.product_images(product_id,path,bucket_id,media_state,alt,position)
    values(p.id,'products/'||p.id||'/'||gen_random_uuid()::text||'.'||ext,'product-images','uploading',p.name,
      coalesce((select max(position)+1 from public.product_images where product_id=p.id),0)) returning * into im;
    return to_jsonb(im);
  elsif p_action in ('complete','begin_image_delete','finish_image_delete') then
    select * into im from public.product_images where product_id=p.id and id=(p_payload->>'image_id')::bigint for update;
    if not found then raise exception 'Imagen inexistente o de otro producto' using errcode='22023'; end if;
    if p_action='complete' then
      if im.media_state='deleting' or p.deletion_pending then raise exception 'Imagen en eliminación' using errcode='22023'; end if;
      update public.product_images set media_state='ready' where id=im.id;
    elsif p_action='begin_image_delete' then
      update public.product_images set media_state='deleting' where id=im.id;
    else
      if im.media_state<>'deleting' then raise exception 'Confirma la eliminación primero' using errcode='22023'; end if;
      delete from public.product_images where id=im.id;
    end if;
    return to_jsonb(im);
  elsif p_action='reorder' then
    if p.deletion_pending then raise exception 'Producto en borrado' using errcode='22023'; end if;
    if jsonb_typeof(p_payload->'ids') is distinct from 'array' then raise exception 'Orden inválido' using errcode='22023'; end if;
    select array_agg(value::bigint) into ids from jsonb_array_elements_text(p_payload->'ids');
    select count(*) into n from public.product_images where product_id=p.id;
    if coalesce(cardinality(ids),0)<>n or (select count(distinct x) from unnest(ids) x)<>n or exists(
      select 1 from unnest(ids) x where not exists(select 1 from public.product_images where id=x and product_id=p.id)) then
      raise exception 'El conjunto de imágenes cambió. Recarga antes de ordenar.' using errcode='22023'; end if;
    set constraints public.product_images_product_id_position_key deferred;
    update public.product_images i set position=o.ord-1 from unnest(ids) with ordinality o(id,ord) where i.id=o.id and i.product_id=p.id;
    set constraints public.product_images_product_id_position_key immediate;
    return jsonb_build_object('ok',true);
  elsif p_action='begin_product_delete' then
    if p_payload->>'confirmation' is distinct from ('ELIMINAR '||p.id) then raise exception 'Confirmación incorrecta' using errcode='22023'; end if;
    update public.products set published=false,deletion_pending=true where id=p.id;
    update public.product_images set media_state='deleting' where product_id=p.id;
    return jsonb_build_object('ok',true);
  elsif p_action='finish_product_delete' then
    if p_payload->>'confirmation' is distinct from ('ELIMINAR '||p.id) or not p.deletion_pending then raise exception 'Confirmación incorrecta' using errcode='22023'; end if;
    delete from public.products where id=p.id;
    return jsonb_build_object('ok',true);
  else raise exception 'Acción inválida' using errcode='22023';
  end if;
end $$;
revoke all on function public.manage_catalog_media(bigint,text,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.manage_catalog_media(bigint,text,jsonb) to authenticated;
commit;
