# Transición: de Gmail automático a importación manual

> Bloque B · Estado: en ejecución · Última revisión: 2026-09-07

## Qué cambia y por qué

La aplicación leía el correo del titular para detectar citas médicas. Eso exigía
el ámbito OAuth `https://www.googleapis.com/auth/gmail.readonly`, que Google
clasifica como **restringido** — la categoría más alta, por encima de
«sensible».

Publicar una aplicación con un ámbito restringido obliga a una verificación de
Google **y a una evaluación de seguridad CASA realizada por un tercero, de pago
y renovable cada año**. Para una aplicación de uso 100 % personal, destinada a
un núcleo familiar, ese trámite es desproporcionado: cuesta más que todo lo
demás junto y no aporta ninguna seguridad real a las cinco personas que la usan.

**`gmail.readonly` se retira por completo.** La aplicación deja de leer correo.

## Qué NO se pierde

La función valiosa nunca fue leer el buzón: fue **interpretar el correo de la
EPS** y convertirlo en una cita con paciente, fecha, hora, médico, especialidad
y lugar. Ese analizador es una función pura que no sabe nada de Gmail, y se
conserva íntegro.

Lo que cambia es de dónde sale el texto:

| Antes | Ahora |
|---|---|
| La aplicación buscaba en Gmail por remitente y palabras clave | La persona **pega el texto** del correo |
| Descargaba el mensaje con la API de Gmail | O **adjunta** el documento que le llegó |
| Creaba candidatos automáticamente cada día | Se crea un **borrador editable**, uno cada vez |

El paso de revisión no cambia y sigue siendo obligatorio: **nunca se crea una
cita sin que una persona la revise y confirme**. Eso ya era así y sigue igual.

## Lo que la aplicación deja de pedir

Al retirar `gmail.readonly`, la pantalla de consentimiento de Google deja de
mencionar el correo. Los ámbitos que quedan son:

| Ámbito | Clasificación | Para qué |
|---|---|---|
| `drive.file` | No sensible | Documentos que la propia aplicación crea |
| `drive.appdata` | Sensible | Configuración privada de la aplicación |
| `spreadsheets` | Sensible | Hoja de cálculo del expediente |
| `calendar.events` | Sensible | Citas en el calendario |

Ninguno es restringido, así que **ninguno exige evaluación CASA**.

## Sin Google Workspace, en ningún punto

Esta es una restricción del proyecto, no una preferencia:

- La pantalla de consentimiento es **External**, nunca «Internal» (esa sí exige
  Workspace).
- En estado **Testing**, External admite hasta 100 usuarios de prueba, todos
  con cuentas `@gmail.com` gratuitas.
- Ni el titular ni ningún familiar necesita pertenecer a una organización para
  instalar, invitar, autenticarse ni usar nada.

Si alguna decisión futura exigiera Workspace, se detiene y se consulta antes de
implementarla.

## Hacia dónde va esto

El destino no es que la aplicación hable con las APIs de Google desde el
navegador. Es **un backend de Google Apps Script por cada titular**, desplegado
en su propia cuenta, con su hoja de cálculo y su carpeta de Drive. La
multitenencia es física: los datos de cada familia viven en la cuenta de esa
familia y nadie más tiene acceso.

Eso llega en el Bloque E. Hasta entonces, la capa actual —el navegador
llamando a las APIs de Google con los ámbitos de arriba— es transitoria, y por
eso no se consolida ni se optimiza.

## Verificado con recursos reales

El 8 de septiembre de 2026 se comprobó, con una cuenta `@gmail.com` personal y
con la consola de Google Cloud, que la retirada está completa:

- La **Gmail API está deshabilitada** en el proyecto y `gmail.readonly` no
  figura entre los ámbitos declarados.
- La pantalla de consentimiento **no menciona** Gmail, correo, mensajes ni
  bandeja de entrada.
- Drive y Calendar se autorizan **por separado y bajo demanda**, con
  `drive.file` y `calendar.events`.
- La importación manual funciona de principio a fin, y la cita se crea
  **solo** tras confirmarla a mano.
- Cero solicitudes a `gmail.googleapis.com` en el tráfico real.

Queda una comprobación por hacer antes del corte de Firebase: la sesión de
esa prueba ya tenía permisos concedidos, así que falta repetirla tras revocar
el consentimiento, para descartar que lo observado viniera de una autorización
anterior. Está registrada en `TESTING.md` §6.11.

## Qué queda pendiente

- **Lectura automática de adjuntos.** Hoy se acepta el archivo y se abre un
  borrador para completar a mano. Extraer texto de un PDF exige una biblioteca
  local; de una imagen, OCR. Ninguna de las dos se añade sin decidirlo
  explícitamente, y una API externa queda descartada: no se envía información
  clínica a terceros.
- **`drive.appdata`.** Está trazado pero no se retira todavía; la decisión es
  puntual y va aparte.
- **`spreadsheets`.** No se toca: desaparecerá con el backend de Apps Script.
