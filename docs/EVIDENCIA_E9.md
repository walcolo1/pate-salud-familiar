# Evidencia E9 — un familiar entra sin autorizar nada

**Estado: LA PROMESA DEL BLOQUE, DEMOSTRADA. Ejecutado el 20 de septiembre de 2026.**

Un familiar entró en un expediente **sin ver una sola pantalla de permisos de
Google**. Eso era lo que había que probar y está probado.

Siete de las nueve comprobaciones quedan cerradas. Las dos que faltan están
marcadas abajo, no dadas por buenas.

El segundo recorrido, con el enlace **tal y como llegó** y ya sobre el dominio
de producción, encontró además un mensaje mal escrito. Está al final.

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

## El servidor de desarrollo NO sirve para esto

**`npm run dev` no carga Google Identity Services**, y no es cosa de esta
pantalla: pasa igual en `/login` y viene de antes de E9.

La CSP de la aplicación no permite `eval`, y el modo de desarrollo de Next lo
usa. El tiempo de ejecución del enrutador lanza `EvalError` y, con él caído,
`next/script` nunca llega a inyectar el `<script>` de Google: queda
**precargado y sin usar**. El botón no aparece y no hay ningún mensaje que
explique por qué.

Medido el 19 de septiembre de 2026 en las dos versiones:

| Servidor | `window.google.accounts.id` | Botón |
|---|---|---|
| `npm run dev` | `undefined` | no aparece |
| `npm run build && npm start` | `object` | aparece |

Así que este recorrido se hace **contra una compilación de producción** —local
o desplegada—, nunca contra el servidor de desarrollo. Perder media hora
buscando un botón que no puede salir es el error más fácil de cometer aquí.

---

## Si la fila aparece pero `token_hash` y `token_expira` quedan vacías

**Es el despliegue viejo.** Pasó el 20 de septiembre de 2026 y costó una
mañana, así que queda escrito.

El síntoma completo era este:

- La respuesta es `{"ok":true,"data":{"creada":true}}`.
- En `ACCESO` aparece la fila con `INVITADO` y el rol correcto.
- Las columnas F y G quedan vacías y no sale ningún correo.

Los tres se explican con una sola causa: **la URL estaba sirviendo el código de
E6**, donde el manejador `invitar` era `mutarAcceso('INVITAR', payload, acceso)`
a secas. Esa función escribe `datos.tokenHash`, que en E6 nadie rellenaba, y no
manda correo porque en E6 no había nada que mandar.

La respuesta lo delata sin ambigüedad: `{creada: true}` solo lo devuelve
`escribirMutacion_`. El `invitar` de E7 devuelve `{invitada: true, expiraEn: 7}`
y, si faltaran `URL_PWA` o `URL_BACKEND`, habría fallado **antes de escribir
nada** — no habría fila.

Guardar en el editor de Apps Script no cambia lo que sirve la URL. Hace falta
**Administrar implementaciones ▸ ✏️ ▸ Versión: Nueva versión**.

Desde E9-bis la sonda lo comprueba sola antes de intentar nada: pregunta la
versión con un `ping` anónimo y se para si no coincide con la del repositorio.

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

Ejecutado el **20 de septiembre de 2026** en dos pasadas: la primera contra una
compilación de producción en `localhost:3000`, la segunda contra
`pate-salud-familiar.vercel.app` ya promovido, con el enlace del correo sin
tocar.

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `MailApp` envía desde una cuenta gratuita | ✅ el correo llegó de inmediato |
| 2 | **El familiar no ve ninguna pantalla de permisos** | ✅ **cero advertencias, cero permisos** |
| 3 | El enlace sobrevive al cliente de correo | ✅ abierto tal cual, sin un parámetro truncado |
| 4 | La cuenta equivocada da `INVITACION_DESTINATARIO_INVALIDO` | ⬜ sin probar en vivo · cubierto por `I5` con dobles |
| 5 | El token queda consumido: reabrir el enlace se rechaza | ✅ rechazado · **pero con otro código del previsto, ver abajo** |
| 6 | El correo no lleva ningún nombre ni nada clínico | ⬜ **sin revisar el cuerpo recibido** · trinquete en `invitaciones.test.ts` |
| 7 | En la hoja va el hash, nunca el token | ✅ `token_hash` y `token_expira` con la forma esperada |
| 8 | Un `backend` ajeno no recibe ninguna petición | ✅ `I2`, en un Chromium real contra la compilación de producción |
| 9 | Solo se guarda la `/exec` en el navegador | ✅ `I4`, sobre el `localStorage` real del navegador |

