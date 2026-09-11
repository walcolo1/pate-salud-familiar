# Informe E0-bis — Verificación empírica del backend de Apps Script

**Estado: CERRADO, con tres cabos sueltos traspasados a E2.**

El punto 1 —el que justificaba todo E0-bis— está cerrado con evidencia de
navegador real, y de paso resuelto: la CSP ya deja pasar. Por el camino
aparecieron **dos supuestos falsos** de la especificación. El punto 3 quedó a
medias y el 2 y el 4 sin tocar; los tres se convierten en criterios de
aceptación de E2 y E8 en vez de quedar flotando.

Fecha de la medición: **2026-09-11**.

---

## Tabla de resultados

| # | Punto a verificar | Resultado | Evidencia |
|---|---|---|---|
| 1 | `USER_DEPLOYING` + acceso anónimo responde a un `fetch` sin morir en CORS | ✅ **VERIFICADO** — y con matiz importante, ver abajo | `docs/evidencia/E0bis-06-sonda-cors.md` · `e2e/webapp-humo.e2e.ts` (3 en verde) |
| 2 | Aspecto exacto de la pantalla «no verificada» con estos ámbitos | ⏳ **PENDIENTE** — sin captura | — |
| 3 | `/copy` arrastra el script; los disparadores se crean desde código | 🟡 **PARCIAL** — crear disparadores desde código: **sí**. `/copy`: sin comprobar | `docs/evidencia/E0bis-07-disparadores.md` |
| 4 | Tiempo real de `instalar()` frente al límite de 6 min | ⏳ **PENDIENTE** — los 624 ms medidos son de crear un disparador, no de instalar | `E0bis-07-disparadores.md`, sección «qué NO prueba» |

**Extra no previsto:**

| # | Hallazgo | Resultado | Evidencia |
|---|---|---|---|
| 5 | El bloqueo real en la PWA era **nuestra propia CSP**, no CORS — **corregido** | ✅ **VERIFICADO Y RESUELTO** | `E0b-3` en verde estricto tras abrir los dos hosts |
| 6 | `application/json` **también** cruza: el preflight ya no mata la petición | ✅ **VERIFICADO** | `E0b-2` |
| 7 | El comportamiento de `Session` con `USER_DEPLOYING` | ⏳ **NO COMPROBADO** — el script desplegado no es el del repositorio | `E0b-4`, omitida |

---

## Lo que cambió respecto a lo que creíamos

### 1 · El `Invoke-RestMethod` no probaba CORS

La sonda manual desde PowerShell devolvió `ok: true`. Es una evidencia real y
útil —el endpoint está desplegado, es anónimo y parsea el cuerpo— pero **no dice
nada sobre el navegador**: PowerShell no aplica ni la política de origen cruzado
ni la CSP. La misma llamada desde Chromium, en el origen de la aplicación,
falla.

Ese contraste es el motivo de que el punto 1 se midiera en un navegador.

### 2 · Lo que bloquea es `connect-src`, no Google

Antes de este paso, `next.config.ts` limitaba la CSP a:

```
connect-src 'self' https://*.googleapis.com https://accounts.google.com
```

`script.google.com` no estaba en la lista, así que el navegador cortaba la
conexión antes de que CORS llegara a opinar. Desde una página sin CSP, la misma
petición pasaba sin problema.

**Resuelto en este mismo paso.** `connect-src` pasa de tres destinos a cinco:

```
connect-src 'self'
            https://*.googleapis.com
            https://accounts.google.com
            https://script.google.com              ← nuevo
            https://script.googleusercontent.com   ← nuevo
```

**Hacen falta los dos, y eso no se dedujo: lo cazó la prueba.** Con solo
`script.google.com` la petición seguía muriendo, porque `…/exec` responde con
una redirección a `script.googleusercontent.com/macros/echo` y `connect-src`
comprueba también el destino de la redirección. La consola lo dijo con nombre y
apellido. Si `E0b-3` no se hubiera endurecido justo antes, el arreglo a medias
se habría ido al commit pareciendo completo.

Los dos hosts están **solo** en `connect-src`: ni en `script-src`, ni en
`frame-src`, ni en `img-src`. El Web App es un destino de datos, no una fuente
de código. `cabecerasSeguridad.test.ts` lo comprueba directiva por directiva, y
la lista de `connect-src` se compara **entera** —igualdad, no «contiene»— para
que añadir un sexto destino obligue a justificarlo.

La prueba que exigía la **ausencia** de Apps Script («NO abre paso a Apps
Script todavía: eso es del Bloque E») se invirtió a propósito, con la medición
delante. Razonado en `SEGURIDAD.md`.

### 3 · El preflight ya no es el muro de 2025

La especificación (§7, punto 22) sostiene que enviar
`application/json` dispara un preflight `OPTIONS` que un Web App de Apps Script
no sabe responder, y que ahí muere la petición. Se presenta como «el detalle que
hace fracasar la mitad de los intentos de conectar una SPA con GAS».

Medido hoy contra una implementación real: **`application/json` cruza igual de
bien que `text/plain`**. Google responde al preflight.

No propongo cambiar la decisión: `text/plain` funciona, no cuesta nada y es lo
más conservador. Pero conviene saber que el motivo original ya no aplica, porque
una regla que nadie sabe por qué existe acaba arrastrándose a sitios donde
estorba. La prueba `E0b-2` queda como cable trampa: si Google revierte, se pone
roja.

