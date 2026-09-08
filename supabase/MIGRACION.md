# Migración preparada — 8 de septiembre de 2026

El sitio continúa leyendo `js/productos.js`. Estos archivos NO conectan el navegador a Supabase ni publican productos. No se ha ejecutado SQL en un proyecto remoto.

## Auditoría del proyecto

Frontend estático: cinco páginas HTML, CSS y JavaScript vanilla; sin backend ni compilación. `productos.js` contiene los datos, tarjetas y helpers compartidos; `catalogo.js` filtra y ordena; `producto.js` gestiona tallas, cantidades, conjunto, descuento, galería y mensaje. `menu.js` controla el menú móvil. Sigue siendo compatible con GitHub Pages.

Snapshot: **32 productos**, **3 marcas** (18 Essentials, 6 Alo, 8 Van Cleef), **6 categorías**, **9 colecciones**, **33 imágenes**, **3 destacados** (IDs 1, 2, 9). Se preservan IDs, nombres, precios, rutas y orden del array; no se recuperan productos eliminados. Oro-Verde conserva sus dos fotos.

Campos presentes: `id`, `name`, `brand`, `category`, `model`, `color`, `price`, `material`, `description`, `images`, `sizes`, `stock`, `collection`, `featured`. La lógica también admite `finish`, imagen individual `image` y stock numérico global, aunque no aparecen en el snapshot. Los campos faltantes se guardan como NULL, sin inventar descripciones. Se conservan literalmente valores como `Pendiente`, `...`, `Strech Lim`, `Light Health` y colores heredados.

Solo el ID 2 tiene inventario por talla: S=1, M=2, L=0, XL=1. Las otras 31 referencias no tienen stock registrado. El frontend asume S/M/L/XL para ropa sin `sizes`; las pulseras tienen `sizes: []`. El seed materializa estas opciones: 96 variantes de ropa y 8 variantes internas Única. Única no implica mostrar un selector de talla ni confirmar existencia.

El catálogo usa categoría, marca, búsqueda y orden; la búsqueda incluye material/color/finish. El orden recomendado combina marca, categoría y orden original. La imagen 0 es principal y la 1 sirve para hover. Los destacados alimentan el inicio. Al volver al catálogo se conserva la categoría del producto.

Cada producto permite hasta 5 piezas, sujeto al stock cuando existe. Cambiar de talla reinicia la cantidad. Arma tu conjunto relaciona productos por el mismo `collection`, mantiene al principal independiente y no aparece sin compañeros. Cada selección tiene talla y cantidad propias. El descuento actual es **$150 MXN una vez por colección con al menos 2 piezas**, incluidas dos del mismo modelo; no es $150 por pareja. Solo se calcula cuando todos los precios son conocidos; el total nunca baja de cero. El pedido actual muestra un mensaje mediante alert/console: no hay pagos, carrito persistente ni reserva de inventario.

## Tablas y correspondencia

| Tabla | Uso |
|---|---|
| brands | IDs de marca conservan los valores actuales; nombre y orden |
| categories | IDs compatibles (`T-Shirts`, `Accessories`, etc.), etiqueta y orden |
| collections | Slug actual, nombre y descuento configurable (150, mínimo 2 piezas) |
| products | Datos descriptivos, precio MXN, referencias a taxonomías, destacado, published, orden, requiere talla y máximo 5 |
| product_variants | Opciones por producto, orden y stock nullable |
| product_images | Rutas y texto alternativo, orden independiente; posición 0 principal |
| catalog_admins | Usuarios de Auth autorizados como administradores |

`published=false` significa oculto; todos se importan así. `featured` se conserva y es independiente de publicación. Precio NULL significa pendiente; no equivale a cero. El inventario tiene una única fuente: `product_variants.stock`. NULL significa pendiente, cero agotado y los negativos están prohibidos. Cada talla de ropa tiene su propia variante; las pulseras usan Única con requires_size=false. No existen inventory_mode ni total_stock en products. El generador rechaza stock global en ropa por ser ambiguo y solo permite convertirlo directamente cuando el producto no tiene tallas.

Las claves foráneas impiden referencias inexistentes. Eliminar un producto elimina variantes e imágenes; eliminar una marca/categoría/colección en uso está bloqueado. Los archivos físicos de imagen no se eliminan. Las rutas siguen siendo relativas a GitHub Pages, sin moverlas a Storage.

## Seguridad

RLS está habilitado en todas las tablas. Visitantes y usuarios normales solo leen productos publicados y sus imágenes/variantes. Las marcas, categorías y colecciones (incluidas sus reglas de descuento) solo son públicas si tienen al menos un producto publicado. Se revocan explícitamente privilegios de PUBLIC, anon y authenticated en tablas y secuencias antes de otorgar los permisos mínimos. Solo miembros de catalog_admins pueden modificar el catálogo; un usuario normal no puede darse ese permiso. La membresía se gestiona desde SQL Editor, no desde el navegador ni metadata editable de Auth. No se crean usuarios ni contraseñas.

