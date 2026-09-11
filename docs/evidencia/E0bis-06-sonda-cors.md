# E0bis-06 · Sonda de CORS y CSP en navegador real

**Fecha:** 2026-09-11
**Entorno:** Chromium (Playwright), origen `http://127.0.0.1:3100`, compilación de producción local
**Endpoint:** implementación de humo en una cuenta `@gmail.com` de pruebas
— `https://script.google.com/macros/s/<ID-NO-VERSIONADO>/exec`
**Clasificación de la evidencia:** *E2E en navegador real contra un recurso real de Google.*
No es una prueba con dobles, y no es una validación manual: la ejecutó el arnés.

> El identificador de la implementación **no se versiona**: es una URL pública y
> ejecutable. Quien la tenga puede llamar al endpoint.

---

## Resultado

```
Running 4 tests using 1 worker

  E0b-1 · Google sí autoriza el origen cruzado con text/plain            ✓
  E0b-2 · application/json TAMBIÉN cruza                                 ✓
  E0b-3 · desde la aplicación real, con su CSP puesta, el fetch llega    ✓
  E0b-4 · el usuario activo viene vacío y el efectivo es un correo       — omitida

  1 skipped
  3 passed (1.9m)
```

---

## Qué prueba cada una

### E0b-1 — el lado de Google está bien

`POST` de origen cruzado con `text/plain;charset=utf-8` desde una página **sin
CSP**, servida por Playwright en el origen de la aplicación. Respuesta **200**,
cuerpo JSON con `ok: true` y `accion: "ping"`.

Es decir: `executeAs: USER_DEPLOYING` + acceso anónimo **sí** responde a un
`fetch` de navegador desde otro origen. El punto 1 de E0-bis queda resuelto por
el lado que dependía de Google.

### E0b-2 — el preflight ya no es el muro que era

La misma petición con `application/json` **tampoco falla**. La especificación
(§7, punto 22) da por hecho lo contrario: que el preflight
`OPTIONS` mata la petición porque un Web App de Apps Script no sabe responderlo.

Medido hoy, Google responde al preflight. Ver la nota de corrección en
`E0-BIS-INFORME.md`.

### E0b-3 — lo que bloqueaba era nuestra propia CSP, y hacían falta dos hosts

**Primera medición (antes del cambio).** Desde la aplicación real, el mismo
`fetch` **falla**, y la consola del navegador acusa a `connect-src`.
`next.config.ts` limitaba la CSP a:

```
connect-src 'self'  https://*.googleapis.com  https://accounts.google.com
```

`script.google.com` no estaba, así que el navegador cortaba la conexión antes de
que CORS llegara a opinar. El error es el mismo `TypeError: Failed to fetch` en
los dos casos, que es exactamente por qué esta prueba separa las dos causas.

**Un `Invoke-RestMethod` desde PowerShell contra el mismo endpoint devuelve 200
y `ok: true`.** No contradice nada: PowerShell no aplica ni CORS ni CSP. Ese 200
prueba que el endpoint está desplegado, es anónimo y parsea el cuerpo — no
prueba nada sobre el navegador.

**Segunda medición (con `script.google.com` añadido).** Sigue fallando. La
consola da el motivo exacto:

```
Connecting to 'https://script.googleusercontent.com/macros/echo?…'
violates the following Content Security Policy directive:
"connect-src 'self' https://*.googleapis.com https://accounts.google.com https://script.google.com"
```

`…/exec` responde con una **redirección**, y `connect-src` comprueba también el
destino de la redirección. Hacen falta los dos hosts. Esto no se dedujo de la
documentación: lo cazó la prueba, sobre un arreglo que parecía completo.

**Tercera medición (con los dos hosts).** El `fetch` desde `/login`, con la CSP
real servida por Next, devuelve **200** y `ok: true`. ✅

La prueba `E0b-3` quedó **estricta**: ya no admite la rama «falló, pero por la
CSP». Si alguien vuelve a cerrar el host, se pone roja y el mensaje señala
`next.config.ts`.

### E0b-4 — omitida, y por qué

La implementación desplegada **no es** `apps-script/humo/Codigo.gs` de este
repositorio: su respuesta trae `mensaje` y `timestamp`, y no trae
`usuarioActivo` ni `usuarioEfectivo`. La prueba se omite en lugar de inventar un
resultado. El comportamiento de `Session` con `USER_DEPLOYING` sigue apoyado
solo en documentación.

---

## Cómo reproducirlo

Desde `web/`, con la URL de una implementación de humo viva:

```bash
URL_WEBAPP_HUMO="https://script.google.com/macros/s/PEGAR_ID/exec" npx playwright test e2e/webapp-humo.e2e.ts --project=app --reporter=line
```

Sin esa variable, las cuatro pruebas se omiten y la suite completa sigue verde.
