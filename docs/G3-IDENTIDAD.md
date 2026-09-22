# G3 — la identidad, sin Firebase Auth

**Estado: G3a y G3b hechos. Firebase Auth sigue en pie, y abajo está el motivo
—no es un olvido: es que no se puede quitar antes de girar la bandera—.**

---

## Lo primero, porque cambia el diseño aprobado

La decisión aprobada decía «renovación transparente/silenciosa usando GIS antes
de que venza (ventana de 50 min)». **Hay que matizarla, y conviene hacerlo antes
de tocar el inicio de sesión de nadie.**

> **Google Identity Services no ofrece un refresco programático del
> `id_token`.** No hay token de refresco en el navegador, y la referencia de la
> API es explícita: `google.accounts.id` sirve para la autenticación inicial;
> «no uses `exp` para gestionar la sesión», y la gestión de sesión es cosa de
> quien integra, no de la librería.

Lo más parecido a una renovación silenciosa es volver a pedir la credencial con
`auto_select`, que **funciona cuando hay una sola sesión de Google ya
consentida** y puede fallar —o enseñar interfaz— en cualquier otro caso:
varias cuentas, cookies de terceros bloqueadas, navegadores con ITP.

Así que la ventana de 50 minutos **se implementa tal cual se aprobó**, pero como
*intento*, no como garantía. Todo el diseño de abajo está construido alrededor
de que ese intento falle a veces.

