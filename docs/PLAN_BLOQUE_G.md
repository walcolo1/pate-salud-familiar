# Bloque G — el corte seco de Firebase

Después de E, cada familia tiene su propio backend: su hoja, su despliegue, su
Drive. Firebase sigue ahí porque fue lo que hubo antes, y ahora sobra: es un
servicio central que guarda datos clínicos de todo el mundo en un sitio que no
es de nadie. Sacarlo no es una limpieza de dependencias, es quitar el único
punto donde los expedientes de varias familias se tocan.

**Decisiones tomadas antes de empezar** (20 de septiembre de 2026):

- Los datos que hay hoy en Firestore son **de prueba**. Se empieza limpio: sin
  migración, sin verificación de paridad, sin Firebase en solo lectura.
- La sincronización pasa a ser **híbrida**: revisión al abrir y al recuperar el
  foco, y sondeo pasivo cada 90–120 s **solo con la pestaña visible**.

---

## Lo que el reconocimiento encontró, y cambia el plan

### 1 · La abstracción existe y ya se usa

`DataRepository` tiene **37 métodos** y dos implementaciones. Las escrituras de
la aplicación pasan por **un solo embudo** —`firebasePersist`, 33 llamadas— que
ya resuelve el repositorio por bandera. No hay que reescribir la aplicación:
hay que escribir una implementación más.

### 2 · `SheetsRepository` está hueco

Los 37 métodos están, y **todos los de escritura tienen el cuerpo vacío**:

```ts
async saveMember(_ctx: RepositoryContext, _m: FamilyMember): Promise<void> {}
```

No es un descuido: el camino de Sheets nunca usó el repositorio. Guarda por
otro sitio, y ese otro sitio es el problema del punto 3.

Consecuencia que hay que tener presente: **hoy, girar la bandera a `sheets` sin
más haría que la aplicación pareciera guardar y no guardara nada.** Las
promesas se resuelven, la interfaz no se queja y los datos se pierden en
silencio. Es la primera cosa que el plan tiene que hacer imposible.

### 3 · G y H son el mismo trabajo

El camino de Sheets guarda con `scheduleAutoSync` —**27 llamadas**, 4 segundos
de espera— que acaba en `writeAllOperationalTables`: una función que **reescribe
las 20 pestañas operativas enteras** en cada guardado.

Eso es exactamente lo que el **Bloque H** quiere eliminar. Y es incompatible
con lo que E6 construyó: `aplicar()` recibe **un lote de mutaciones concretas**,
valida cada una contra el rol de quien la pide y escribe solo esas filas.

Reescribir el expediente entero cada cuatro segundos contra el router sería
además lo peor de los dos mundos: más cuota, más riesgo y ninguna de las
garantías de E5.

> **Propuesta: G absorbe H.** No como añadido, sino porque hacer G bien lo
> obliga. La implementación nueva escribe por mutación; cuando esté, el
> autoguardado global se queda sin llamadas y se borra. Hacerlo al revés
> —conservar el autoguardado y adaptarlo— es construir sobre lo que el
> siguiente bloque viene a demoler.

### 4 · Los binarios no se mueven

Los documentos clínicos ya viven en **Drive**; Firestore solo guarda metadatos
(`driveFileId`, `driveUrl`). No hay ficheros que migrar, y como los datos
actuales son de prueba, tampoco metadatos.

### 5 · Las dos hebras son separables

**Datos** (Firestore) y **autenticación** (Firebase Auth) son independientes.
Auth solo aparece en dos ficheros. Se pueden cortar por separado, y conviene:
son riesgos de naturaleza distinta y mezclarlos hace imposible saber cuál rompió
qué.

---

## Los pasos

Cada uno termina en informe y parada, como en todo el proyecto.

### G0 · El repositorio de verdad, sin tocar nada vivo ✅

**Hecho el 21 de septiembre de 2026.** El contador de escrituras mudas pasó de
**31 a 0**. Lo que se decidió por el camino —el registro solo-anexa, el colapso
de lectura, `exportar` frente a once consultas por persona— está en
[G0-REPOSITORIO.md](G0-REPOSITORIO.md), con la única decisión que devuelve sin
resolver: la columna de paciente de `EXAMENES_RESULTADOS`.

Escribir `RepositorioBackend`: los 37 métodos contra el router de E, hablando
`aplicar`, `consultar`, `listarPacientes` y `obtenerRevision`.

