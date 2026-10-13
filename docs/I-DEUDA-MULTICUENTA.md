# Bloque I — Deuda técnica y blindaje multicuenta

Dos puntos que el Bloque H dejó anotados: dos campos del estado local que ya no
escribía nadie, y una cola de cambios sin enviar que no sabía de quién era cada
cambio.

---

## 1 · Fuera `sharedReports` y `lastExportMetadata`

Eran de las salidas a Sheets que el Bloque H retiró. Salen del modelo de dominio,
del estado de AppContext, del tipo del estado guardado y del contrato de
estructuras clínicas que se vacían al bloquear, que pasa de **16 a 15**.

**La migración es transparente y ocurre al leer** (`leerExpediente`, en
`lecturaExpediente.ts`): si el expediente guardado conserva alguno de los campos
retirados —estos dos, y los tres de la hoja operacional de G4
(`databaseSpreadsheetId`, `databaseSpreadsheetUrl`, `appDataFileId`)—, se quitan
y el expediente se **reescribe en el acto**. Esperar al próximo guardado dejaría
el identificador de una hoja en el disco hasta que alguien tocara algo. No se
reinicia ningún perfil ni se toca nada más del expediente; un expediente ya
limpio no se reescribe, y si el almacén está lleno la lectura devuelve el
expediente limpio igual.

## 2 · Cada lote de la cola sabe de qué cuenta es

**El problema.** La cola sobrevive al cierre automático por 8 horas de bloqueo
(Bloque H). Si después entraba **otra cuenta** en el mismo navegador, lo
pendiente salía con **su** credencial: en la hoja quedaba como hecho por quien
no lo hizo.

**Sin guardar quién es.** La regla del proyecto prohíbe guardar en el navegador
correos, UID o identificadores. Así que cada lote guarda una **huella**
(`huellaCuenta.ts`):

    huella = SHA-256(sal || ':' || sub)

`sub` es el identificador estable de la cuenta en el `id_token`. La sal son 128
bits aleatorios que viven **dentro de la cola** y se van con ella. Con otra sal
la misma cuenta da otra huella, así que no sirve fuera de este navegador. No es
un secreto —con la sal y una lista de candidatos se podría probar quién es—, y
por eso la cola sigue purgándose como el resto del expediente; sirve para
comparar, que es lo único que se pide.

**Formato v2** de `pate:cola:v1` (la clave no cambia; la versión va dentro):

```json
{ "version": 2, "sal": "…32 hex…",
  "lotes": [{ "id": "lote-…", "creadoEn": "…", "cuenta": "…64 hex…", "mutaciones": [ … ] }] }
```

**Al encolar**, la huella es la de la cuenta que está dentro (`user.googleId`,
que es el `sub` de su credencial; si faltara, el de la credencial en memoria).

**Al despachar**, el despachador pregunta la cuenta de la credencial con la que
va a enviar y **solo envía los lotes de esa cuenta**, en su orden. Los de otra
cuenta se quedan **retenidos**: no bloquean los propios y salen cuando su dueña
vuelva a entrar. Sin credencial no sale nada.

**Leer la hoja** espera solo a lo propio: lo retenido de otra cuenta no puede
salir con esta credencial, y bloquear la lectura por ello sería para siempre.

**El panel lo dice**: si hay retenidos, el aviso de pendientes añade cuántos son
de otra cuenta y que saldrán cuando esa cuenta vuelva a entrar.

**La cola v1** (Bloque H) no tenía dueño. Al arrancar, sus lotes se atribuyen a
la cuenta que estaba dentro —es la que los hizo, porque un cierre de sesión la
habría borrado del almacenamiento—. Si no hay nadie dentro (un cierre
automático), se quedan sin dueño: no los envía nadie, cuentan como pendientes y
el diálogo de cierre deja descartarlos.

## Pruebas

- `huellaCuenta.test.ts`: determinista por sal, distinta por cuenta y por sal,
  sin el identificador dentro; `sujetoDe` lee el `sub` del token.
- `colaDuradera.test.ts`: huella y sal en el disco, sal estable entre recargas,
  separación por cuenta con el orden de cada una, lectura y migración de v1.
- `despachadorCola.test.ts`: solo envía lo de la cuenta activa, lo ajeno no
  bloquea, la dueña lo recupera en orden, sin credencial nada, sin dueño nada.
- `cicloColaDuradera.test.ts`, con las piezas de verdad: **A** guarda sin red,
  la pestaña se cierra sola, entra **B** con red y no sale nada de A; vuelve A y
  sale exactamente lo que construyó. Y B envía lo suyo aunque haya retenidos de
  A delante. Se comprobó que sabe fallar: con el despachador ignorando la
  cuenta, seis pruebas se ponen en rojo.
- `lecturaExpediente.test.ts`: la migración quita los campos, reescribe el
  disco, no toca nada más y no reescribe lo ya limpio.
- `e2e/cola-duradera.e2e.ts`: en el navegador, el lote lleva una huella de 64
  hexadecimales y en el disco no aparecen ni el `sub` ni el correo; una cola v1
  sembrada se migra sola a v2 y se atribuye.

**Lo que no cubre el arnés:** el cambio de cuenta con dos cuentas de Google
reales. Eso es la validación en caliente.

## Validación en vivo (evidencia real, cuenta personal del titular)

Sobre `a852e6b`: `pate:cola:v1` en v2 con sal y huellas de 64 caracteres, sin
correo ni identificador; envío FIFO; `sharedReports` y `lastExportMetadata`
purgados del almacenamiento local sin tocar los perfiles; 15 estructuras.

**No visto en vivo:** el aislamiento con una segunda cuenta de Google real
(paso 2 del protocolo). Está cubierto por `cicloColaDuradera.test.ts` con las
piezas de verdad, pero no con dos cuentas reales.
