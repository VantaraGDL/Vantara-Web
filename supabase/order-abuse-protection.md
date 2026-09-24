# Protección de creación de pedidos

## Arquitectura elegida

`create_catalog_order` sigue siendo la entrada anónima. Después de recuperar un
pedido idempotente, y solamente si hace falta crear uno nuevo, llama a
`order_security.consume_creation_slot()`. No existe una entrada pública sin ese
control: el helper original permanece sin EXECUTE para PUBLIC/anon/authenticated.
El contrato y los snapshots, validaciones, precios, paquetes y stock no cambian.

Opciones evaluadas:

- Edge Function + contador persistente: viable, pero añade un despliegue y una
  llamada servidor/DB; obligaría a restringir la RPC pública. No es necesaria
  para limitar nuevas creaciones en esta arquitectura.
- Límites del gateway/Auth: no se asumen como una cuota configurable para esta
  RPC. Los límites de Auth no sustituyen este control.
- PostgreSQL: elegido. Supabase documenta controles de cuota y contexto de la
  petición en la Data API. Integrarlo dentro de la RPC también protege su
  invocación directa, sin configurar un hook global que afecte otras rutas.

Fuentes oficiales consultadas:
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/functions/examples/rate-limiting
- https://supabase.com/docs/guides/cron/install

## Política inicial

Ventanas móviles, no ventanas fijas de reloj:

| Alcance | 10 minutos | 1 hora |
| --- | ---: | ---: |
| Identificador de red | 6 pedidos nuevos | 20 pedidos nuevos |
| Proyecto completo | 60 pedidos nuevos | 300 pedidos nuevos |

Son límites de NUEVOS pedidos registrados correctamente. Se eligieron como
política inicial para un ecommerce pequeño, no a partir de mediciones de tráfico:
permiten varias compras legítimas y redes compartidas, pero acotan una ráfaga
automatizada. El techo global tiene margen diez veces mayor en la ventana corta.
Si las ventas legítimas se acercan a estos límites, revisar la política antes de
una campaña. Los valores están definidos únicamente en la función SQL.

Las peticiones concurrentes adquieren el mismo bloqueo transaccional para contar
y consumir un cupo; el bloqueo se mantiene hasta commit/rollback. Una creación
rechazada por validación revierte también su cupo. Un retry con pedido existente
retorna antes del límite y no consume otro cupo, aunque el catálogo haya cambiado.
Un exceso devuelve HTTP 429 con `Retry-After` hasta que se libere el cupo de las
ventanas activas. El frontend conserva clave/payload y muestra un mensaje neutral.

## Identificación, privacidad y límites de la protección

Se usa `request.headers.x-forwarded-for` según el patrón documentado por Supabase
para la Data API alojada, nunca un parámetro suministrado a la RPC. IPv4 se
normaliza; IPv6 se agrupa por /64 para evitar que direcciones temporales del mismo
prefijo generen un cupo independiente cada vez. Cabeceras ausentes o inválidas
comparten un cupo `unknown-network`, no quedan exentas.

Una cabecera reenviada NO prueba una identidad: proxies, VPNs, rotación de IP o
una cabecera falsificada pueden debilitar la cuota por red. Por eso el límite
global es obligatorio y no depende de ninguna cabecera ni identidad elegida por
el cliente. Una IP compartida comparte cupo. Un ataque distribuido puede agotar
el cupo global y provocar esperas a compradores legítimos; no se promete defensa
integral frente a DDoS. Los requests inválidos o los retries de pedidos existentes
no quedan limitados por este contador de nuevas creaciones. Si se necesita frenar
también todo ese tráfico, hace falta control antes de DB, en una entrada Edge/
gateway cuya ruta directa esté cerrada, con identificación de red confiable.

No se almacena IP en `orders`, ni se relaciona el contador con folios/clientes.
Solo se guarda HMAC-SHA256 de la red y la hora en un esquema privado. La clave
aleatoria de 32 bytes se genera dentro de PostgreSQL durante la migración, queda
privada y nunca se entrega al navegador ni se escribe en el repositorio.
HMAC evita la enumeración sencilla de hashes de IPv4 sin la clave privada.

Los cupos de más de una hora se eliminan al crear pedidos y mediante pg_cron cada
cinco minutos, incluso sin nuevas compras. Retención operativa aproximada: hasta
65 minutos si el scheduler funciona. Los backups y logs de la plataforma siguen
su política independiente. El job de limpieza no contiene identificadores.

## Despliegue y operación

La migración `20260923000100_order_creation_rate_limit.sql` instala todo en una
transacción, incluida la extensión pg_cron y el job
`vantara-expire-order-rate-slots`. No requiere Edge Function, Redis, credenciales
nuevas en frontend ni secretos manuales. No cambia confirmación/cancelación.
Si el despliegue no puede habilitar pg_cron, debe fallar y revertirse; no dejar
un contador sin su limpieza programada.

Revisión manual autorizada por el propietario (no ejecutada durante implementación):

1. Producto, paquete y carrito anónimos mantienen folio, totales y WhatsApp.
2. Repetir exactamente una clave devuelve el folio existente sin otro cupo.
3. Nuevas claves que superen la cuota reciben 429; el carrito permanece intacto.
4. Pasado `Retry-After`, un nuevo pedido puede continuar si hay disponibilidad.
5. Llamar directamente la RPC pública también aplica el límite. El helper interno
   no puede ejecutarse con la clave pública, incluso omitiendo idempotency_key.
6. Revisar que el job de cron permanezca activo y retire registros vencidos.
7. Dos clientes en una red compartida consumen el mismo cupo por red; verificar
   que los límites iniciales resulten apropiados para el tráfico real.

No generar pedidos artificiales en producción solo para comprobar la cuota sin
decidir previamente cómo administrar esos registros. La configuración no crea
pedidos ni modifica stock durante el despliegue.