Se construye **al lado**, sin cambiar la bandera y sin tocar `AppContext`. Al
terminar, la aplicación sigue funcionando exactamente igual que hoy.

Lo que hay que resolver aquí y no es mecánico:

- **El mapeo de modelos a pestañas.** `AllFamilyData` tiene 16 colecciones y el
  esquema tiene 21 pestañas. No es uno a uno.
- **Los identificadores.** Firestore los genera; la hoja no. Quién los inventa
  y cuándo.
- **El borrado.** El contrato tiene `deleteX`; el esquema hace **baja lógica**
  (`borrado_en`). Un `delete` que borra de verdad rompería la regla de que nada
  se borra.
- **`familyId`.** En Firestore identificaba a la familia. Aquí la familia **es
  la hoja**, y la decide la URL del despliegue. Probablemente sobre; hay que
  decidirlo, no arrastrarlo.

**Puertas:** una **suite de contrato compartida** que las implementaciones pasen
por igual —es lo que hace seguro el cambio de bandera—, más `test:run` sin
regresiones, `tsc 0`, lint limpio, E2E y axe sin caídas.

### G1 · Que no se pueda perder un dato en silencio ✅

**Hecho el 20 de septiembre de 2026, y antes que G0** por decisión expresa: la
red antes del salto.

`src/lib/contratoRepositorio.ts` clasifica los 37 métodos en **31 de escritura
y 6 de solo lectura**, y mira el cuerpo de cada uno: mudo es el que no llama,
no espera, no asigna y no lanza. No ejecuta el repositorio —haría falta un
backend— sino que lee su código, y basta para lo que tiene que atrapar.

**La puerta se vio en rojo antes de aceptarla.** Con la línea base vacía, la
prueba falla nombrando las **31 de 31** escrituras mudas de `SheetsRepository`.

La línea base recoge esas 31 para que la suite no viva en rojo, y **solo puede
menguar**: una prueba rechaza cualquier muda nueva, otra rechaza que la lista
apunte algo ya arreglado, y una tercera vigila que el total no suba. Es el
mismo trato que `lint-baseline.json` y `axe-baseline.json`.

**Ese número —31— es la deuda de G0 y se mide sola.** Cuando llegue a cero, el
cambio de bandera es seguro por construcción.

`FirebaseRepository` queda fuera: inicializa Firebase al importarse y no se
puede instanciar en las pruebas. No es un agujero que dure — **G4 lo borra**.

### G2 · La sincronización híbrida ✅

**Hecho el 21 de septiembre de 2026.** 120 s en primer plano, nada en segundo,
y el regreso como disparador primario. Las dos cosas que había que medir antes
de fijar el intervalo están resueltas: la cuota (20.000 llamadas/día en cuenta
@gmail.com; el sondeo gasta el 1,2 %) y qué hacer cuando cambia la revisión
—que sigue **abierta a propósito**, con `alCambiar` como llamada de vuelta—.
Ver [G2-SINCRONIZACION.md](G2-SINCRONIZACION.md).

`obtenerRevision` al abrir y al recuperar el foco (`visibilitychange`), y
sondeo cada 90–120 s **solo con la pestaña visible**. En segundo plano se
detiene: ni cuota ni batería.

Lo pactado, con dos cosas que hay que medir antes de fijar el intervalo:

- **Cuánto cuesta en cuota.** Una pestaña abierta ocho horas son ~300 peticiones
  al día. No he verificado qué límite tiene un Web App en cuenta gratuita, y no
  voy a escribirlo de memoria.
- **Qué pasa cuando la revisión cambia.** Recargar todo es sencillo y tira lo
  que el usuario estuviera escribiendo. Hay que decidir si se recarga, se avisa,
  o se recarga solo lo que no está en edición.

**Puertas:** pruebas con reloj y visibilidad simulados —que en segundo plano no
sale ni una petición— y la medida de cuota, clasificada como real.

### G3 · Salir de Firebase Auth — G3a ✅, G3b pendiente

**G3a, el 21 de septiembre de 2026:** la sesión con su ventana de 50 minutos y
el reintento del repositorio. Con dos correcciones al diseño aprobado que
conviene leer antes de seguir —**GIS no renueva en silencio** y **el router no
devuelve 401**—, en [G3-IDENTIDAD.md](G3-IDENTIDAD.md).