### Lo que se vio, en orden

1. La sonda mandó la invitación y el correo llegó.
2. La fila apareció en `ACCESO` como `INVITADO`, con hash y caducidad.
3. Al abrir el enlace: la pantalla de alta, el botón de Google, la elección de
   cuenta. **Y nada más.** Ni «Google no ha verificado esta aplicación», ni
   lista de ámbitos, ni un solo consentimiento.
4. Redirección a `/dashboard` con la sesión puesta y el estado «Copia en Drive ·
   Activo».
5. En la hoja, la fila pasó a **`ACTIVO`** y se anotó el último acceso.

El punto 3 es el bloque entero. El titular paga una fricción de cuatro minutos
una vez; el familiar no paga ninguna. Se podía razonar, y ahora está visto.

El punto 5 confirma además, indirectamente, el consumo del token:
`escribirMutacion_` vacía `token_hash` y `token_expira` en el mismo paso que
pone `ACTIVO`. Lo que no se ha comprobado es lo otro —que **reabrir** el enlace
devuelva `INVITACION_YA_USADA`—, que es la mitad que le importa a quien vuelve
a pulsar el enlace en el correo.

### El hallazgo del segundo recorrido

Al reabrir el enlace ya usado, la aplicación respondió:

> **Este enlace ya no existe.** Puede que esté incompleto o que la invitación se
> haya retirado. Pide una nueva a quien te invitó.

Rechaza, que es lo que tiene que hacer. Pero **no es el mensaje que el guion
esperaba** —`INVITACION_YA_USADA`— sino `INVITACION_DESCONOCIDA`, y el consejo
que da es el equivocado.

La causa está en el diseño y no en un fallo: al aceptar, `escribirMutacion_`
**vacía `token_hash`**. Desde ese momento `buscarPorHash_` no encuentra la fila,
así que para el backend esa invitación dejó de existir. `INVITACION_YA_USADA`
solo se alcanza con una fila `ACTIVO` que conserve su hash, y eso no lo produce
ninguna operación de la API: solo una hoja editada a mano.

Lo grave no era el código, era el texto: **«pide una nueva» es justo lo que no
hay que hacer** cuando ya estás dentro y solo tienes que iniciar sesión. El
mensaje ahora nombra las dos situaciones, porque el backend no puede
distinguirlas:

> **Este enlace ya no sirve.** Si ya entraste con él, no necesitas otro: inicia
> sesión con normalidad desde la pantalla de acceso. Si nunca llegaste a
> entrar, pide una invitación nueva a quien te invitó.

Dos pruebas nuevas fijan el camino real —una invitación canjeada llega como
`DESCONOCIDA`— y dejan escrito que `YA_USADA` solo vive para la hoja editada a
mano.

### Lo que sigue abierto

**6 · El cuerpo del correo recibido.** Que no lleve ningún nombre ni nada
clínico está atado con un trinquete sobre la plantilla, pero nadie ha mirado
todavía el correo que llegó de verdad. Un vistazo de un minuto a la bandeja, y
conviene darlo antes de que se borre.

**4 · La cuenta equivocada.** `I5` lo cubre con dobles, pero lo que decide de
verdad es el backend comparando el correo del `id_token` con el de la fila, y
eso no lo ejercita ninguna prueba. **Ya no se puede comprobar con esta
invitación**: el token se gastó al aceptarla. Hace falta emitir una nueva y
abrirla desde la cuenta del titular, que son cinco minutos con
`--solo-invitar`.

Ninguna de las dos bloquea el Bloque G. La 4 es la que de verdad conviene
cerrar antes de que esto lo use alguien: es la decisión de E7 —una invitación
reenviada no funciona— y es la única de las nueve que protege a una familia de
un correo que acabó en la bandeja equivocada.

> **El alias ya está promovido.** `pate-salud-familiar.vercel.app/invitacion`
> responde 200 y sirve E9. Fue lo que permitió la segunda pasada.

---

## Lo que sigue sin comprobarse después de esto

Dos cosas de `ROUTER.md`, y ninguna se puede provocar aceptando una invitación:

1. Que el cerrojo serialice **dos `aplicar` simultáneos**. Hacen falta dos
   peticiones a la vez.
2. Que un lote de varias pestañas escriba en una pasada y suba la revisión una
   sola vez. Hacen falta datos que escribir.

Las dos llegan cuando la PWA empiece a guardar de verdad contra el backend, que
es el bloque que viene después del corte de Firebase.
