# Vant’ara Admin — fase 1

Páginas estáticas independientes del catálogo público. Sin CRUD, registro, cambios de publicación ni escrituras del catálogo.

## Configuración

`js/config.js` contiene únicamente la URL del proyecto y la Publishable Key pública. El SDK Supabase JS 2.57.4 se importa de jsDelivr. Se requiere conexión a Internet. No se almacena la contraseña en código ni se registra en consola. El SDK persiste la sesión en el navegador con la clave `vantara-admin-session` y renueva el token.

`getUser()` valida el usuario con Auth y luego se consulta su membresía en `catalog_admins`. El dashboard permanece oculto hasta terminar autorización y lectura. Sin sesión redirige al login; sin membresía cierra la sesión. Fallos de red bloquean el contenido y permiten reintentar. Las consultas están sujetas a RLS: el HTML estático es público, los datos no.

Las URLs relativas funcionan bajo `/Vantara-Web/admin/login.html` y `/Vantara-Web/admin/index.html`. Servir por HTTP para pruebas, no abrir mediante file://. No se ha hecho despliegue ni commit.

## Pruebas

`node admin/test-auth.mjs`: pruebas con cliente simulado de ausencia de sesión, denegación/cierre para no admin, admin autorizado, comprobación repetida, fallo de verificación y conteos. Stock cero no cuenta como pendiente; NULL sí. No se crean usuarios de prueba.

Se comprobó contra Auth real un login ficticio incorrecto: HTTP 400 invalid_credentials. Esto no sustituye probar la interfaz.

Pendiente prueba interactiva con la contraseña del propietario: login correcto, recarga conservando sesión, logout y acceso directo posterior al dashboard. No compartir la contraseña con el asistente. Comprobar además apariencia y teclado en móvil/escritorio. Esperado con datos actuales: 32 total, 0 publicados, 32 ocultos y 31 con inventario pendiente. No se han modificado esos datos.

“Gestionar productos” está deshabilitado e identificado como próximo paso; no hay página de gestión todavía.
