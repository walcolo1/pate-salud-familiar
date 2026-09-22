# G4 — el corte

**Estado: G4a y G4b hechos. Firebase no está, y cada cambio se escribe solo.**

G4 son dos cosas distintas que el plan trataba como una:

| | |
|---|---|
| **G4a** ✅ | Sacar Firebase: Auth, Firestore, las reglas, el SDK, la bandera |
| **G4b** ✅ | Que el repositorio escriba de verdad, y que el empuje por lotes se vaya (el antiguo Bloque H) |

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
mentira sobre la que ramificar. Se llama `sincronizacionManual`, y **G4b la
puso en `false`**. Esas cuarenta condiciones sobran ya: quitarlas es una
limpieza de pantallas, y va aparte para no esconder un cambio de backend dentro
de un diff de JSX.

---

## El embudo que G4a dejó preparado

`persistirPorMutacion` —antes `firebasePersist`— quedó escrito y apagado en G4a,
con la condición a la vista y en un solo sitio. **G4b lo encendió**: sus 28
llamadas escriben.

No se encendió antes porque el router **anexa filas** y el empuje por lotes
**reescribía pestañas enteras**. Los dos a la vez son lo peor de ambos.

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

# G4b — cada cambio se escribe solo

| Qué se fue | Líneas |
|---|---|
| `pushToGoogleInternal` (reescribía las 20 pestañas) | 232 |
| `syncNow` + `pushToGoogle` | 426 |
| La fusión «gana la última escritura» de la lectura | 174 |
| Las 27 llamadas a `scheduleAutoSync` y la función | — |
| La pantalla «Acceso Familiar Pendiente» | 131 |

`AppContext` bajó de **69 errores de lint a 42** sin tocar ninguno: se fueron
con el código.

## La lectura apuntaba a otra hoja

`readAllOperationalTables` leía la hoja que la PWA crea en el alta, por la API
de Sheets. El router escribe en la suya, la del despliegue.

Con la escritura ya movida, dejar la lectura donde estaba habría dado
exactamente el síntoma **«guardo y no aparece»**. Por eso la lectura tenía que
moverse en el mismo paso y no en el siguiente.

## La fusión no se simplificó: dejó de tener sentido

Eran 174 líneas decidiendo, fila a fila, si ganaba la copia local o la remota,
y dejando rastro en el historial cuando pisaba algo. Existían porque la copia
local podía tener cambios sin enviar.

Ahora cada cambio sale en el momento en que ocurre. La hoja es la verdad y se
lee entera.

---

## Las dos regresiones que encontró la suite, y una decisión que cambió

### El tablero no se veía

`if (!sincronizacionManual && !familyId)` enseñaba «Acceso Familiar Pendiente».
Significaba «backend Firebase y todavía sin documento de familia»; al girar la
bandera se volvió **permanentemente cierta**, porque `familyId` es `null`
siempre. Todo el mundo habría visto esa pantalla en vez de su expediente.

Lo encontró **S5**, la prueba del estado vacío, que no se escribió para esto.

### Deshacer el cambio ante un fallo de red era mala idea

La primera versión tiraba lo que el usuario acababa de escribir si la escritura
no salía. Ocho pruebas de A6-F2 se pusieron rojas — y no eran pruebas
obsoletas: protegían justo eso.

Así que cambió la regla, no las pruebas:

| Qué pasa | Qué se hace |
|---|---|
| Sin red, cerrojo ocupado, navegador sin hoja registrada | **Se guarda la escritura y se reenvía.** Quien apunta una vacuna en un ascensor no puede ver desaparecer lo que escribió |
| Permiso denegado, acceso revocado | **Se deshace.** Dejar el dato en pantalla sería prometer un guardado que no va a ocurrir |

No es la cola de sincronización que G4b vino a quitar: son **las mismas
mutaciones, reenviadas tal cual**. Repetir una es inofensivo porque la hoja
solo anexa y la última fila manda.

Lo mismo con el desbloqueo de sesión, que pasó a exigir backend: lo que hay en
memoria tras un bloqueo **no es un expediente a medias**, es el mismo que
había. Un fallo pasajero desbloquea con la copia local; un acceso revocado, no.

---

## El sondeo de G2, encendido

Al volver a la pestaña y cada 120 s con ella delante. Cuando la revisión
cambia, un aviso —«Hay datos nuevos en el expediente de la familia»— con un
botón para actualizar.

**No se recarga solo**, y es la decisión aprobada: recargar tira lo que el
usuario estuviera escribiendo, y en un expediente clínico eso es peor que
enseñar un dato de hace un minuto.

---

## Lo que queda apuntando a la hoja vieja

Tres utilidades de Ajustes siguen hablando por la API de Sheets con la hoja que
creó la PWA: `repairGoogleNativeDatabase`, `repairMemberDocuments` y
`updateDeviceFromGoogle`.

Ya no es la fuente de verdad, así que **reparan un sitio que nadie lee**. No se
tocaron porque son funciones de usuario y retirarlas es una limpieza de
pantallas, no de backend — pero hay que resolverlo, y la salida natural es
retirar la integración directa con Sheets entera: la hoja que la PWA crea en el
alta, el alta misma y el ámbito `spreadsheets` de OAuth.

