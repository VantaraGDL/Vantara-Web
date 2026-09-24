# Pedidos: contrato preparado para Fase 2

Fase 2: producto/conjunto, paquete y carrito usan `js/orders-api.js` desde el modal compartido. La RPC se llama solo al confirmar la salida a WhatsApp, nunca al abrir el modal ni al agregar al carrito. El mensaje usa folio, snapshots e importes del servidor. Crear sigue sin reservar ni descontar stock.

## Crear

`create_catalog_order(p_source text, p_items jsonb, p_customer_name text default null, p_customer_phone text default null, p_idempotency_key text default null)`

- `p_source`: `product` (incluye conjunto), `package` o `cart`.
- `p_items`: array de 1–100 líneas, máximo 300 variantes internas.
- Línea normal: `type: "product"`, `product_id`, `variant_id`, `quantity` (entero 1–5, limitado además por `max_quantity`).
- Línea paquete: `type: "package"`, `package_id`, `items`: array completo de objetos con `product_id` y `variant_id`. Una unidad de cada producto; sin cantidades internas.
- No enviar nombres, tallas textuales, precios ni descuentos: se obtienen del catálogo. Campos no admitidos se rechazan.
- Una configuración idéntica de paquete no puede repetirse; otras tallas sí. Se valida la demanda agregada de cada variante incluyendo líneas normales y paquetes.
- Productos y paquetes deben estar publicados, con precios conocidos y stock suficiente. El servidor toma snapshots y recalcula las ofertas, promociones y redondeo actuales.
- Devuelve el pedido creado o reutilizado: `order_id`, `id` (alias compatible), `public_code`, `status`, `subtotal`, `discount_total`, `total`, `collection_discount_total`, `items` con snapshots y `reused`.
- `subtotal` es original; `discount_total` reúne ofertas, paquetes y colección. Los importes de las líneas incorporan ofertas o descuento de paquete; la promoción de colección queda a nivel pedido.
- La distribución interna del total redondeado de un paquete utiliza centavos proporcionales acumulados. La suma coincide exactamente con el total del paquete; no se aplica oferta individual ni colección a sus componentes.
- Crear no reserva ni descuenta stock. El resultado puede diferir de una vista pública desactualizada; en Fase 2 debe presentarse el importe devuelto antes de continuar.
- `p_idempotency_key` es opcional para compatibilidad. Si se omite o es NULL, cada llamada válida crea un pedido distinto. Los pedidos históricos permanecen con clave NULL.

## Idempotencia y reintentos

El frontend conserva la clave y firma del payload en memoria y, si está disponible, en `sessionStorage` para sobrevivir a una recarga de la pestaña. No modifica el esquema de `localStorage` del carrito. Cambiar IDs, tallas, cantidades o composición inicia otra clave; un fallo de registro o apertura de WhatsApp conserva la existente. Tras iniciar correctamente la navegación a WhatsApp se retira la clave. Esto no acredita que el mensaje haya sido enviado.

- Generar `crypto.randomUUID()` una sola vez por intento lógico. La clave admite 32–200 caracteres alfanuméricos, guiones y guiones bajos, sin espacios; distingue mayúsculas/minúsculas. No usar nombres, teléfonos ni folios. Mantener la clave privada: conocerla permite recuperar la respuesta de ese intento mediante la RPC, aunque no permite listar pedidos ni modificarlos.
- Conservar y reutilizar **la misma clave** ante doble clic, timeout o respuesta perdida. No generar otra dentro de cada retry. Una operación de compra realmente nueva usa otra clave.
- Primera llamada válida: crea pedido y snapshots, devuelve `reused: false`.
- Misma clave: devuelve el mismo ID y folio, importes históricos y estado actual (`pending`, `confirmed` o `cancelled`), con `reused: true`. No recalcula, no descuenta stock y no crea otro folio.
- No se compara el payload en reintentos: cambiar artículos/contacto manteniendo la clave **no modifica** el pedido anterior. Si se cambió la compra, iniciar un intento nuevo con otra clave; no reutilizar un pedido confirmado/cancelado como compra nueva.
- Un bloqueo transaccional por clave serializa llamadas simultáneas. El índice único parcial impide duplicar claves. Si la primera operación falla, se revierte completa y el siguiente intento puede crear normalmente; si expiró esperando, reintentar con la misma clave.
- El helper original de validación/precios queda interno y sin permiso de ejecución para anon/authenticated. RLS y permisos de gestión permanecen intactos. No hay SELECT público por clave.

Ejemplo del contrato de llamada (documentación; no ejecutado):

```js
// Ejecutar una vez al iniciar el intento, fuera del handler de retry.
const idempotencyKey = crypto.randomUUID();
const payload = {
  p_source: 'product',
  p_items: [{ type: 'product', product_id: product.id, variant_id: variant.id, quantity: 1 }],
  p_customer_name: null,
  p_customer_phone: null,
  p_idempotency_key: idempotencyKey
};
// Un retry reutiliza payload sin regenerar idempotencyKey.
const { data, error } = await client.rpc('create_catalog_order', payload);
```

Respuesta: `order_id`/`id` numéricos, `public_code` generado por servidor, `status`, importes numéricos, `items` históricos y booleano `reused`. Primera creación: `status: "pending", reused: false`; retry: mismo pedido con `reused: true` y su estado vigente. Nunca asumir que el estado reutilizado sigue pendiente.

## Gestionar

`confirm_catalog_order(p_order_id bigint)` y `cancel_catalog_order(p_order_id bigint)` requieren sesión Auth y membership en `catalog_admins`.

Confirmación bloquea pedido pendiente, agrupa por variante, bloquea variantes en orden de ID, valida todas y descuenta en la misma transacción. No cambia snapshots ni recalcula precios históricos. Una variante eliminada impide confirmar. Cancelación solo cambia estado de un pendiente y no toca stock.

Lectura administrativa: `orders` y `order_items`, protegidas por RLS. Sin escritura directa para clientes, sin listado público y sin endpoint público de lectura por folio.

Los IDs de catálogo y administradores se conservan como referencias históricas sin borrado en cascada. Los items sí tienen FK al pedido. Esto permite conservar el historial aunque después se elimine un producto, variante, paquete o usuario.

La creación pública incorpora cuotas server-side de pedidos nuevos después del lookup idempotente. Un exceso devuelve HTTP 429 con `Retry-After`; conservar el payload y la clave para reintentar. Ver [order-abuse-protection.md](order-abuse-protection.md) para límites, privacidad y operación. No se introducen reservas, pagos, devoluciones ni verificación de envío de WhatsApp.