Fuente: [Sign in with Google · referencia de la API JavaScript](https://developers.google.com/identity/gsi/web/reference/js-reference).

---

## La segunda corrección: el 401 no existe

La decisión hablaba de «captura ante 401 con reintento». El router **contesta
siempre HTTP 200** y mete el fallo en el cuerpo:

```json
{ "ok": false, "error": "TOKEN_INVALIDO" }
```

Un reintento que esperase un código de estado **no se dispararía nunca**. Se
dispara con el código del cuerpo, y hay una prueba que lo fija por su nombre
para que nadie lo «arregle» mirando el estado.

---

## Lo que hace G3a

### La ventana de 50 minutos, y lo que pasa cuando falla

`src/lib/sesionGoogle.ts`. Margen de **10 minutos** sobre un token de una hora:

1. **Se intenta con antelación.** Si la renovación va a fallar, que falle
   cuando todavía quedan diez minutos de token bueno.
2. **Se aguanta con el token viejo** mientras siga siendo válido. Un fallo de
   red a los 50 minutos no puede echar de una consulta a medio escribir a quien
   todavía tiene diez minutos de sesión. **Esta es la decisión que evita la
   mayoría de los cortes.**
3. **Se pide entrar de nuevo una sola vez**, y solo cuando ya no queda token que
   valga. Un aviso por petición fallida serían cinco diálogos seguidos.

Además: una renovación a la vez —cada una puede ser un diálogo de Google—, y una
credencial que no mejora la que había **no cuenta**, porque GIS puede contestar
con la misma y darla por buena dejaría un bucle de renovaciones que no renuevan.

### El reintento del repositorio

Cuando el router contesta `TOKEN_INVALIDO`, `RepositorioBackend` renueva y
**reintenta una vez** con la credencial nueva, mandando exactamente la misma
mutación.

Hace falta porque un token puede dejar de valer **antes** de su `exp` —el
titular revocó el acceso, el reloj del dispositivo va adelantado— y el `exp` no
se entera.

Un reintento y no más: si la credencial recién renovada tampoco vale, el
problema no es la caducidad y repetir solo gasta cuota. Si no se pudo renovar,
sube el error **original**: decir «falló la renovación» taparía lo que de verdad
contestó el router.

### El token no se guarda en ningún sitio

Vive en memoria del módulo y se pierde al recargar, igual que los tokens de
acceso de `googleTokenManager.ts`. En `localStorage` lo lee cualquier extensión.
Hay una prueba que lo fija sobre el código **desnudo de comentarios**, para que
explicarlo no la rompa y borrar la explicación no sea la salida fácil.

---

## Lo que hizo G3b

### Un solo propietario de GIS

`src/lib/gis.ts`. Un `initialize`, y las credenciales repartidas a **todos** los
interesados. `/login` y `/invitacion` ya no hablan con Google por su cuenta:
se suscriben y piden su botón, que puede pedirse **antes** de que el script
cargue.

Con una excepción que no es un detalle: **`/invitacion` sigue pidiéndolo sin
reentrada automática**. Una invitación es para una cuenta concreta, y entrar
con la que hubiera abierta es el error más probable de todo el flujo — E9 lo
cerró y está comprobado en vivo. El propietario único admite los dos modos en
vez de imponer el suyo, y hay dos pruebas que lo fijan.

### La sesión sobrevive a un F5 sin guardar nada

`AppContext` arranca la identidad cuando la bandera **no** es `firebase`, y
`auto_select` devuelve la credencial al cargar. Es la Opción 1 aprobada: nada
en `sessionStorage`, nada de cookies firmadas, nada de estado de sesión en
Apps Script.

Dos cosas que hubo que resolver por el camino:

- **El arranque no se enciende en `/invitacion`.** El propietario se comparte y
  lo fija el primero que llega; arrancar ahí la reentrada automática volvería a
  abrir el agujero de la cuenta equivocada.
- **Una credencial del mismo correo es una renovación, no un inicio.** Sin esa
  comprobación, `signIn` recargaría el expediente entero cada hora.

### Y dos arranques no son dos inicializaciones

`arrancarIdentidad` se llama desde `/login` y desde `AppContext`. Crear un
proveedor por llamada sería volver al problema con otra cara, así que se
comparte por `clientId`. Hay una prueba que lo cuenta.

---

## Lo que NO pudo hacer G3b, y por qué

**`onAuthStateChanged` y `signInWithCredential` siguen ahí.** No es un olvido.

Los dos viven detrás de `if (!isFirebaseBackend) return;`, y mientras la
bandera diga `firebase` el backend de datos es Firestore — cuyas reglas
comprueban `request.auth` **27 veces**. Quitar ahora la autenticación que la
base de datos activa exige no desacopla nada: deja la aplicación sin poder leer
ni escribir.

El orden que impone el código es:

1. **G3b** (esto): que exista una sesión que no dependa de Firebase. ✅
2. **G4**: girar la bandera —el repositorio de G0 pasa a responder— y, en el
   mismo paso, retirar Firebase entero: Auth, Firestore, reglas y dependencia.

Separarlos deja la aplicación a medias en cualquiera de los dos sentidos. El
plan ya decía que G4 era «el corte»; esto solo confirma que el corte de Auth
**forma parte de él** y no del paso anterior.

---

## Lo que ya no hace falta decidir

La persistencia al recargar: **Opción 1, aprobada e implementada**.

## Lo que queda por comprobar en vivo

Nada de esto se puede probar en frío, y ninguna prueba lo sustituye:

- Que `auto_select` devuelva de verdad la sesión tras un F5 — y qué pasa cuando
  hay **dos cuentas de Google** abiertas en el navegador.
- Que la renovación a los 50 minutos no enseñe interfaz.
- Que `/invitacion` siga rechazando la cuenta equivocada **después** de
  compartir propietario con el resto de la aplicación. Es la comprobación que
  más me interesa de las tres: es la que este cambio podría haber roto.

---

## El fallo que G3b destapó y no causó

Al integrar, tres pruebas de CSP se pusieron rojas a la vez con
`script-src ← eval`: C5, C6 y P7.

**No era código nuevo.** Zod 4 tantea con `new Function("")` si el entorno le
deja compilar validadores; lo hace dentro de un `try/catch`, así que no rompe
nada, pero el navegador dispara `securitypolicyviolation` **antes** del
`catch`. Lo dice el propio comentario de zod.

Estaba ahí desde que la aplicación usa zod. Lo que hizo G3b fue llevar zod al
paquete de `/login` por la cadena de la identidad, y el trinquete de A7
—*ninguna ruta real dispara ni una violación de CSP*— lo encontró.

**Se comprobó antes de arreglar nada**: con los cambios en `stash`, C5 y C6
pasaban; al restaurarlos, fallaban. Sin esa comprobación lo natural habría sido
darlo por ambiental.

El arreglo es `config({ jitless: true })` en `zodSinEval.ts`. Se pierde la
compilación de validadores —una optimización para esquemas grandes en
caliente—; los de aquí validan un puñado de campos cuando alguien pega un
enlace.

Y lleva trinquete: una prueba **busca quién importa zod** —no una lista escrita
a mano— y exige que cada uno apague el tanteo **antes** de importarlo. El orden
es la mitad del arreglo.

Por qué no se dejó pasar siendo inofensivo: una violación permanente enseña a
ignorar el informe, y el día que aparezca una de verdad estará en la misma
lista que el ruido.

---

## Las puertas de G3

| Puerta | G3a | G3b |
|---|---|---|
| `test:run` | 1 027/1 027 | **1 061/1 061** |
| `tsc` | 0 | 0 |
| `lint:cambiados` | sin regresiones | sin regresiones, y `/login` **baja de 5 errores a 1** |
| `build` | ✅ | ✅ |

`/login` mejoró porque hablar con un módulo tipado en vez de con `window.google`
quitó cuatro `any`. La línea base se bajó a 1, como manda el trinquete.
