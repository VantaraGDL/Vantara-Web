-- Ejecutar como postgres desde SQL Editor después de ambas migraciones.
select (select count(*) from public.products) products,
       (select count(*) from public.product_variants) variants,
       (select count(*) from public.product_images) images,
       (select count(*) from public.product_variants where stock is not null) known_stock;
begin;
do $$ begin
  assert (select count(*) from public.collections) = 9, 'Colecciones incorrectas';
  assert (select count(*) from public.products where color is not null) = 14, 'Colores incorrectos';
  assert (select count(*) from public.products) = 32, 'Snapshot de productos incorrecto';
  assert (select count(*) from public.product_variants) = 104, 'Variantes incorrectas';
  assert (select count(*) from public.product_images) = 33, 'Imágenes incorrectas';
  assert (select count(*) from public.product_variants where stock is not null) = 4, 'Stock incorrecto';
  assert not exists (select 1 from public.products where published), 'Ejecutar antes de publicar';
end $$;
-- Con todos los productos ocultos, ninguna taxonomía debe ser pública.
set local role anon;
do $ declare t text; n bigint; begin
  foreach t in array array['brands','categories','collections','products','product_variants','product_images'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, 'Datos ocultos expuestos: ' || t;
  end loop;
end $;
reset role;
-- Un producto publicado temporalmente para comprobar acceso a sus hijos.
update public.products set published = true where id = 2;
set local role anon;
do $$ begin
  assert (select count(*) from public.brands) = 1, 'RLS marcas';
  assert (select count(*) from public.categories) = 1, 'RLS categorías';
  assert (select count(*) from public.collections) = 1, 'RLS colecciones';
  assert (select count(*) from public.products) = 1, 'RLS productos';
  assert (select count(*) from public.product_variants) = 4, 'RLS variantes';
  assert (select count(*) from public.product_images) = 1, 'RLS imágenes';
  assert not has_table_privilege(current_user, 'public.products', 'INSERT'), 'Anon puede insertar';
end $$;
-- Intentos reales de escritura, además de inspección de privilegios.
-- Solo insufficient_privilege cuenta como bloqueo válido.
do $ declare t text; op text; statement text; blocked boolean; begin
  foreach t in array array['catalog_admins','brands','categories','collections','products','product_variants','product_images'] loop
    foreach op in array array['INSERT','UPDATE','DELETE'] loop
      assert not has_table_privilege(current_user, 'public.' || t, op),
        'Privilegio anónimo inesperado: ' || t || ' ' || op;
      statement := case op
        when 'INSERT' then format('insert into public.%I default values', t)
        when 'UPDATE' then format('update public.%I set %I = %I',
          t, case when t = 'catalog_admins' then 'user_id' else 'id' end,
          case when t = 'catalog_admins' then 'user_id' else 'id' end)
        else format('delete from public.%I', t) end;
      blocked := false;
      begin
        execute statement;
      exception when insufficient_privilege then blocked := true;
      end;
      assert blocked, 'Escritura anónima permitida: ' || t || ' ' || op;
    end loop;
  end loop;
end $;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n integer; begin
  assert not public.is_catalog_admin(), 'Usuario inesperadamente administrador';
  update public.products set name = 'NO DEBE CAMBIAR' where id = 2;
  get diagnostics n = row_count;
  assert n = 0, 'Usuario normal puede editar';
  assert not has_table_privilege(current_user, 'public.catalog_admins', 'INSERT'), 'Usuario puede darse permisos';
end $$;
reset role;
rollback;
