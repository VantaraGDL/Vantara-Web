# Creación de productos

`producto-nuevo.html` carga taxonomías reales, comprueba Auth + catalog_admins y usa `create_catalog_product(p_product jsonb, p_variants jsonb) returns bigint`.

La función SECURITY INVOKER conserva RLS y restricciones. Crea producto oculto y variantes en una transacción. Rechaza campos no autorizados, tallas duplicadas/inválidas, negativos, stocks fraccionarios y relaciones inexistentes. Para Accessories admite Única; para ropa S/M/L/XL. No permite enviar published. Devuelve el ID para abrir la edición.

Pruebas reales en transacción con ROLLBACK: ropa, accesorio, NULL, cero, negativo después de una variante válida, duplicado, FK inexistente y no admin/anon. No quedan filas de prueba. Las secuencias pueden avanzar aunque la transacción se revierta: los huecos de ID son normales y no se resetean.

Pendiente prueba visual/manual con sesión en navegador. Si se pierde la respuesta de red, revisar el listado antes de repetir la creación: no hay clave de idempotencia y podría haberse confirmado la transacción. El formulario se conserva ante errores y advierte al salir con cambios. No hay imágenes ni publicación automática. No se modificó catálogo público.