### 4 · La pantalla «no verificada» sigue sin capturarse

Y la corrección del informe E0 sigue en pie: la especificación §3.1 paso 6
afirma que el titular **no** verá esa pantalla por ser dueño de su propio
script. La
[documentación de autorización](https://developers.google.com/apps-script/guides/services/authorization)
dice que el aviso depende de la sensibilidad de los ámbitos, no de quién sea el
dueño. Falta la captura que lo zanje y que debe ir al asistente de onboarding.

---

## Una cosa que conviene cerrar ya

La implementación de humo **sigue viva y es pública**. Su URL circuló por un
chat. Mientras exista, cualquiera que la tenga puede invocarla.

Conviene **archivar la implementación** (Implementar ▸ Gestionar
implementaciones ▸ Archivar) en cuanto se terminen los puntos 3 y 4. No expone
datos —el script de humo no lee nada— pero un endpoint público olvidado es un
endpoint público.

Además, el script desplegado **no es** `apps-script/humo/Codigo.gs`: su
respuesta trae `mensaje` y `timestamp` y no trae las dos identidades. Para
cerrar los puntos 3, 4 y 7 hay que desplegar el del repositorio, que además
cronometra la instalación y registra los disparadores en la pestaña
`MEDICIONES`.

---

## Traspaso a E2 y E8 — criterios de aceptación

E0-bis se cierra aquí, pero no porque todo esté comprobado: porque lo que falta
se comprueba mejor **construyendo el instalador de verdad** que repitiendo un
script de humo. Cada cabo suelto se convierte en una condición de cierre de otro
paso, con su prueba.

| Cabo | Dónde se cierra | Criterio de aceptación |
|---|---|---|
| **3b** · `/copy` arrastra el script vinculado | **E2** | Copiar la hoja plantilla a otra cuenta, abrir la copia, y que `instalar()` monte sus 18 pestañas **desde la copia**. Si el script no viajara, el onboarding del §3.1 se cae entero y hay que rediseñarlo antes de seguir |
| **4** · Tiempo real de `instalar()` | **E2** | `instalar()` completa —18 pestañas, catálogos y árbol de Drive— cronometrada por sí misma, con el total y el margen contra los 360 000 ms escritos en `MEDICIONES`. Si pasa de 180 000 ms, el instalador nace partido en fases |
| **3c** · Un disparador creado por el instalador **se ejecuta** | **E2**, o **E11** si el primer disparador útil llega ahí | Una entrada del disparador en el registro de ejecuciones de Apps Script, con su marca de tiempo. Crear y correr son permisos distintos |

A los tres hay que añadir uno que nació de mirar el código de la sesión de
prueba: **`instalar()` tiene que ser idempotente**. El script de humo del titular
crea un disparador por invocación, así que ejecutarlo dos veces deja dos. Con 20
disparadores por script de cuota, un instalador reejecutable que no borre los
suyos antes agota el cupo sin decir nada. `apps-script/humo/Codigo.gs` ya borra
primero; E2 debe hacerlo igual y probarlo.

## Advertencia para E8 — la pantalla que hay que capturar no es la que se vio

La sesión de prueba autorizó un script que **solo usa `ScriptApp`**. Google le
pidió un ámbito y poco más.

El backend real usa además **`DriveApp`**, que es un ámbito **restringido**, y
`UrlFetch`. La pantalla de consentimiento del titular será **más severa** que la
de esa sesión: texto distinto, lista de permisos más larga y más alarmante.

Es decir: si de la prueba salió una impresión de «no era para tanto», **esa
impresión no es transferible**. El asistente de onboarding de E8 tiene que
enseñar la pantalla real —la que produce `apps-script/humo/appsscript.json` con
sus cuatro ámbitos—, no una más benigna. Enseñar una captura más suave que la
realidad es peor que no enseñar ninguna: el titular llega preparado para una
cosa y se encuentra otra, justo en el momento en que decide si confía.

---

## Decisión

**E1 puede empezar. E2 y E8 arrancan con deuda declarada.**

El riesgo que justificaba E0-bis era el transporte: si la PWA no podía hablar
con el Web App, el Bloque E entero cambiaba de forma. Ese riesgo está
despejado: la PWA ya habla con el Web App, medido de punta a punta con la CSP
real puesta.

Lo que sigue pendiente no afecta a **E1 — proyecto plantilla**: la hoja, el
script vinculado y el manifiesto no dependen de ninguno de los tres puntos
abiertos. Sí afectan a:

| Paso | Qué hereda |
|---|---|
| **E2** · Instalador | Cabos **3b**, **3c** y **4**, más la idempotencia. Ver la tabla de traspaso |
| **E7** · Transporte | Nada: la CSP ya está abierta y medida |
| **E8** · Onboarding | Punto **2**: capturar la pantalla de «no verificada» **con los ámbitos reales** |

Lo que queda por medir se mide mejor sobre el instalador de verdad que sobre un
script de humo, así que no tiene sentido alargar E0-bis. Lo que sí conviene
hacer ya, y no cuesta nada: **archivar la implementación de humo** para que no
quede un endpoint público olvidado.
