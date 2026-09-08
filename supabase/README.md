# Preparación de Supabase y panel admin

> **Actualización 2026-09-08:** la guía vigente es [MIGRACION.md](MIGRACION.md), con esquema normalizado y snapshot en `migrations/`. No ejecutes `001_catalog.sql` junto con esas migraciones. El contenido siguiente se conserva como propuesta histórica y no es el procedimiento actual.

Estado: propuesta preparada, sin conexión ni migraciones ejecutadas. El frontend sigue usando `js/productos.js`. No existe todavía un panel conectado.

## Integración prevista

1. Crear o indicar el proyecto Supabase y aplicar `001_catalog.sql` en un entorno de prueba nuevo.
2. Crear la cuenta del administrador mediante Supabase Auth. Darle acceso insertando su UUID en `catalog_admins` desde el SQL Editor, nunca desde el navegador. La tabla solo permite a cada usuario consultar su propia pertenencia.
3. Importar el catálogo manteniendo los IDs de las URLs actuales. Tras importar IDs explícitos, ajustar la secuencia de `products` al mayor ID para evitar colisiones. Importar `images` o convertir `image` en una lista. Pasar tallas/stock a `product_variants`; accesorios sin talla usarán `Única`. Los productos con stock desconocido deben permanecer como borrador hasta confirmarlo.
4. Añadir una capa de lectura que devuelva el mismo formato actual (`sizes` y `stock` por talla incluidos), y esperar esa lectura antes de renderizar destacados, catálogo o detalle. Mostrar estados de carga, vacío y error; no presentar un catálogo local desactualizado como stock real.
5. Crear `admin/index.html`, `css/admin.css` y `js/admin.js`, manteniendo HTML/CSS/JS. Incluir inicio/cierre de sesión, listado con borradores, edición de producto, precio, fotos, tallas y existencias, y publicar/despublicar. Guardar producto y variantes en una transacción del servidor. Mostrar errores y evitar envíos duplicados.
6. Configurar un bucket de imágenes y sus políticas antes de habilitar subidas. Validar tipo y tamaño; guardar rutas o URLs permitidas. Renderizar textos del catálogo con `textContent` o escape correcto antes de aceptar datos editables del panel: las plantillas actuales usan `innerHTML` con datos locales.

En el navegador solo se configurarán la URL y la clave pública de Supabase. Las claves secretas/service_role no deben incluirse en HTML, JS ni repositorios. El acceso se decide con políticas RLS, no por ocultar botones. Los productos nacen como borradores.

## Validación necesaria antes de conectar

- Visitante: solo lee productos publicados; no puede modificar productos ni stock.
- Usuario autenticado sin membresía: mismos permisos públicos, sin acceso a borradores ni escritura.
- Administrador: puede editar productos y variantes; no puede darse acceso a otros administradores desde la API.
- No se aceptan precios ni existencias negativos. Las variantes de productos ocultos no son públicas.
- Probar vencimiento de sesión, errores de conexión, carga de imágenes y guardado transaccional.

La migración aún no se ha probado contra una base Supabase. Falta la URL del proyecto y configurar Auth y Storage. No enviar contraseñas ni claves secretas por chat.

Referencia: [Row Level Security, documentación oficial de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
