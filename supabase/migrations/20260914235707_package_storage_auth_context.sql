begin;

-- Storage checks the caller's INSERT permission using RLS before uploading,
-- then persists metadata in its internal privileged transaction. The latter
-- does not carry the end-user auth.uid() context. A trigger must not repeat
-- the API authentication check there. RPCs and package_storage_upload retain
-- their auth.uid()/is_catalog_admin() authorization without alteration.
-- This trigger only serializes the reservation against cleanup, preserving
-- the protection against a late upload recreating an already retired asset.
create or replace function public.guard_package_upload()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='package-images' then
  perform 1 from public.package_assets
   where path=new.name and state='uploading' and package_id is not null
   for update;
  if not found then
   raise exception 'La reserva de imagen ya no está disponible' using errcode='22023';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_package_upload() from PUBLIC,anon,authenticated;

commit;
