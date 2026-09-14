begin;
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
 if exists(select 1 from public.packages where image_path=p_path) then
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
commit;
