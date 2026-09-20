# Evidencia E9 — un familiar entra sin autorizar nada

**Estado: PREPARADO. Pendiente de ejecución.**

Esta es la promesa de la que cuelga el bloque entero, y la única que ninguna
prueba puede sustituir: **que el familiar no vea ni una sola pantalla de
permisos de Google.**

Se puede escribir en un documento, se puede razonar y se puede probar con
dobles. Pero si al pulsar el enlace aparece «Google no ha verificado esta
aplicación», el diseño no funciona y da igual lo verde que esté la suite.

---

## Lo que ya está cerrado sin desplegar nada

| Qué | Dónde | Pruebas |
|---|---|---|
| El token y la caducidad | `invitaciones.ts` | 62 |
| La cadena con `aceptarInvitacion` como única excepción | `router.ts` | 45 |
| Los parámetros de la URL y los mensajes | `invitacionEntrante.ts` | 36 |
| La pantalla, de punta a punta con el backend interceptado | `invitacion.e2e.ts` | 8 |
| Accesibilidad de las dos caras de la pantalla | `accesibilidad.e2e.ts` | 0 violaciones |

Lo que falta es todo lo que empieza cuando sale un correo de verdad.

---

## Antes de empezar

Las mismas **dos cuentas `@gmail.com`** de E6-live, ninguna de Workspace. Y
tres cosas configuradas:

**1 · La PWA, servida por `https`.** El enlace del correo apunta a ella, y
Google Identity Services no funciona desde `http` ni desde una dirección que no
esté autorizada en el cliente OAuth. Sirve el despliegue de Vercel.

> **Esto puede necesitar un cambio en Google Cloud** —añadir el origen a
> «Orígenes de JavaScript autorizados» del cliente OAuth— si el dominio desde
> el que se prueba no está ya autorizado. **No lo he tocado ni lo voy a tocar
> por iniciativa propia.** Si al pulsar el botón de Google sale
> `origin_mismatch`, es eso, y lo decides tú.

**2 · Las dos propiedades nuevas del script**, en la hoja de pruebas —
Configuración del proyecto ▸ Propiedades del script:

| Propiedad | Valor |
|---|---|
| `URL_PWA` | La raíz `https` de la aplicación, **sin barra final y sin consulta** |
| `URL_BACKEND` | La `/exec` de ese mismo despliegue |

Si falta cualquiera de las dos, `invitar` **falla cerrado** y devuelve
`ERROR_PAYLOAD`. Es deliberado: una instalación a medias no debe poder mandar
enlaces que no llevan a ninguna parte.

**3 · El código de E6-bis a E9 pegado y desplegado.**

```bash
node scripts/consolidar-gs.mjs
```

Pegar `apps-script/dist/Pate.gs` como único `.gs`, y **Administrar
implementaciones ▸ ✏️ ▸ Versión: Nueva versión**. Sin ese último paso la URL
sigue sirviendo el código viejo, que no conoce `aceptarInvitacion`.

---

## El recorrido

### Paso 1 · El titular invita

Todavía no hay pantalla para esto en la PWA —es de un bloque posterior—, así
que se hace con la sonda, que ya sabe pedir un token real:

```bash
node scripts/e6-en-vivo.mjs --url https://script.google.com/macros/s/AAAA…/exec --solo-invitar --a segunda@ejemplo
```

> Si prefieres no tocar el guion, vale igual desde el editor de Apps Script:
> ejecuta una función de una línea que llame a
> `invitar({email: '…', rol: 'LECTOR', pacientes: '*'}, {email: '<el tuyo>', rol: 'TITULAR', estado: 'ACTIVO', alcanceTotal: true, pacientesPermitidos: [], pacientePropio: null, version: 1})`.
> Bórrala después.

**Qué comprobar en la hoja**, pestaña `ACCESO`:

| Columna | Qué tiene que verse |
|---|---|
| `email` | El de la segunda cuenta, **normalizado** (sin puntos si es de gmail) |
| `estado` | `INVITADO` |
| `token_hash` | 64 caracteres hexadecimales |
| `token_expira` | Dentro de siete días |

**Y lo que NO puede verse: el token en claro.** En la hoja solo va su SHA-256.
Si ahí hubiera un token legible, el diseño estaría roto y habría que parar.

### Paso 2 · El correo

En la bandeja de la segunda cuenta.