La PWA ya sabe obtener un `id_token`: `/invitacion` lo hace desde E9. Aquí se
generaliza a toda la sesión y desaparecen `signInWithCredential` y
`onAuthStateChanged`.

Es el paso más corto y el más arriesgado: toca el inicio de sesión de todos. Va
**después** de G2 para que, si algo se tuerce, se sepa que fue esto.

Lo que hay que resolver: **la caducidad**. Un `id_token` de Google dura una
hora; Firebase Auth renovaba solo. Sin él, hay que decidir si se pide token
nuevo de forma silenciosa, o si la sesión se corta y se vuelve a entrar.

**Puertas:** E2E de inicio y cierre de sesión, la suite de bloqueo de sesión
(A6-F3) sin caídas, y el recorrido real de un familiar invitado otra vez de
punta a punta.

### G4 · El corte

Con las dos hebras cortadas:

- Bandera a `firebase` **retirada**, no cambiada: dejar la opción es dejar una
  forma de volver a un sitio al que no queremos volver.
- `firebaseRepository.ts`, `firestoreService.ts` (2 206 líneas),
  `migrateSheetsToFirestore.ts` y `firebase.ts` **fuera**.
- `firestore.rules` **fuera**: 577 líneas y 106 reglas `allow`, entre ellas la
  clase de fallo que la auditoría del Bloque A encontró concediendo `true`
  cuando faltaba el documento.
- La dependencia `firebase@^12.15.0` **fuera** del `package.json`.
- El autoguardado global y sus 27 llamadas, **fuera** (esto es H).
- La caché de IndexedDB, **purgada** en los navegadores que ya la tengan:
  `purgaFirestore.ts` existe desde A6-F2 y hay que dejarlo corriendo una
  temporada antes de borrarlo también, o los datos de prueba se quedan en el
  disco de quien ya abrió la aplicación.

**Puertas:** `test:all` en verde, y una que importa más que el verde —
**buscar `firebase` en `src/` y que no haya nada**, con una prueba que lo fije
para que no vuelva a entrar por una dependencia transitiva.

### G5 · El proyecto de Firebase

Apagarlo del todo: reglas, base de datos, proyecto.

**Este paso no lo hago yo.** Toca la consola de Firebase, y la regla de este
proyecto es que no cambio Google Cloud ni Firebase por iniciativa propia. Lo
dejo escrito con sus comprobaciones y lo ejecutas tú.

---

## El orden, y por qué

```
  G1  ninguna escritura puede ser muda    ✅ la red, puesta antes del salto
  G0  repositorio nuevo, al lado          ← nada cambia todavía
  G2  sincronización híbrida              ← con el repositorio nuevo ya puesto
  G3  fuera Firebase Auth                 ← la hebra arriesgada, sola
  G4  el corte y la limpieza              ← cuando nada depende ya
  G5  apagar el proyecto                  ← tuyo
```

G1 y G0 no cambian el comportamiento de nada: son atar y construir. El primer
paso que un usuario nota es G2. Si algo se rompe en G3, se sabe que fue la
autenticación, porque los datos llevaban dos pasos funcionando.

---

## Lo que este bloque NO hace

- **No migra datos.** Decisión tomada: los de Firestore son de prueba.
- **No toca el backend de Apps Script.** El Bloque E está cerrado y validado; G
  consume lo que E dejó, no lo cambia. Si G necesitara un cambio en el router,
  eso es una señal de que algo se diseñó mal y hay que pararse a mirarlo.
- **No añade ámbitos de OAuth** ni toca el cliente. Si hiciera falta, **paro y
  aviso** antes.
- **No apaga nada en la consola de Google.** Eso es G5 y es tuyo.

---

## Las dos cosas que hay que decidir dentro de G

No bloquean el arranque —G0 se puede escribir sin ellas— pero sí hay que
resolverlas antes de G2 y G3:

| Cuándo | Qué | Por qué no lo decido yo |
|---|---|---|
| Antes de **G2** | Qué pasa cuando la revisión cambia mientras alguien escribe | Recargar y tirar lo que estaba escribiendo es una decisión de producto, no de código |
| Antes de **G3** | Si la sesión se renueva sola o se corta a la hora | Es la diferencia entre una aplicación que te echa a media tarde y una que pide permiso callada |

Las dos las traeré con opciones medidas cuando toque, no antes.
