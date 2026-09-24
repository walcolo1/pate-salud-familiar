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

> **Resuelto en el cierre de G4** (al final de este documento).

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

> **Resuelto en el cierre de G4.** `connect-src` es ahora la lista exacta de
> hosts que usa el código, y una prueba lo mide.

---

# Cierre de G4

Dos partes: lo que encontró la segunda validación en vivo, y la limpieza que
quedaba pendiente.

## PERMISO_INSUFICIENTE: el titular no podía escribir historial

La validación en vivo de G4b-bis dio `ErrorBackend: PERMISO_INSUFICIENTE` al
guardar, y el cambio se revertía. Se sospechó de la fila del titular en
`ACCESO` —`paciente_propio` vacío— y de las mayúsculas del correo, con buen
criterio. No era ninguna de las dos.

`HISTORIAL` exigía `ESCRIBIR_HISTORIAL_VET`, un verbo **solo para mascotas**:
el Bloque D era el único que escribía historial. G0 mapeó el historial de las
personas a esa misma pestaña. Como `puede()` comprueba la especie **antes** de
mirar el rol, se denegaba **también al titular**. Dos piezas probadas por
separado y nunca juntas.

- El verbo pasa a `ESCRIBIR_HISTORIAL`, especie `CUALQUIERA`, con los mismos
  roles que tenía (cuidador y miembro, que ya podían escribir citas, controles
  y vacunas de personas). El lector sigue sin escribir nada.
- `contratoPermisos.test.ts` cruza las dos piezas: para cada pestaña que
  escribe el repositorio, pregunta al `puede()` de verdad si el titular puede
  escribir ahí sobre una persona. Una pestaña nueva mal emparejada se pone roja
  ahí, no con un dato clínico desapareciendo de la pantalla.

## Medio familiar en la hoja: las transacciones

Dar de alta a un familiar mandaba **tres lotes** (paciente, perfil, historial).
Con el historial denegado, los dos primeros entraban y el tercero no: filas
huérfanas en `PACIENTES` y `PERFIL_HUMANO`. El router ya valida un lote entero
antes de escribir nada; el fallo era partir una acción del usuario en varios.

Ahora una acción del usuario es **un lote**: `persistirPorMutacion` abre
`repo.transaccion()`, las escrituras se acumulan y `confirmar()` manda un solo
`aplicar`. O entra todo o no entra nada.

**Las filas huérfanas de los intentos fallidos siguen en la hoja.** No las
borra nadie: el router solo anexa. Se ven como un familiar sin historial; si
molestan, se dan de baja desde la aplicación.

## La limpieza que quedaba

**La hoja operacional de antes, fuera.** `repairGoogleNativeDatabase`,
`repairMemberDocuments`, `updateDeviceFromGoogle`, `createGoogleNativeDatabase`,
el onboarding `/onboarding/setup` que la creaba, la búsqueda en
`appDataFolder` y `googleSheetsOperational.ts` entero. `sinHojaVieja.test.ts`
impide que vuelvan sin que nadie lo decida.

**El ID de esa hoja se guardaba en el navegador.** `databaseSpreadsheetId` y
`databaseSpreadsheetUrl` viajaban en el estado persistido de `localStorage`.
Ya no existen en el modelo; un estado antiguo los pierde en el siguiente
guardado, y la purga del cierre de sesión los borra antes.

**El scope `spreadsheets` ya no se pide.** Es sensible y da acceso a **todas**
las hojas de la cuenta. La hoja de la familia la abre el Web App con su propio
permiso —el manifiesto de Apps Script lo sigue llevando, y debe—, y los dos
documentos de salida que crea la aplicación (la exportación familiar y el
informe individual) se escriben con `drive.file`, que Google permite para los
ficheros que crea la propia aplicación y que clasifica como no sensible.

**«Abrir la hoja» abre la del Web App.** El botón viejo abría el ID guardado de
la hoja anterior. El nuevo está en la tarjeta «Hoja de la familia» y pide la
dirección al despliegue con una acción nueva del router, `verHoja`: exige
identidad y el verbo del titular (`ADMINISTRAR_ACCESOS`), y arma la dirección
con el ID que guardó `instalar()`, sin abrir la hoja. No se guarda en ningún
sitio. La pestaña se abre **antes** de pedirla —un `window.open` después de un
`await` lo bloquea el navegador— y se cierra si falla, con el motivo.

## Lo que apareció al quitarla

**La carga del expediente al entrar dependía de la hoja vieja.** Solo ocurría
por `autoSyncOnLogin → checkForExistingDatabase`, que buscaba el ID viejo en
`appDataFolder` y **solo leía si lo encontraba**. La validación en vivo
funcionó porque la cuenta del titular aún guardaba esa configuración; una
familia que empezara con el Web App no habría cargado nunca su expediente al
entrar. Ahora basta con que el navegador tenga registrado el despliegue.

