# G3 — la identidad, sin Firebase Auth

**Estado: G3a hecho (la sesión y el reintento). G3b pendiente: el corte de
Firebase Auth y la inicialización única de GIS.**

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

## Lo que falta: G3b

### `google.accounts.id.initialize` es global, y solo puede tener un dueño

Quien la llama se queda con la devolución de llamada. Hoy la llaman **dos
sitios**: `/login` y `/invitacion`. Si un tercero —la renovación— inicializara
por su cuenta, **pisaría la del inicio de sesión** y las credenciales dejarían
de llegar a quien las espera. Sin error, porque no hay error: simplemente no se
llama al que ya no está.

Por eso G3a deja los dos enchufes sin conectar (`identidad.ts`), y **sin
conectar la renovación devuelve `null`**, que es justo lo que `SesionGoogle`
sabe manejar. Nada finge funcionar.

G3b tiene que hacer las tres cosas **a la vez**, porque separarlas deja la
aplicación a medias:

1. Un solo sitio que inicialice GIS y entregue toda credencial a
   `sesionDeLaAplicacion.recibir()`.
2. `configurarRenovacion()` apuntando a un `auto_select` + `prompt()`.
3. Fuera `signInWithCredential` y `onAuthStateChanged`.

### Lo que hay que decidir antes

**Qué es «la sesión» cuando ya no la guarda Firebase.** Hoy `onAuthStateChanged`
sobrevive a una recarga. Un `id_token` en memoria, no. Con el diseño actual,
**recargar la página cerraría la sesión** — y eso, en una PWA que se abre y se
cierra todo el día, es un cambio que se nota.

Las salidas son tres, y ninguna es gratis:

1. **Aceptarlo**, con `auto_select` volviendo a entrar solo al cargar. Es lo más
   limpio y depende de lo que GIS conceda ese día.
2. **Guardar el token** en `sessionStorage`. Sobrevive a la recarga y es
   exactamente lo que este proyecto decidió no hacer con las credenciales.
3. **Una sesión propia** —una cookie firmada por el backend— que es lo que la
   documentación de Google recomienda y lo que más trabajo es.

No la he decidido. Es la primera pregunta de G3b.

---

## Las puertas de G3a

| Puerta | Resultado |
|---|---|
| `test:run` | 1 027/1 027 ✅ (994 → 1 027) |
| `tsc` | 0 ✅ |
| `lint:cambiados` | sin regresiones ✅ |
| `build` | ✅ |

**La aplicación sigue funcionando igual que hoy**: Firebase Auth intacto, login
intacto, y este código todavía sin llamar.