| Comprobación | Por qué |
|---|---|
| Llega | `MailApp` funciona desde una cuenta gratuita |
| **No dice ningún nombre** — ni del titular, ni de la familia, ni de ningún paciente | Un correo se reenvía por error y se lee en una pantalla bloqueada |
| No trae nada clínico | Lo mismo |
| Es texto plano, sin imágenes | No ejecuta nada y no delata si se abrió |
| El enlace **no está partido** | Algunos clientes parten las líneas largas y rompen la URL. Es el fallo más probable de todo el paso |

Captura: `E9-01-correo.png`, con la dirección tapada.

### Paso 3 · El enlace, y la comprobación que importa

Pulsar el enlace **desde la segunda cuenta**.

```
  [ ] La PWA abre en /invitacion
  [ ] Dice «Te han dado acceso»
  [ ] Sale el botón de Google
  [ ] Al pulsarlo: se elige la cuenta
  [ ] ► NO aparece «Google no ha verificado esta aplicación»
  [ ] ► NO aparece ninguna lista de permisos
  [ ] Dice «Ya estás dentro»
```

**Las dos líneas marcadas son E9.** Si aparece cualquiera de las dos pantallas,
la promesa del bloque no se cumple y hay que entender por qué antes de seguir:
el familiar se identifica contra **la PWA**, que es una aplicación OAuth
verificada para él, no contra el script del titular.

Capturas: `E9-02-pantalla-invitacion.png`, `E9-03-eleccion-de-cuenta.png`,
`E9-04-dentro.png`.

### Paso 4 · Que el canje ocurrió de verdad

En la hoja, la misma fila:

| Columna | Antes | Después |
|---|---|---|
| `estado` | `INVITADO` | **`ACTIVO`** |
| `token_hash` | 64 caracteres | **vacío** |
| `token_expira` | una fecha | **vacía** |

El token se **consume**. Es lo que hace que un enlace sirva una sola vez.

Y en el navegador, consola: `localStorage.getItem('pate:familia:v1')` tiene que
devolver la `/exec` **y nada más**. Ni correo, ni `id_token`, ni identificador
de hoja.

### Paso 5 · Los cuatro rechazos

Con el mismo enlace y sin pedir otro:

| # | Qué hacer | Qué tiene que salir |
|---|---|---|
| 1 | Abrirlo otra vez | «Esta invitación ya se usó» |
| 2 | Abrirlo desde **la cuenta del titular** | «Estás en la cuenta equivocada», con botón para reintentar |
| 3 | Cambiar un carácter del parámetro `t` | «Este enlace está incompleto», **sin** llamar al backend |
| 4 | Cambiar `backend` por `https://example.com/x` | «Este enlace no es de fiar», **sin** llamar a nadie |

Los dos últimos se comprueban con la pestaña **Red** del navegador abierta: lo
que importa no es el mensaje sino que **no salga ninguna petición**.

El rechazo 2 es el que cierra la decisión de E7: una invitación reenviada no
funciona. Comprueba de paso que el mensaje **no dice para quién era**.

Captura: `E9-05-cuenta-equivocada.png`.

---

## Resultados

*(Pendiente de ejecución.)*

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `MailApp` envía desde una cuenta gratuita | |
| 2 | **El familiar no ve ninguna pantalla de permisos** | |
| 3 | El enlace sobrevive al cliente de correo | |
| 4 | La cuenta equivocada da `INVITACION_DESTINATARIO_INVALIDO` | |
| 5 | El token queda consumido: repetir da `INVITACION_YA_USADA` | |
| 6 | El correo no lleva ningún nombre ni nada clínico | |
| 7 | En la hoja va el hash, nunca el token | |
| 8 | Un `backend` ajeno no recibe ninguna petición | |
| 9 | Solo se guarda la `/exec` en el navegador | |

---

## Lo que sigue sin comprobarse después de esto

Dos cosas de `ROUTER.md`, y ninguna se puede provocar aceptando una invitación:

1. Que el cerrojo serialice **dos `aplicar` simultáneos**. Hacen falta dos
   peticiones a la vez.
2. Que un lote de varias pestañas escriba en una pasada y suba la revisión una
   sola vez. Hacen falta datos que escribir.

Las dos llegan cuando la PWA empiece a guardar de verdad contra el backend, que
es el bloque que viene después del corte de Firebase.
