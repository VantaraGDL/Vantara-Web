# Gestión de productos existentes

Entradas: `productos.html` y `producto-editar.html?id=2`, con rutas relativas compatibles con GitHub Pages. El dashboard enlaza el listado. No hay creación/borrado de productos ni carga de imágenes.

Se reutilizan la clave pública, almacenamiento de sesión y `requireAdmin`. El listado consulta productos con variantes y las tres taxonomías mediante SELECT paginado. Búsqueda y filtros se aplican localmente. La edición consulta el ID mediante SELECT y guarda solo diferencias mediante una RPC transaccional. No usa upsert ni inserta variantes.

El guardado usa update_catalog_product(p_product_id bigint, p_changes jsonb, p_variants jsonb). Una sola transacción actualiza producto y stocks o revierte todo. SECURITY INVOKER conserva RLS y comprueba catalog_admins. No hay éxito parcial. Si se pierde la respuesta de red, el resultado puede ser desconocido; el formulario conserva valores para reintentar. No hay control optimista entre administradores: gana el último guardado del mismo campo.

Precio vacío y stock vacío significan NULL; cero sigue siendo un valor definido. Nombre obligatorio, precio no negativo con dos decimales y stock entero no negativo. Publicado/destacado reflejan el valor inicial y solo se guardan al pulsar Guardar. Las variantes existentes se conservan aunque cambie la categoría: esta fase no genera ni elimina tallas automáticamente.

Pruebas locales: `node admin/test-products.mjs` y `node admin/test-auth.mjs`. Listado de 32, búsqueda, filtros, validación, cambios de campo/stock, fallo parcial y reintento/reversión probados con cliente simulado. No se alteraron registros remotos para probar. Pendiente la prueba interactiva con sesión real: abrir ID 2, anotar un campo y stock originales, cambiarlos desde UI, guardar, recargar y verificar; restaurar ambos originales y guardar. No cambiar published durante esa prueba. Comprobar también móvil y teclado.

Pruebas RPC reales: actualización, varios stocks, NULL, cero, negativo rechazado, variante ajena con rollback de producto y stock, no admin y anon rechazados. Ejecutadas en transacción con ROLLBACK; sin residuos.