---

## La comprobación en vivo, que es la que importa

Guardar una cita o un medicamento y mirar la pestaña: tiene que aparecer **una
fila nueva al final**, y las que había no pueden haberse movido. Si la tabla
entera cambió de aspecto, el empuje por lotes sigue vivo en algún sitio.

---

## Las puertas de G4a

| Puerta | Resultado |
|---|---|
| `test:run` | 1 070/1 070 ✅ (1 064 → 1 070) |
| `tsc` | 0 ✅ |
| `lint:cambiados` | sin regresiones; `AppContext` **baja de 72 errores a 69** ✅ |
| `build` | ✅ |

---

# La validación en vivo que no llegó a la hoja

**22 de septiembre de 2026.** Se guardaron una cita y un medicamento desde
`localhost:3000`. La interfaz los enseñaba; las pestañas `CITAS` y
`MEDICAMENTOS` seguían vacías. No salió ni una petición a `script.google.com`.

## Por qué, en orden

**1 · El navegador del titular no sabía dónde estaba su hoja.** La URL del
`/exec` solo la escribía `/invitacion`, al aceptar una invitación. El titular
nunca pasa por ahí: la hoja es suya. **No existía ninguna forma de que el
titular la registrara.** El router lo esperaba —el comentario de `ping` dice
que existe «para que la PWA compruebe la URL que acaba de pegar el titular»—,
pero nadie construyó el otro lado.

**2 · Y aunque se hubiera escrito, se leía de otro sitio.** `/invitacion` la
guardaba en `localStorage`; `identidad.ts` la buscaba en `sessionStorage`.

**3 · El fallo se volvió silencioso por una decisión mía de G4b.** Clasifiqué
`SIN_BACKEND` como fallo pasajero —«guardar y reenviar»—, y **escondí el
contador de pendientes** detrás de `sincronizacionManual`. El resultado fue
exactamente lo que el Bloque G vino a hacer imposible: una escritura que
**parece** guardarse y no llega a ninguna parte.

Ninguna prueba lo vio. Las del repositorio inyectan su propia sesión con la URL
puesta, y la suite E2E no tiene backend: `SIN_BACKEND` era su estado normal.

## Lo que se arregló

| | |
|---|---|
| **Registro de la hoja** | Tarjeta en Ajustes: se pega la URL, se comprueba con `ping` —que no pide identidad— y solo se guarda si contesta como Paté **y con el código de hoy** (la lección de E9-bis). Al registrarla, se reenvía en el acto lo que esperaba |
| **Un solo almacén** | `localStorage`, para quien escribe y quien lee. Una prueba recorre `src/` y lo exige |
| **Nada en silencio** | Aviso fijo arriba —«este navegador no sabe dónde está la hoja de tu familia»— y el contador de pendientes vuelve al tablero |
| **El reenvío, de verdad** | «Se reenviarán solos» no lo cumplía nadie: solo reintentaba el diálogo de cierre. Ahora reenvía cada vez que el sondeo consigue contestar y al volver la red |

## Lo que también apareció, y no era esto

**Service Worker.** No toca las escrituras al router —son `POST` de otro origen
y las deja pasar—, y hay una prueba que lo fija. Pero tenía su propio fallo:
sin red y sin la portada en caché, entregaba `undefined` a `respondWith`, y el
navegador lo convertía en *«Failed to convert value to 'Response'»*. Ahora
devuelve `Response.error()`, y otra prueba carga `sw.js` tal cual para
comprobar que toda salida es una `Response`.

**CSP.** GIS descarga una hoja de estilos de `accounts.google.com/gsi/style`
que `style-src` bloqueaba. Se abre **la ruta**, no el dominio: una hoja de
estilos también puede sacar datos. La suite no lo veía porque bloquea Google a
propósito.

**La renovación de la sesión se desenchufaba al salir de `/login`.** Su
`soltar()` ponía la renovación a `null` para toda la aplicación. A los 50
minutos de esta misma prueba, la sesión no se habría renovado. Ahora solo el
último arranque vivo la desenchufa.

## Lo que queda, dicho

**La cola de reenvío vive en memoria.** Guarda las mutaciones como funciones, y
una función no sobrevive a una recarga. Si la aplicación se cierra con cambios
pendientes, **se pierden** —siguen en pantalla, porque el estado local sí se
guarda, pero no llegan a la hoja hasta que se vuelvan a guardar—. El aviso lo
dice así: «se reenvían solos mientras la aplicación siga abierta». Hacerla
duradera exige guardar el lote de mutaciones y no la función, y es un paso
propio.

**La cita y el medicamento de la prueba** probablemente estén en ese caso: si
la pestaña se recargó, no están en la cola. Hay que volver a guardarlos después
de registrar la hoja.

**La CSP todavía nombra a Firebase.** `firebasestorage.googleapis.com` en
`img-src`, y los destinos de Firestore e Identity Toolkit en `connect-src`. Ya
no se usan, y el propio comentario de la CSP dice por qué eso importa:
permitir conexiones a un servicio que la aplicación no usa solo amplía la
superficie por la que podrían salir datos clínicos.