Esto no tiene prueba automática: el arranque real con sesión de Google no se
puede reproducir en el arnés. Va en la lista de la validación en vivo.

## Lo que hace falta del titular

1. **Pegar `apps-script/dist/Pate.gs` y publicar una versión nueva** del
   despliegue. Lleva el verbo del historial y la acción `verHoja`. Hasta
   entonces, las altas de familiares siguen fallando y «Abrir la hoja» dice que
   el despliegue es anterior.
2. **Comprobar en vivo**: dar de alta un familiar (tiene que aparecer en
   `PACIENTES`, `PERFIL_HUMANO` e `HISTORIAL`, o en ninguna); pulsar «Abrir la
   hoja» (tiene que abrir la hoja del Web App, no la antigua); cerrar sesión y
   volver a entrar (el expediente tiene que cargarse solo).
3. **`drive.appdata` ya no lo usa nada.** Solo lo usaba la búsqueda de la hoja
   vieja. No se quitó porque es un cambio de ámbito que no se pidió: es una
   decisión. Quitarlo de `OPERATIONAL_SCOPES` y de la pantalla de
   consentimiento no rompe nada que quede.
4. **La pantalla de consentimiento** puede dejar de declarar `spreadsheets`:
   el código ya no lo pide. Es un cambio en Google Cloud y lo hace el titular.

## Tras el cierre: la hoja sobrevive al cierre de sesión

La validación en vivo del cierre encontró esto: al cerrar sesión y volver a
entrar, el aviso ámbar pedía registrar la hoja otra vez y el panel decía
«0 familiares». La purga del cierre de sesión (A6-F2) borra toda clave `pate*`
que no esté en su lista blanca, y `pate:familia:v1` no estaba: se había
decidido que la dirección «desaparece con la sesión».

La decisión cambia: la dirección es la **vinculación del navegador con la
hoja**, no la sesión de nadie. Conservarla no abre nada, porque la /exec solo
contesta a `ping` sin un `id_token` de alguien que esté en `ACCESO`, y la
identidad sigue yéndose con el cierre (vive en memoria).

La lista blanca preserva por nombre, así que para esta clave se comprueba
también el valor: si no es una /exec válida, se borra como el resto. Si no,
cualquier cosa guardada con ese nombre sobreviviría a la purga.

En un ordenador compartido, quien entre después con otra cuenta hablará con el
mismo despliegue y recibirá `ACCESO_DENEGADO` si no está invitado. Cambiar la
dirección se hace desde la misma tarjeta de Ajustes.

## Tras el cierre: el expediente se carga solo al entrar

La validación en vivo: al entrar, «Mi familia: 0», y los datos solo llegaban
tras pasar por Ajustes y pulsar botones.

**Por qué.** La carga la disparaba un temporizador de 500 ms. Tras un F5,
AppContext restaura al usuario guardado y el temporizador se adelanta a la
credencial de GIS, que llega segundos después: la carga fallaba sin identidad
y el error se callaba. Cuando la credencial llegaba, se tomaba por una
renovación —mismo correo— y no se volvía a intentar nunca.

**Ahora.** `cargaAlEntrar.ts` lo coordina sin depender del orden: se intenta
al entrar, al llegar una credencial (`SesionGoogle.alRecibir`) y al registrar
la hoja, y carga **una vez por sesión** en cuanto están la hoja y la identidad.
Un fallo pasajero se reintenta en el siguiente disparo; las renovaciones de
cada hora no recargan nada. La identidad solo cuenta con un usuario de Google
ya activo: si la carga empezara antes de que `signIn` restaure el estado
local, ese estado pisaría lo recién descargado.

Mientras carga, el panel enseña «Trayendo el expediente de la hoja de tu
familia…» en lugar de «Aún no tienes familiares registrados», y no dice «(0)».

**Ajustes sin sincronización manual.** Fuera «Reconectar Google», el aviso
«Autorizar sincronización», «Sincronizar ahora», el interruptor de
sincronización en fondo —no controlaba nada desde G4b— y la ficha de permisos
por servicio con sus «Reconectar Drive/Calendar/Sheets». Subir documentos y
crear eventos piden su permiso solos cuando hace falta.
`ajustesSinManuales.test.ts` vigila que no vuelvan.

**Sin prueba automática del arranque real.** El arnés no puede entregar una
credencial de GIS. La coordinación está probada con dobles; el arranque de
verdad va en la validación en vivo: entrar, y también F5 con la sesión abierta.