Para conectar el frontend más adelante se usará únicamente URL de proyecto y clave publishable/anon pública, protegidas por RLS. Nunca service-role ni secret key en GitHub Pages. RLS autoriza lecturas/escrituras: no valida un total calculado por el navegador ni reserva stock. Si se incorporan compras reales hará falta cálculo y reserva transaccional del lado servidor. También habrá que escapar los datos remotos donde hoy se usa innerHTML.

## Aplicación en Supabase

1. Crea un proyecto de Supabase y abre SQL Editor. Usa una base nueva sin estas tablas. **No ejecutes `001_catalog.sql`**: es una propuesta anterior con estructura distinta. Si ya lo aplicaste, detente y prepara una migración incremental sobre ese esquema; estos archivos no borran ni convierten tablas existentes.
2. Ejecuta completo `migrations/20260908000100_catalog_schema.sql`.
3. Ejecuta completo `migrations/20260908000200_catalog_seed.sql` una sola vez. Cada archivo tiene su propia transacción. Si el segundo falla puedes corregirlo y repetirlo; no repitas el primero si ya se aplicó.
4. Ejecuta `verify.sql`. Debe mostrar 32 productos, 104 variantes, 33 imágenes y 4 valores de stock conocidos. Comprueba las pruebas RLS: terminan con ROLLBACK y no publican datos permanentemente.
5. Revisa los borradores en Table Editor. No es necesario activar Auth ni proporcionar ninguna clave para completar esta fase.
6. Más adelante, crea tu usuario mediante Supabase Auth y registra su UUID real desde SQL Editor: `insert into public.catalog_admins(user_id) values ('UUID-REAL-DEL-USUARIO');`. No utilices ese texto de ejemplo literalmente. Nunca permitas que el formulario público añada administradores.
7. Cuando se prepare y pruebe el adaptador del frontend, publica solo IDs revisados, por ejemplo `update public.products set published = true where id = 2;`. Esto por ahora NO afecta al sitio, que sigue leyendo productos.js.

Alternativa CLI: estos archivos usan nombres de migración con timestamp y pueden aplicarse mediante Supabase CLI una vez inicializado/vinculado el proyecto. Elige SQL Editor o CLI y mantén un único historial; el SQL Editor no registra automáticamente el historial del CLI. No mezcles ambos sin reconciliarlo.

## Próxima fase, no implementada

El adaptador asíncrono deberá ordenar por position, reconstruir brand/category/collection desde sus IDs, ordenar images y sizes, devolver sizes=[] si requires_size=false, y obtener siempre el stock desde variantes, conservando NULL como pendiente. Para artículos sin talla consultará la variante Única. No deberá convertir pendientes a cero. Reutilizará la lógica actual después de cargar datos; aún no se añade SDK ni solicitudes de red. Consultará las reglas de collections en vez del importe hardcodeado. Las marcas visibles en cada categoría deberán derivarse de productos publicados, no de todas las filas de brands.

## Verificación local y límites

El generador `node supabase/generate-seed.cjs` extrae solo el array y valida que las 33 rutas existan. Genera el snapshot SQL sin cambiar el catálogo. No regenerar una migración ya aplicada: crear otra migración para cambios posteriores. La base no se ha probado contra una instancia PostgreSQL/Supabase en este equipo; `verify.sql` permite verificar restricciones y RLS al aplicarla. El frontend no se modifica.

Referencias oficiales: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [usuarios Auth](https://supabase.com/docs/guides/auth/managing-user-data), [migraciones e historial](https://supabase.com/docs/guides/deployment/database-migrations).


## Auditoría tras simplificar inventario

El snapshot mantiene 32 productos ocultos, 14 colores, 9 colecciones, 104 variantes (100 stocks NULL y cuatro definidos) y 33 imágenes. verify.sql comprueba taxonomías ocultas, lectura relacionada con un producto publicado temporalmente y 21 intentos de INSERT/UPDATE/DELETE como anon sobre las siete tablas, además del bloqueo de edición de un usuario no administrador. Todo termina con ROLLBACK. Si una prueba falla, ejecutar ROLLBACK antes de continuar. Las pruebas SQL quedan preparadas, no ejecutadas.

### Prueba positiva posterior de administrador

Después de crear un usuario real en Auth y añadir su UUID a catalog_admins desde SQL Editor, ejecutar en una transacción: BEGIN; establecer request.jwt.claims mediante set_config con sub igual al UUID real y role authenticated; SET LOCAL ROLE authenticated; comprobar que is_catalog_admin() devuelve true y que puede leer los 32 borradores. Probar INSERT/UPDATE/DELETE de una marca temporal sin productos relacionados y UPDATE de un producto; finalizar con RESET ROLE; ROLLBACK;. No se crea ningún administrador en el seed.
