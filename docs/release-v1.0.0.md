# Paté · Salud Familiar — notas de versión v1.0.0

*Sustituye a `release-v1.0.0-mvp.md`, que describía la versión con Firebase.*

## Qué es

Una aplicación web instalable (PWA) para llevar el expediente de salud de una
familia —personas y mascotas— **en una hoja de cálculo de la cuenta de Google
del titular**. Sin servidores propios, sin base de datos central, sin Google
Workspace: cada familia tiene su hoja, su Web App de Apps Script y su Drive, y
nada se toca con nada.

## Arquitectura

- **Interfaz:** Next.js 16 / React 19, desplegable en Vercel.
- **Datos:** la hoja de la familia (esquema **v5**, 22 pestañas). Solo se
  anexan filas: nada se borra, una baja es una fila con `borrado_en`, y al leer
  manda la última fila de cada registro.
- **Backend:** un Web App de Apps Script dentro de la hoja, ejecutado como el
  titular. Verifica el `id_token` de Google de quien llama en cada petición y
  aplica permisos por rol (Titular, Cuidador, Miembro, Lector).
- **Identidad:** Google Identity Services. El `id_token` vive solo en memoria.
- **Cuentas:** `@gmail.com` personales. Ningún paso exige Workspace.

## Lo que trae

- Familiares y mascotas; citas (con Google Calendar), vacunas, controles,
  exámenes y resultados, órdenes y autorizaciones, medicamentos y sus tomas,
  documentos en Drive, historial clínico y veterinario.
- **Tareas de seguimiento** con su propia pestaña (`TAREAS`, nueva en v5).
- Importar una cita pegando el texto del correo de la EPS: sin leer el correo.
- Invitaciones por correo con rol; el familiar entra con un enlace y no da
  ningún permiso a Google.
- **Guardado automático por cambio**, en una sola transacción por acción.
- **Sin conexión:** los cambios se guardan en el dispositivo y se envían solos,
  en orden, aunque se recargue o se cierre el navegador.
- **Multicuenta en un mismo navegador:** los cambios pendientes solo salen con
  la cuenta que los hizo (huella anónima, nunca el correo).
- Carga del expediente al entrar, aviso de «Hay datos nuevos», aviso de sesión
  sin credencial con el botón para volver a entrar.
- Bloqueo por inactividad, cierre nocturno y purga del dispositivo al cerrar
  sesión.
- Accesibilidad WCAG 2.1 AA medida con axe en todas las rutas, incluido `/login`, y en sus diálogos.

## Permisos de Google que pide la web

`profile`, `email`, `drive.file` (no sensible: solo los archivos que crea la
app) y `calendar.events`. Nada de Gmail, nada de `spreadsheets` ni de
`drive.appdata`: la hoja la abre el Web App con el permiso del titular.

## Cambios desde la versión con Firebase

- Firebase retirado por completo (Auth, Firestore, SDK) y el proyecto borrado.
- La hoja operacional que creaba la web, sus herramientas de reparación y el
  onboarding que la creaba, retirados.
- Salidas a Sheets desde el navegador (exportación e informe individual)
  retiradas: las sustituyen las invitaciones con rol.

## Calidad al publicar

| Puerta | Resultado |
|---|---|
| Pruebas unitarias y de integración (Vitest) | 1264/1264 en 59 ficheros |
| tsc, lint (sin regresiones), build de producción | limpios |
| E2E (Playwright, navegador real) | 178 en verde, 4 omitidas (las que necesitan un Web App real) |
| Accesibilidad (axe, WCAG 2.1 AA) | 24 pruebas, 0 violaciones críticas, serias, moderadas ni menores |

## Pendiente conocido

La lista viva está en `ESTADO_PROYECTO.md` («Lo que queda»). Lo principal:
la validación manual con lector de pantalla, la renovación de sesión a los 50
minutos vista en vivo, y la importación desde Gmail (E11), que no forma parte
de esta versión.
