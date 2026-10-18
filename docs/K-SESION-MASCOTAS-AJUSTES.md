# Bloque K — Sesión persistente, mascotas en primer nivel y Ajustes depurado (v1.1.0)

Tres problemas de uso diario, resueltos de raíz.

---

## 1 · La sesión ya no se cae

### El problema

El `id_token` de Google dura una hora, vive solo en memoria y GIS no da token
de refresco. Tras un F5 nada volvía a pedirlo —`idToken()` devolvía `null`
hasta que alguien pulsara el botón—, así que el aviso rojo «Tu sesión de Google
no está activa» salía en cada recarga, en cada PWA reabierta y a la hora de uso.

### La solución: un ticket firmado por la hoja de la familia

- Al entrar con Google, la aplicación canjea el `id_token` (ya verificado por
  Google en `tokeninfo`) por un **ticket** que firma el Apps Script de la
  familia con HMAC-SHA256 (`abrirSesion`). La clave (`SESION_SECRETO`) vive
  solo en las `ScriptProperties` y se crea sola la primera vez.
- El ticket dura **30 días** y se renueva solo cuando le quedan menos de 15.
  Sustituye al `id_token` en cada petición; el router lo reconoce por su
  prefijo `pt1.`.
- **No lleva correo, ni nombre, ni `sub`**: solo la huella HMAC de la cuenta,
  la emisión y la caducidad. El router recupera el correo buscando esa huella
  entre los de `ACCESO` y el titular, **en cada petición**. Quien sale de
  `ACCESO` deja de entrar en el acto, tenga el ticket que tenga.
- En el navegador se guarda en `pate:sesion:v1` (`{ v: 1, t: ticket }`). El
  cierre de sesión lo borra con la purga. El `id_token` sigue sin guardarse en
  ningún sitio.
- **Cerrar todas las sesiones de todos los dispositivos:** borrar la propiedad
  `SESION_SECRETO` del proyecto de Apps Script. La siguiente petición crea otra
  clave y ningún ticket anterior vuelve a valer.
- Compatibilidad: si el backend no conoce `abrirSesion` (versión anterior), la
  aplicación sigue con el `id_token` como antes y no insiste.

Piezas: `src/lib/autenticacion.ts` (emitir/verificar, generado a
`Autenticacion.gs`), `apps-script/plantilla/Auth.gs` (clave, HMAC, huella →
correo), `src/lib/sesionGoogle.ts` (cuándo usar y renovar el ticket),
`src/lib/ticketSesion.ts` (almacén y canje). Pruebas: `ticketSesion.test.ts` y
la E2E «con sesión persistente, un F5 no pide volver a entrar».

## 2 · Mascotas a la vista… y en la hoja

- Nueva pantalla **`/mascotas`**: todas las mascotas de la familia, alta
  directa eligiendo quién está a cargo (por defecto el titular) y en un clic su
  peso, vacunas e historial. Entrada propia en la navegación, bloque «Mis
  mascotas» en el panel principal y acceso desde Familia.
- **Hasta ahora las mascotas no llegaban a la hoja**: vivían solo en el
  navegador. Ahora se escriben como cualquier paciente:
  - `PACIENTES` con `tipo = MASCOTA` y `PERFIL_MASCOTA`;
  - pesos en `PESOS`, vacunas en `VACUNAS`, historial en `HISTORIAL`;
  - con `especie: 'MASCOTA'` en cada mutación, para que el router aplique los
    permisos por especie.
- Al leer, las filas de mascota se separan de las de personas por su
  identificador: una mascota nunca aparece como familiar, ni sus vacunas en la
  cartilla de nadie.
- Las mascotas que solo estaban en un navegador **no se pierden**: al cargar la
  hoja se conservan y se suben (`fusionMascotas.ts`).

### Esquema v6

Dos columnas nuevas, al final de su pestaña:

| Pestaña | Columna | Para qué |
|---|---|---|
| `PERFIL_MASCOTA` | `responsable_id` | El familiar a cargo |
| `HISTORIAL` | `profesional` | Quién atendió (veterinario) |

`scripts/esquema-v5.json` quedó congelado; una prueba comprueba que a una hoja
en v5 `instalar()` solo le añade esas dos columnas.

## 3 · Ajustes, para cualquier familiar

- La cuenta muestra el **estado real de la sesión** («Sesión guardada en este
  dispositivo hasta el …»), no la hora a la que se entró.
- «Hoja de la familia», ya registrada, enseña solo «Registrada» y «Abrir la
  hoja»; la dirección se cambia detrás de «Cambiar dirección de la hoja».
- La barra lateral dice **«Hoja familiar · Conectada»** (o pendientes,
  reconectar, sin registrar) en lugar de «Copia en Drive · Activo».
- Diagnóstico, copias de seguridad, retención y datos del dispositivo, en
  **Herramientas avanzadas**, plegadas.
- Fuera: la tarjeta de compartir por Drive (no construido), el simulador de
  roles con una hoja real (solo queda en demostración), el aviso falso de que
  los datos «se guardan localmente y se perderán», el texto de privacidad que
  hablaba de tokens de 60 minutos y de una hoja que no existe, y el segundo
  botón de cerrar sesión que hacía lo mismo que el primero.

---

## Actualizar la hoja oficial a v6

1. Pegar `apps-script/dist/Pate.gs` (`node scripts/consolidar-gs.mjs`) en el
   editor del proyecto y guardar.
2. Ejecutar **`instalar`** una vez (o «Paté ▸ Instalar o actualizar» en la
   hoja). Añade `responsable_id` y `profesional` y deja `version_esquema = 6`
   en `CONFIG`.
3. **Implementar ▸ Administrar implementaciones ▸ ✏️ Editar** la implementación
   actual ▸ **Versión: Nueva versión** ▸ **Implementar**. La URL `/exec` no
   cambia.

> Primero el backend, después la web: un backend v6 atiende a la web anterior
> sin problema; una web v6 contra un backend v5 no podría guardar el
> responsable de una mascota.
