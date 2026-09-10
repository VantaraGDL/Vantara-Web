# Lectura pública desde Supabase

El frontend usa módulos nativos compatibles con GitHub Pages. `productos.js` se conserva intacto,
pero las tres páginas ya no lo cargan ni lo utilizan como respaldo.

## Archivos

- `js/catalog-api.js`: peticiones REST de solo lectura, paginación y adaptación de productos.
- `js/catalog-logic.js`: stock por variante, límites, descuentos y escape de texto.
- `js/product-ui.js`: tarjetas y selección de imágenes extraídas del código anterior.
- `js/home.js`: destacados publicados, carga, estado vacío y error.
- `js/catalogo.js` y `js/producto.js`: carga asíncrona; conservan filtros, visor y flujo de pedido.
- `index.html`, `catalogo.html`, `producto.html`: entradas de módulos.
- `js/test-catalog.mjs`: pruebas no visuales con datos simulados (`node js/test-catalog.mjs`).

La URL y Publishable Key se reutilizan desde `admin/js/config.js`, que solo contiene configuración
pública. No se importa Auth, no se lee la sesión de administrador ni se envía su JWT. Todas las
consultas usan `published=eq.true` además de RLS. No se escribe en Supabase desde estas páginas.

## Formato compatible

Las relaciones se convierten a `brand` (nombre), `category` (ID compatible con filtros),
`collection` (ID), `sizes` y `stock`. También se conservan `variants` y las reglas de colección.
Para prendas se muestra cada variante existente; para productos sin talla se utiliza su variante
Única internamente. NULL significa pendiente, cero agotado; pendiente permite consultar hasta
el máximo configurado, pero no cuenta como existencia confirmada en el filtro de stock.

La colección aporta nombre, activación, importe y mínimo de piezas. Se aplica un descuento fijo
por colección al alcanzar el mínimo, incluso con varias unidades del mismo modelo. Si falta algún
precio, el total sigue por confirmar. El pedido sigue mostrando el mensaje del flujo anterior;
no reserva inventario ni implementa compra/pago.

Las imágenes `ready` se ordenan por `position`. Las históricas conservan sus rutas `assets/img/...`
relativas al proyecto. Las del bucket privado se descargan mediante la API de Storage con clave
pública y RLS, y se muestran como URL de objeto temporal. No se generan enlaces públicos que
eludan las políticas. Un fallo de imagen muestra el recurso pendiente y un aviso; un fallo de
catálogo muestra error, nunca productos del archivo histórico.

## Prueba manual sugerida (sin publicar todo)

Prueba la copia con estos cambios servida por HTTP; los módulos no funcionan abriendo `file://`.
Las rutas respetan el subdirectorio `/Vantara-Web/`. No se ha hecho commit ni despliegue.

1. Con cero publicados, home y catálogo deben mostrar sus estados vacíos. Abrir
   `producto.html?id=2` debe indicar producto no disponible.
2. En el admin publica **solo ID 2, Essentials Hoodie Light Oatmeal**. Debe aparecer en catálogo
   y destacados. No debe mostrarse Arma tu conjunto todavía. El stock actual es S=1, M=2, L=0,
   XL=1: L deshabilitada, límites por talla y contador reiniciado al cambiar talla.
3. Publica **ID 8, Essentials T-shirt Light Oatmeal**. Deben aparecer dos productos en catálogo,
   pero solo la hoodie en destacados. Busca Light Oatmeal o filtra Hoodies/Playeras y Essentials.
   El filtro de existencias debe incluir la hoodie y excluir la playera (sus stocks son NULL).
4. Abre ID 2: ID 8 debe aparecer en relacionados y Arma tu conjunto, sin repetir ID 2 dentro del
   conjunto. Selecciona una talla para cada prenda: 999 + 899 − 150 = **1,748 MXN** para una pieza
   de cada una. Al desmarcar la playera debe quedar únicamente la hoodie. Las tallas pendientes
   de la playera deben poder seleccionarse sin anunciarlas como agotadas.
5. Comprueba fotos históricas, miniaturas y visor. Para el caso Storage puedes añadir desde el
   admin una imagen a uno de esos dos productos, guardar su orden/principal y recargar su página
   pública. Debe mostrarse junto con las históricas y funcionar dentro del visor. Retira la imagen
   añadida al finalizar si era de prueba; no borres la referencia histórica.
6. Oculta ID 8 y recarga: debe desaparecer del catálogo, relacionados y conjunto; su URL directa
   debe indicar no disponible. Oculta ID 2 al terminar si deseas volver al estado inicial de cero
   publicados.

## Verificación realizada

Pruebas no visuales: 0/1/2 productos, ocultos, destacados, búsqueda por color y alias de categoría,
filtros, orden, stock NULL/0/Única, cantidades, relacionados, conjunto y configuración de descuento,
imágenes repo/Storage ordenadas, errores de catálogo/imagen, paginación y entradas de módulos.
Una petición HTTP real anónima con la clave pública confirmó **0 productos publicados**.
Los casos de 1/2 publicados y fotos Storage se probaron con respuestas simuladas; su comprobación
visual contra Supabase queda a cargo del administrador. No se publicaron ni modificaron registros.
