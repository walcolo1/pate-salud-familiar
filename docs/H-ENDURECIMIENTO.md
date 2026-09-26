# Bloque H — Endurecimiento operativo y limpieza

Tres frentes: la cola de cambios sin enviar pasa al disco, `sincronizacionManual`
desaparece con todo lo que colgaba de ella, y el arnés cubre las costuras donde
el Bloque G encontró sus cinco puntos ciegos.

---

## 1 · La cola de reenvío, en el disco

**Antes.** `escriturasPendientesRef` guardaba **funciones** en memoria. Un F5, o
cerrar el navegador sin conexión, perdía los cambios pendientes: seguían en
pantalla, porque el estado local sí se guarda, pero no llegaban nunca a la hoja.
Y peor: la recarga ponía el contador a cero, así que el diálogo de cierre ya no
avisaba y se podía salir purgando sin saber que había algo sin enviar.

**Ahora.** `colaDuradera.ts` guarda en `localStorage`, bajo `pate:cola:v1`, los
lotes de mutaciones **ya construidos**, en JSON:

```json
{ "version": 1,
  "lotes": [{ "id": "lote-…", "creadoEn": "2026-09-25T10:00:00.000Z",
              "mutaciones": [{ "tabla": "CITAS", "accion": "ESCRIBIR",
                               "fila": { … }, "pacienteId": "…", "especie": "HUMANO" }] }] }
```

Entidad (`tabla`), acción (`ESCRIBIR` o `DAR_DE_BAJA`), carga (`fila`) y hora
(`creadoEn`). La acción es para quien lea la cola: no viaja al router.

**El orden de una acción del usuario** (`persistirPorMutacion`):

1. Se construye el lote **sin tocar la red** (`construirLote`): una acción, un
   lote, para que el router lo acepte entero o nada.
2. Se escribe en el disco **antes** de enviarlo. Si la pestaña muere a mitad de
   la petición, el lote sigue ahí. Reenviar algo que sí llegó es inofensivo: la
   hoja solo anexa y la última fila manda.
3. Se vacía la cola en orden (`despachadorCola.ts`).

**FIFO estricto.** Si hay algo esperando, lo nuevo sale detrás. La hoja resuelve
«la última fila que habla manda»: una edición vieja que saliera después de una
nueva la pisaría. Por eso un fallo pasajero **detiene** el despacho en vez de
saltarse el lote.

| Respuesta | Qué hace |
|---|---|
| llegó | fuera de la cola |
| fallo pasajero (sin red, cerrojo, sin hoja, sin credencial) | se detiene; ese lote y los de detrás esperan |
| rechazo del router | fuera de la cola, se deshace en pantalla si es el cambio recién hecho, y se avisa; si venía de antes de un F5, se avisa y se ofrece releer la hoja |

**Cuándo se vacía:** al guardar, al llegar una credencial (`SesionGoogle.alRecibir`
— tras un F5 llega segundos después de montar), al volver la red, cuando el
sondeo de revisión contesta, y antes de cualquier lectura.

**Antes de leer, lo pendiente.** `pullFromGoogle` vacía primero la cola; si no
sale, **no lee**: el expediente de la hoja no tiene esos cambios y aplicarlo los
quitaría de la pantalla. La copia local, que sí los tiene, es la mejor vista; se
lee cuando la cola se vacía.

**Lo que hay en el disco no se cree a ciegas.** Cualquier extensión puede
escribir ahí. Cada lote se valida al leer; uno que apunte a `ACCESO` o
`AUDITORIA`, que `aplicar` no acepta, se descarta antes de llegar al router.

**Sin almacén utilizable** (modo privado, cuota llena) la cola sigue en memoria y
se avisa una vez: «si cierras la pestaña sin conexión, se perderán».

## Quién puede borrar la cola

Contiene datos clínicos, como el estado local que ya vive en `localStorage`, y la
purga del cierre de sesión la trata igual. La diferencia la decide **el motivo
del cierre** (`descartaCola` en `cierreSesion.ts`):

| Motivo | ¿Borra la cola? | Por qué |
|---|---|---|
| `DIALOGO` | sí | a la purga solo se llega sin pendientes, o tras «Salir y descartar» y su segunda confirmación |
| `BLOQUEO_8H` | **no** | la pestaña se quedó bloqueada y se cierra sola; nadie ha confirmado nada |

Y los dos botones de cierre de Ajustes, que iban directos a `signOut()` y a la
purga, pasan ahora por el diálogo. `ajustesSinManuales.test.ts` lo vigila.

La dirección de la hoja (`pate:familia:v1`) sobrevive a cualquier cierre, como
desde el cierre de G4.

**Límite conocido.** La cola no sabe de quién es: guardarlo sería guardar un
identificador. Si tras un cierre automático entra **otra cuenta** en el mismo
navegador, lo pendiente sale con **su** identidad y **sus** permisos —el router
los comprueba igual— y en la auditoría figura quien lo envió. En una aplicación
familiar de uso personal es aceptable; en un ordenador compartido, el diálogo de
cierre es el que protege.

## 2 · Fuera `sincronizacionManual`

Valía `false` desde G4b, y todo lo que colgaba de ella era código que no se
ejecutaba nunca. Salieron la constante, el campo del contexto y todas las ramas
de la interfaz, y con ellas lo que se quedó sin nadie que lo usara:

- La ficha «Diagnóstico de Sincronización» de Ajustes: entera detrás de la
  bandera, nunca visible.
- Las dos salidas a Sheets del navegador: la **exportación familiar** —su
  función existía pero ningún botón la llamaba— y el **informe clínico
  individual**, que solo aparecía detrás de la bandera. Quedaron superadas por
  las invitaciones con rol: un familiar entra a la aplicación con sus permisos
  en vez de recibir una hoja suelta. Con ellas, `googleSheets.ts`,
  `informeIndividual.ts`, `exportToSheets`, `generateAndShareMemberReport`,
  `revokeMemberReportShare`, `connectSheets` y el estado `sheets*`.
- `sheets.googleapis.com` sale de la CSP: el navegador ya no habla con Sheets.
- La pantalla de «crear familia / aceptar invitación» de Firestore que seguía
  en el panel sin renderizarse, y un puñado de variables e imports sin uso.

**Lo que queda, dicho.** `sharedReports` y `lastExportMetadata` siguen en el
estado persistido y en el contrato de las 16 estructuras que se vacían al
bloquear. Ya no los escribe nadie. Quitarlos es una migración del esquema local,
no una limpieza, y va aparte.

## 3 · El arnés, en las costuras

Los cinco puntos ciegos del Bloque G estaban **entre** piezas que se probaban por
separado. `cicloColaDuradera.test.ts` ensambla las de verdad —`RepositorioBackend`,
`SesionGoogle`, la cola sobre un almacén que sobrevive a la «recarga»— y solo
falsea la red y el reloj:

> mutación sin red → cola en disco → F5 → la red vuelve sin credencial (no sale
> nada, no se pierde nada) → llega la credencial → despacho automático → lo que
> llega al router es exactamente lo construido → cola y clave vacías.

Se comprobó que sabe fallar: desconectando el disparador de la credencial, se
pone en rojo.

En el navegador, `e2e/cola-duradera.e2e.ts`: el lote en el disco con su forma,
que sobrevive a un F5 y el panel lo cuenta, que cerrar sesión tras el F5
**avisa**, que cancelar no borra nada, que descartar borra la cola pero no la
hoja, y que el botón de Ajustes también avisa.

**Lo que no cubre el arnés:** el despacho con una credencial real de GIS contra
un Web App real. Eso es la validación en caliente.
