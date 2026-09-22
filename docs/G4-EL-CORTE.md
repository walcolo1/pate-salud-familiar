# G4 — el corte

**Estado: G4a hecho. Firebase ya no está en la aplicación.**

G4 son dos cosas distintas que el plan trataba como una:

| | |
|---|---|
| **G4a** ✅ | Sacar Firebase: Auth, Firestore, las reglas, el SDK, la bandera |
| **G4b** ⬜ | Que el repositorio escriba de verdad, y que el empuje por lotes se vaya (esto es el antiguo Bloque H) |

Van separadas porque **son independientes**, y juntarlas habría mezclado una
eliminación mecánica —que las pruebas verifican— con un cambio de
comportamiento que no pueden verificar solas.

---

## Qué se fue

| | Líneas |
|---|---|
| `firestoreService.ts` | 2 206 |
| `firestore.rules` | 577 |
| `migrateSheetsToFirestore.ts` | 564 |
| `firebaseRepository.ts` | 587 |
| `firebase.ts` | 154 |
| `dataBackend.ts` (la bandera) | 120 |
| `sheetsRepository.ts` (el alias de G0) | 26 |

Más la dependencia `firebase@^12.15.0` del `package.json` y las seis variables
de entorno.

Las 577 líneas de reglas incluían las 106 `allow` que auditó el Bloque A, entre
ellas la que concedía acceso **cuando faltaba el documento**.

## La bandera no se cambió: se retiró

Dejarla puesta era dejar el camino de vuelta. `getDataRepository()` ya no
elige: devuelve `RepositorioBackend` y punto.

---

## Tres cosas que aparecieron al quitarlo

### 1 · `/settings` le decía al usuario que sus datos vivían en Firebase

Tres textos de la pantalla de ajustes describían la arquitectura: *«la base de
datos operacional se aloja en Firebase Firestore»*, *«tus datos están
respaldados de forma segura en la nube de Firebase»*.

Estaban tras una condición que hoy elige el texto correcto, así que **nadie
llegó a leer la versión falsa**. Pero la rama seguía ahí y se habría vuelto
visible sola en G4b. Se borró la rama muerta, no solo la condición.

### 2 · Borrar el SDK no borra la caché

Firestore guardaba en IndexedDB una copia de **todo documento leído**: el
expediente completo. Sigue en el disco de quien usó la versión anterior, y
quitar el SDK no la toca.

`purgaFirestore.ts` se reescribió sobre IndexedDB directamente —enumerar y
borrar por nombre— y **se queda una temporada**, hasta que esos navegadores
hayan pasado por aquí.

Con una pérdida escrita: sin `databases()` —navegadores viejos— no hay forma de
dar con la base de Firestore, porque su nombre lleva dentro el identificador
del proyecto y ese se fue con la configuración. Ahí se borra lo que tiene
nombre fijo y se deja de reintentar: volver cada arranque a no encontrar nada
no limpia nada y sí gasta el arranque de todos.

La regla que no se movió: **una purga a medias nunca se reporta como éxito**.
Si otra pestaña tiene la base abierta, el borrado se queda bloqueado y la purga
queda `diferida`. Decirle a alguien que sus datos clínicos se borraron cuando
siguen ahí es la peor forma de fallar que tiene ese módulo.

### 3 · La bandera no era una bandera: era una pregunta de interfaz

Cuarenta sitios de la interfaz ramificaban sobre `isFirebaseBackend`, y ninguno
preguntaba de verdad «¿qué base de datos hay detrás?». Preguntaban **«¿enseño
el botón de sincronizar y el contador de pendientes?»**.

Dejar un `isFirebaseBackend: false` en el contexto habría sido dejar una
mentira sobre la que ramificar. Se llama `sincronizacionManual`, hoy vale
`true`, y **pasa a `false` en G4b** — momento en el que esas cuarenta
condiciones sobran enteras.

---

## Lo que queda encendido, y no está escondido

`persistirPorMutacion` —antes `firebasePersist`— es el embudo por el que pasarán
todas las escrituras. Hoy **no escribe**, y sus 28 llamadas no hacen nada.

Eso suena exactamente a la escritura muda que el Bloque G vino a hacer
imposible, así que conviene la distinción: una escritura muda es la que
**parece** guardar y no guarda. Aquí no lo parece. La condición tiene nombre
(`SINCRONIZACION_MANUAL`), está escrita arriba del proveedor con su motivo, y se
apaga en **un** sitio.

No se encendió ahora porque el router **anexa filas** y el empuje por lotes
**reescribe pestañas enteras**. Los dos a la vez son lo peor de ambos.

---

## El trinquete: que no vuelva sin que nadie se entere

`sinFirebase.test.ts` recorre `src/` y exige que **nadie importe el SDK**, con
una lista corta de ficheros a los que se les permite nombrarlo y **el motivo
escrito al lado**. Mira el código desnudo de comentarios: explicar qué había
antes no cuenta como usarlo.

Lo que esto impide no es que alguien lo añada a propósito —eso sería una
decisión, y las decisiones se discuten—: es que vuelva arrastrado por una
dependencia transitiva o por un ejemplo copiado.

---

## Lo que falta

**G4b**, que es el antiguo Bloque H:

- `SINCRONIZACION_MANUAL` a `false`.
- El empuje por lotes —`scheduleAutoSync` y `writeAllOperationalTables`, que
  reescribe las 20 pestañas operativas en cada guardado— **fuera**.
- La lectura, del repositorio en vez de la hoja directa.
- Encender el sondeo de G2, que sigue escrito y sin instanciar.
- El renombre `deleteX` → `darDeBajaX`, que se aplaza a ese paso a propósito:
  hacerlo ahora sería tocar el contrato en el mismo commit que retira un
  backend, y entonces un fallo no diría cuál de las dos cosas lo causó.

Y una comprobación en vivo que solo puede hacerse con G4b puesto: **guardar
algo y verlo aparecer en la hoja**, fila a fila, en vez de por reescritura
completa.

---

## Las puertas de G4a

| Puerta | Resultado |
|---|---|
| `test:run` | 1 070/1 070 ✅ (1 064 → 1 070) |
| `tsc` | 0 ✅ |
| `lint:cambiados` | sin regresiones; `AppContext` **baja de 72 errores a 69** ✅ |
| `build` | ✅ |
