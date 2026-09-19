# Autenticación del backend — Bloque E, E3

El Web App de cada titular es **público y anónimo por diseño**. No es un
descuido ni una simplificación: con `access: ANYONE`, Google responde a un
`fetch` de origen cruzado con una redirección a su pantalla de acceso, y la
petición muere en CORS antes de llegar al script. Se midió en E0-bis.

La consecuencia hay que mirarla de frente: **cualquiera puede llamar al
endpoint de cualquier familia**. Lo único que separa a un familiar de un
desconocido es la verificación del `id_token`.

Por eso este documento no describe una capa de seguridad. Describe **la única**.

---

## El flujo, de principio a fin

```
PWA                          Auth.gs                    Google
 │                              │                          │
 │ POST { idToken, accion, … }  │                          │
 ├─────────────────────────────►│                          │
 │                              │ claveCache(idToken)      │
 │                              │ ¿está en CacheService?   │
 │                              │                          │
 │                              │  sí ──► identidad (fin)  │
 │                              │                          │
 │                              │  no                      │
 │                              │  GET tokeninfo?id_token= │
 │                              ├─────────────────────────►│
 │                              │◄─────────────────────────┤
 │                              │  200 + claims            │
 │                              │                          │
 │                              │ validarClaims()          │
 │                              │   aud · email_verified · exp
 │                              │                          │
 │                              │ cache.put(300 s)         │
 │◄─────────────────────────────┤                          │
 │  { email, sub }              │                          │
```

El correo sale de ahí y **de ningún otro sitio**. `ACCESO` se consulta por
correo, así que un correo que el cliente pudiera elegir sería una llave
maestra: bastaría con escribir el del titular en el cuerpo del `POST`.

---

## Las tres validaciones

Están en `validarClaims`, en `src/lib/autenticacion.ts`, con pruebas.

**`aud` contra nuestro `OAUTH_CLIENT_ID`.** Es la que más importa y la más
fácil de olvidar. Sin ella, un token válido de **cualquier otra aplicación de
Google** abriría este backend: los tokens son legítimos, están firmados y no
han caducado — solo que fueron emitidos para otro. El identificador se lee de
`PropertiesService`, y **si no está, se rechaza**: un backend a medio instalar
tiene que quedarse cerrado, no abierto.

**`email_verified`.** Un correo sin verificar puede ser de cualquiera.

**`exp`, estricto y sin margen.** No hay tolerancia de reloj: el de Google y el
nuestro son el mismo, y un margen aquí es tiempo extra para un token robado.

A las tres se suma una cuarta más callada: si viene `iss`, tiene que ser de
Google. `tokeninfo` no siempre lo devuelve, así que no se exige su presencia —
pero si está y no cuadra, no hay nada que pensar.

### Un detalle que rompe implementaciones

**`tokeninfo` devuelve todos los campos como cadenas.** `email_verified` llega
como `"true"`, no como `true`; `exp` como `"1789456000"`. Descodificando el JWT
a mano llegan con sus tipos reales. Los dos caminos acaban en `validarClaims`,
así que compara contra ambas formas. Un `=== true` habría rechazado la mitad de
los tokens legítimos, y el fallo habría aparecido solo en producción.

---

## El error es siempre el mismo

`TOKEN_INVALIDO`, falle lo que falle. Distinguir «caducó» de «la audiencia no
es la nuestra» le dice a quien lo está intentando qué corregir en el siguiente
intento.

El detalle sí se registra, pero en el **registro de ejecuciones** de Apps
Script, no en `AUDITORIA`: una petición rechazada no tiene identidad
verificada, así que no hay a quién atribuirla, y escribir en la hoja por cada
intento fallido sería regalar una forma de llenarla. Tampoco se registra el
token ni el cuerpo de la respuesta, que podrían llevar el correo de quien lo
intentó.

---

## La caché

| | |
|---|---|
| Dónde | `CacheService.getScriptCache()` |
| Duración | **300 s** |
| Clave | `tok_` + los últimos 64 caracteres de la **firma** |
| Valor | `{ email, sub, exp }` |

