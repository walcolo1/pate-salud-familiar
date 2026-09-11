# E0bis-07 · Creación de un disparador desde código

**Fecha:** 2026-09-11, 21:20 (hora local)
**Entorno:** editor de Apps Script, cuenta `@gmail.com` de pruebas
**Clasificación de la evidencia:** *validación manual con recurso real de Google.*
Ejecutada por el titular; el arnés no interviene.

---

## Qué se ejecutó

Un script **autónomo** (no vinculado a ninguna hoja), con una función
`instalar()` que hace una sola cosa además de cronometrarse:

```javascript
ScriptApp.newTrigger("disparadorPrueba")
  .timeBased()
  .everyMinutes(10)
  .create();
```

## Registro de ejecución

```
21:20:48  Aviso        Se ha iniciado la ejecución
21:20:49  Información  Tiempo de ejecución: 624 ms
21:20:49  Aviso        Se ha completado la ejecución
```

---

## Qué prueba

✅ **Un disparador temporal se crea desde código en una cuenta `@gmail.com`
gratuita.** `ScriptApp.newTrigger(...).create()` terminó sin excepción: si la
cuenta no lo permitiera, la ejecución habría fallado y el registro lo diría.
Es el punto 3 de E0-bis en su mitad de «crear disparadores», y es el que hacía
falta para que `instalar()` del Bloque E pueda montarlos solo.

## Qué NO prueba

Cuatro cosas, y conviene no darlas por ganadas:

❌ **No mide la instalación real.** Los 624 ms son los de crear un disparador.
El `instalar()` del Bloque E crea 18 pestañas con encabezados, siembra
catálogos y monta un árbol de carpetas en Drive. Ese número puede estar dos
órdenes de magnitud por encima, y es el que decide si la instalación cabe en una
pasada o nace partida en fases. El punto 4 **sigue abierto**.

❌ **No prueba que el disparador se ejecute.** Se creó; nadie ha visto todavía
una entrada de `disparadorPrueba` en el registro diez minutos después. Crear y
correr son dos permisos distintos.

❌ **No prueba la idempotencia.** Ejecutar `instalar()` dos veces con este
código deja **dos** disparadores, no uno. Con 20 por script de cuota, un
instalador reejecutable que no borra los suyos antes agota el cupo sin avisar.
El `Codigo.gs` de este repositorio sí borra primero.

❌ **No dice nada sobre `/copy`.** El proyecto es autónomo («Proyecto sin
título»), no está vinculado a una hoja. Que el script viaje al copiar la hoja
—la otra mitad del punto 3, y de lo que depende todo el onboarding del §3.1—
sigue sin comprobarse.

---

## Una advertencia sobre la pantalla de consentimiento

Este script solo usa `ScriptApp`, así que Google le pidió un ámbito y poco más.
**La pantalla de autorización que muestra no es la que verá un titular real**,
cuyo backend usa además `DriveApp` —ámbito restringido— y `UrlFetch`.

Es decir: si de esta sesión salió una impresión de «no era para tanto», esa
impresión no es transferible. El punto 2 exige autorizar un script con **los
ámbitos del backend real**, que es lo que declara
`apps-script/humo/appsscript.json`.
