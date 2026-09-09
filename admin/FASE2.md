# Gestión de productos existentes

Entradas: `productos.html` y `producto-editar.html?id=2`, con rutas relativas compatibles con GitHub Pages. El dashboard enlaza el listado. No hay creación/borrado de productos ni carga de imágenes.

Se reutilizan la clave pública, almacenamiento de sesión y `requireAdmin`. El listado consulta productos con variantes y las tres taxonomías mediante SELECT paginado. Búsqueda y filtros se aplican localmente. La edición consulta el ID mediante SELECT y guarda solo diferencias mediante UPDATE de products y product_variants, solicitando la fila devuelta para detectar rechazos RLS. No usa upsert ni inserta variantes.

Los guardados son secuenciales, no una transacción atómica. Si una petición falla, se informa cuántos cambios se confirmaron y se conservan los valores del formulario. Reintentar omite los cambios ya confirmados. Una respuesta perdida puede requerir repetir un UPDATE idempotente. Evitar edición simultánea del mismo campo por varios administradores: no hay bloqueo optimista en esta fase. Navegar/recargar con cambios pendientes activa el aviso del navegador.

Precio vacío y stock vacío significan NULL; cero sigue siendo un valor definido. Nombre obligatorio, precio no negativo con dos decimales y stock entero no negativo. Publicado/destacado reflejan el valor inicial y solo se guardan al pulsar Guardar. Las variantes existentes se conservan aunque cambie la categoría: esta fase no genera ni elimina tallas automáticamente.

Pruebas locales: `node admin/test-products.mjs` y `node admin/test-auth.mjs`. Listado de 32, búsqueda, filtros, validación, cambios de campo/stock, fallo parcial y reintento/reversión probados con cliente simulado. No se alteraron registros remotos para probar. Pendiente la prueba interactiva con sesión real: abrir ID 2, anotar un campo y stock originales, cambiarlos desde UI, guardar, recargar y verificar; restaurar ambos originales y guardar. No cambiar published durante esa prueba. Comprobar también móvil y teclado.