**Por qué `CacheService` y no `PropertiesService`.** Las propiedades son
almacenamiento persistente con cuota diaria de lecturas y escrituras, pensado
para configuración. Meter ahí una entrada por token las llenaría de basura que
nadie limpia. La caché caduca sola.

**Por qué la clave es un trozo de la firma.** `CacheService` corta las claves a
250 caracteres y un `id_token` pasa de mil. La firma es la parte que cambia con
cada token, así que sus últimos caracteres identifican uno sin guardarlo. El
token **no se guarda en ninguna parte**: ni como clave, ni como valor.

### Lo menos evidente: la caché no alarga la vida de un token

La entrada dura 300 segundos, pero el token puede caducar antes. Si se verifica
uno al que le quedaban 10 segundos, una caché ingenua lo seguiría dando por
bueno durante 290 segundos más.

Por eso el valor guarda el `exp` y `leerCache` **vuelve a comprobar la
caducidad** en cada acierto. La caché ahorra la llamada a Google; no prolonga
nada.

Y cuando `leerCache` devuelve `null`, eso significa «verifica otra vez», nunca
«denegado». Quien decide sigue siendo `tokeninfo`.

---

## Cuotas

`tokeninfo` no consume cuota de API propia, pero la llamada sí gasta
**`UrlFetch`**, que en una cuenta gratuita son **20.000 al día** y son del
titular, no de cada familiar.

Con caché de 5 minutos, el techo teórico de una familia son 288 verificaciones
diarias por cada persona activa, y en la práctica muchas menos: una sesión que
dura media hora gasta 6. Sobra por dos órdenes de magnitud.

Lo que sí conviene vigilar es que ese mismo cupo lo comparte la automatización
de correo de E11, y que la **cuota es del titular**: todas las peticiones de
toda la familia corren con su identidad, porque el Web App se ejecuta como
`USER_DEPLOYING`.

---

## Correos: por qué se normalizan

Gmail ignora los puntos de la parte local y todo lo que siga a un `+`. Estos
tres son **el mismo buzón**:

```
juan.perez@gmail.com
juanperez@gmail.com
juanperez+eps@gmail.com
```

Si `ACCESO` guardara una forma y el token trajera otra, el familiar invitado no
entraría y **nadie sabría por qué**: el correo se ve igual en pantalla.

Fuera de Gmail esas reglas no valen. Hay servidores donde `a.b@` y `ab@` son dos
personas distintas, así que quitar los puntos ahí fusionaría dos cuentas ajenas.
`normalizarEmail` solo aplica la regla en `gmail.com` y `googlemail.com`; en el
resto se limita a recortar espacios y bajar a minúsculas.

`validarClaims` devuelve el correo **ya normalizado**, para que quien llame no
tenga que acordarse. Si se le olvidara una sola vez, el síntoma sería un
familiar que no entra.

---

## Lo que E3 **no** hace

- **No comprueba la firma localmente.** Lo hace Google. Si algún día hiciera
  falta quitarse la dependencia de red, habría que traer las claves públicas de
  Google, cachearlas con su rotación y verificar RS256 a mano en un entorno sin
  biblioteca criptográfica. Hoy no compensa.
- **No decide permisos.** Solo dice quién es. Qué puede hacer esa persona es
  `Acceso.gs` (E4) y `Permisos.gs` (E5).
- **No registra accesos correctos.** Eso es E4, cuando ya se sabe el rol.

---

## Qué falta comprobar de verdad

Las 42 pruebas de `autenticacion.test.ts` cubren las decisiones: las tres
validaciones con reloj inyectable, las dos formas de tipo que devuelve
`tokeninfo`, la normalización de correos, la clave de caché y que la caché no
alargue la vida de un token.

Lo que **no** pueden cubrir, y queda para la validación real de E6, cuando el
router responda de punta a punta:

1. Que `UrlFetchApp` alcance `tokeninfo` desde el Web App.
2. Que un token de verdad, emitido por la PWA, pase las tres validaciones.
3. Que uno caducado de verdad devuelva `TOKEN_INVALIDO` y no otra cosa.
4. Que el acierto de caché se note en el tiempo de respuesta.
