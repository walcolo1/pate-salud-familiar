# Accesibilidad

> Bloque C completo · C1.1 a C1.5, C2, C3.1 a C3.4, cerrado en C4 · Última actualización: **2026-09-09**

## Resumen del Bloque C

Este documento creció paso a paso y cada sección explica su momento. Esto es lo
que quedó al cerrarlo.

### Dónde estaba y dónde está

| | Antes de C1 | Al cerrar C4 |
|---|---|---|
| Violaciones de axe | Sin medir | **0** en 25 mediciones, en las cuatro gravedades |
| Campos con nombre accesible | 13 de 102 | **102 de 102** |
| Diálogos de verdad | 0 de 11 | **11 de 11** sobre `<dialog>` nativo |
| `window.confirm` / `alert` | 18 / 46 | **0** / 23, y los 23 son errores recuperables |
| Foco visible | 88 `outline-none`, cero reglas de `:focus-visible` | Regla global |
| Zoom | Bloqueado (`userScalable: false`) | Permitido hasta ×5 |
| Estado de error de carga | **No existía** | `EstadoError` en un único punto |
| Pruebas | 191 unitarias, 65 E2E | **298 unitarias, 115 E2E** |

### Qué se arregló en cada paso

| Paso | Qué hizo |
|---|---|
| **C1.1** | Arnés de axe con línea base que solo puede bajar |
| **C1.2** | Los 7 controles sin nombre accesible que se medían entonces |
| **C1.3a** | `Dialog` sobre `<dialog>` nativo, 8 diálogos migrados y **cobertura ampliada de 5 a 21 mediciones** |
| **C1.3b** | Los 3 diálogos de órdenes, 18 `confirm` y 23 `alert` |
| **C1.4** | 89 campos de formulario con etiqueta asociada |
| **C1.5** | Contraste AA, foco visible, teclado y zoom |
| **C2** | Estados de carga, vacío y error unificados |
| **C3.1** | Agenda unificada de citas, tomas y controles |
| **C3.2** | Avisos locales sin un solo dato clínico |
| **C3.3** | La ficha del familiar deja de ser nueve pantallas sueltas |
| **C3.4** | Pautas de medicación con tope e historial intacto |

### Lo que la medición enseñó de sí misma

En C1.3a las críticas pasaron de **0 a 27** sin que nada empeorara: los campos
sin etiqueta vivían dentro de diálogos cerrados, y axe solo ve lo que está
pintado. Medir cinco rutas en reposo daba cero y hacía invisibles a la vez la
deuda y su arreglo.

Es la lección más útil del bloque: **un arnés verde puede significar que no se
está mirando**. Por eso cada subruta se mide dos veces —en reposo y con su
diálogo abierto— y por eso la puerta se probó rompiéndola a propósito.

### Seis fallos que aparecieron al escribir las pruebas

Ninguno se buscaba. Todos salieron porque una prueba exigió algo que el código
decía cumplir:

1. **El expediente se borraba solo.** `loadAppState` hacía `removeItem` ante un
   fallo de lectura: un byte corrupto destruía el historial de una familia sin
   avisar. Y la pantalla decía «Aún no tienes miembros registrados».
2. **El Service Worker no se registraba nunca.** El registro colgaba de un
   `addEventListener('load')` instalado después de que ese evento ya hubiera
   ocurrido. Sin caché de PWA ni avisos, y sin un error en consola.
3. **Los identificadores de las tomas chocaban.** `dose-${Date.now()}-${azar}`
   dentro de un bucle: con 400 tomas, más del 90 % de probabilidad de colisión.
   Dos tomas con el mismo id significan que marcar una marca la otra.
4. **No había tope de tomas.** Un año cada cuatro horas generaba 2.190
   registros clínicos sin preguntar.
5. **Los recordatorios no se podían marcar sin ratón.** La tarjeta respondía al
   clic desde un `<div>` sin `tabIndex` ni `onKeyDown`. No era incómodo: era
   imposible.
6. **`2026-13-40` era una fecha válida.** `Date` la convertía en un día
   cualquiera de 2027, y el aviso habría sonado entonces.

---

## Qué es axe-core y por qué se usa

`axe-core` es el motor de análisis de accesibilidad que usan las herramientas
de desarrollo de Chrome y Firefox. Se ejecuta **dentro de la página ya
renderizada** y comprueba las reglas WCAG que una máquina puede decidir sin
ambigüedad: campos sin nombre accesible, contraste insuficiente, botones sin
texto, estructura mal anidada.

Se eligió frente a Lighthouse por dos razones concretas:

- **Lighthouse audita una página a la vez y no sabe iniciar sesión.** Casi toda
  esta aplicación está detrás de autenticación, así que mediría `/login` y poco
  más.
- **No es reproducible en el arnés.** `@axe-core/playwright` sí: corre con la
  misma sesión de demostración que el resto de E2E, entra en `npm run test:all`
  y falla la próxima vez que alguien rompa algo.

## Lo que este arnés NO demuestra

Conviene decirlo antes que nada, porque un número verde invita a creer lo
contrario.

axe encuentra lo comprobable por máquina. **No** encuentra si el orden de
tabulación tiene sentido, si un texto alternativo describe la imagen o miente,
si un formulario clínico se puede completar de principio a fin con un lector de
pantalla, ni si el foco se pierde al abrir un diálogo.

Cero violaciones de axe es **un suelo, no un techo**. La comprobación con
lector de pantalla queda como validación manual en `TESTING.md`.

### Y hay un punto ciego concreto, medido

axe solo ve **lo que está pintado en el momento del análisis**. La auditoría
estática del código encontró **102 campos de formulario, 101 sin nombre
accesible de ningún tipo** —ni `label`, ni `aria-label`, ni `placeholder`—.
El análisis de axe sobre las cinco rutas reporta **cero** violaciones de la
regla `label`.

No es una contradicción: **esos campos no están en pantalla cuando axe mide**.
Viven dentro de los 15 modales cerrados y en rutas que la línea base no
recorre (`/members/new`, `/members/[id]/edit`, las siete subrutas de la ficha
del familiar, `/onboarding`).

**Resuelto en C1.3a.** La cobertura se amplió a las siete subrutas de la ficha
del familiar, `/members/new` y `/onboarding`, y **cada diálogo migrado se abre
antes de analizar**. La deuda que estaba escondida salió a la luz: las
violaciones críticas pasaron de 0 a 27, y las graves de 77 a 143. No es que
haya empeorado nada; es que antes no se estaba mirando.

**C1.3b** añadió los tres diálogos de órdenes médicas: **24 mediciones**, con un
total de 31 críticas, 145 graves y 24 moderadas. Las 21 mediciones anteriores
quedaron **idénticas**, así que las migraciones no rompieron nada; lo que sube
es solo lo que antes no se miraba.

**Y en C1.4 los números se movieron**: las críticas pasaron de **31 a 1**. Esa
es la prueba de que la ampliación de cobertura servía para algo — sin ella, el
trabajo sobre los campos habría movido un cero a otro cero.

## Los campos de formulario (C1.4)

### Inventario de partida

102 campos en 13 archivos. Solo 7 tenían `<label htmlFor>` y 6 más estaban
envueltos por su propia `<label>`. Los **89 restantes no tenían nombre
accesible de ningún tipo**: un lector de pantalla anunciaba «cuadro de edición,
en blanco» doce veces seguidas en el formulario de medicamentos.

El `placeholder` **no cuenta como nombre**: desaparece en cuanto se escribe, y
buena parte de los lectores de pantalla no lo anuncian. Que casi todos los
campos lo tuvieran explica por qué la deuda pasó desapercibida tanto tiempo:
en pantalla parecía resuelto.

| Archivo | Campos sin nombre |
|---|---|
| `members/[id]/orders` | 19 |
| `members/[id]/medications` | 12 |
| `members/[id]/edit` | 9 |
| `appointments/import` · `members/[id]/vaccines` · `members/new` | 7 cada uno |
| `members/[id]/appts` · `members/[id]/exams` | 6 cada uno |
| `members/[id]/checkups` · `settings` | 5 cada uno |
| `members/[id]/documents` | 4 |
| `dashboard` · `members` | 1 cada uno |

### El patrón aplicado

- **Con etiqueta visible (85 campos):** `id` único derivado del texto de la
  etiqueta, y `htmlFor` en la `<label>` que ya estaba ahí. El id lleva prefijo
  por pantalla (`med-`, `orden-`, `vacuna-`…) para que dos formularios no
  choquen si algún día comparten documento.
- **Sin etiqueta visible (4 campos):** `aria-label`. Son la búsqueda de
  familiares, el nombre de la familia nueva, el área de pegado del correo y el
  selector de archivo de la copia de seguridad.
- **Ya envueltos por su `<label>` (6 campos):** no se tocaron. La etiqueta
  envolvente da nombre accesible igual que `htmlFor`, y añadir un `id`
  redundante solo habría ensuciado el diff.

Dos reglas que se respetaron sin excepción: **ningún `aria-label` contradice el
texto visible** —todos los nombres salen de la etiqueta que ya se veía— y
**ningún `aria-label` contiene datos personales**. El campo del nombre de la
familia es el caso a vigilar: su `placeholder` interpola el nombre del titular,
así que su `aria-label` es la cadena fija «Nombre de la familia».

### Qué bajó, medido

| Medición | Críticas antes | Después |
|---|---|---|
| `miembro-medications-dialogo` | 6 | **0** |
| `miembro-vaccines-dialogo` | 4 | **0** |
| `members-new` | 4 | **0** |
| `miembro-exams-dialogo` · `miembro-orders-dialogo` | 3 | **0** |
| `miembro-appts-dialogo` · `checkups` · `documents` · `orders-autorizacion` | 2 | **0** |
| `miembro-orders-agendar` · `miembro-orders-soporte` | 1 | **0** |
| **TOTAL** | **31** | **1** |

Las graves (145) y las moderadas (24) **no se movieron ni un punto**, en ninguna
de las 24 mediciones. Etiquetar campos no arregla el contraste ni el
`meta-viewport`, y un número que hubiera bajado «de rebote» sería señal de que
la medición no es de fiar.

**La crítica que queda** es `button-name` en `/members/:id/documents`: un botón
de borrado que solo lleva icono. No es un campo de formulario, así que queda
fuera del alcance de C1.4; es el mismo trabajo que C1.2 hizo en las rutas que
entonces se medían, sobre una ruta que aún no estaba cubierta.

### La prueba

`e2e/etiquetas-campos.e2e.ts` no lleva una lista de 102 nombres escrita a mano
—envejecería mal y no vería un campo nuevo—. **Barre** cada pantalla y cada
diálogo abierto, y de cada control visible exige dos cosas: que tenga nombre, y
que **Playwright lo encuentre por ese nombre** con `getByLabel`, que implementa
el cálculo de nombre accesible de la especificación. Ese segundo punto es lo que
impide que la prueba se apruebe a sí misma: el nombre lo confirma un tercero.

78 campos comprobados en 15 pantallas. Los que faltan hasta 102 son
condicionales —aparecen solo con cierta frecuencia de dosis, cierto tipo de
orden o cierta sesión— y quedan cubiertos por el inventario estático.

## Contraste, foco y teclado (C1.5)

### Las 145 graves eran cinco colores

El diagnóstico por pares de color deshizo el número: de las 145 violaciones
graves, **135 venían de cinco utilidades de Tailwind** repetidas por toda la
aplicación. No había que revisar 145 sitios, había que cambiar cinco colores.

| Utilidad | Antes | Ratio | Después | Ratio | Sustituciones |
|---|---|---|---|---|---|
| `text-slate-400` | `#90a1b9` | 2,4–2,6 | `text-slate-500` `#62748e` | 4,6–4,8 | 233 |
| `text-teal-600` | `#009689` | 3,3–3,7 | `text-teal-700` `#00786f` | 4,9–5,4 | 76 |
| `bg-teal-600` (texto blanco) | `#009689` | 3,67 | `bg-teal-700` `#00786f` | 5,36 | 48 |
| `text-rose-600` | `#ec003f` | 4,1–4,5 | `text-rose-700` `#c70036` | 5,5–6,0 | 53 |
| `text-amber-600` | `#e17100` | 2,9–3,2 | `text-amber-700` `#bb4d00` | 4,6–5,0 | 36 |
| `text-emerald-600` | `#009966` | 3,3–3,7 | `text-emerald-700` `#007a55` | 4,9–5,4 | 22 |

Al subir el fondo `bg-teal-600` un peldaño, `hover` y `active` suben con él
(74 sustituciones más), porque si no la escala de interacción se aplana y el
botón deja de responder visualmente al ratón. **548 sustituciones en 22
archivos**, todas token a token: `shadow-teal-600/20` y `border-teal-600/10`
no se tocaron, que son sombras y bordes, no texto.

Los `placeholder:text-slate-400` **se quedaron como estaban**. axe no mide el
marcador de posición, y oscurecerlo lo acerca al texto real ya escrito, que es
justo la confusión que un marcador no debe provocar.

### Los diez nodos que no eran culpa de la paleta

Tras el cambio quedaban cinco nodos con colores raros —`#d69569`, `#dd6485`—
que no están en ninguna paleta. Eran textos con `animate-pulse`: axe los medía
**a mitad del parpadeo**, con la opacidad a medio camino, y un `amber-700`
sobre blanco caía a 2,4:1.

No es un artefacto de la medición: un texto que se atenúa dos veces por segundo
es ilegible en el valle, lo mida quien lo mida. Se quitó `animate-pulse` de los
**13 elementos que llevan texto** y se conservó en los iconos y los puntos de
estado, donde no hay nada que leer. Un caso aparte: `text-amber-700/90` daba
4,14:1, y le sobraba el 90 %.

### `meta-viewport`: 24 → 0

El layout raíz declaraba `maximumScale: 1` y `userScalable: false`. Bloquear el
zoom en una aplicación de salud familiar deja fuera justo a parte de su
público, y WCAG 1.4.4 lo prohíbe. Ahora `maximumScale: 5` y `userScalable: true`.
Era una moderada por medición: 24 de golpe.

### Foco visible

88 `outline-none` repartidos por los formularios y **cero** reglas de
`:focus-visible` en todo el proyecto. Los campos dibujaban su anillo de color;
botones, enlaces y tarjetas se quedaban con lo que trajera el navegador, y allí
donde `outline-none` ganaba, con nada.

`globals.css` cierra el asunto de una vez:

```css
*:focus-visible {
  outline: 2px solid #00786f; /* teal-700: 5,36:1 sobre blanco */
  outline-offset: 2px;
}
.foco-claro *:focus-visible { outline-color: #ffffff; }
```

La regla va **después** de las utilidades de Tailwind, así que con la misma
especificidad gana ella y devuelve el contorno. Es `:focus-visible` y no
`:focus` a propósito: quien pulsa con el ratón no ve el anillo, quien navega
con teclado sí. `.foco-claro` es para el fondo oscuro de la navegación
desplegada, donde el teal no se distingue.

### Lo que respondía al ratón y no al teclado

Las tarjetas de recordatorio y de tarea recibían el clic desde un `<div>`. Sin
`tabIndex` no recibían el foco y sin `onKeyDown` no había manera de marcar una
toma como hecha sin ratón: **no era incómodo, era imposible**.

- **Recordatorio** → `role="checkbox"` + `aria-checked`, porque alterna entre
  hecho y pendiente. Enter y Espacio lo cambian; el Espacio hace
  `preventDefault()` para que no desplace la página bajo el dedo.
- **Tarea de seguimiento** → `role="button"`, porque completarla no tiene
  vuelta. Una tarea ya completada sale del recorrido del tabulador
  (`tabIndex={-1}`): ya no hace nada al pulsarla.

Ninguno lleva `aria-label`: el nombre accesible sale del contenido de la propia
tarjeta, así que no se duplica ni un dato clínico en un atributo.

`e2e/teclado-navegacion.e2e.ts` fija las cuatro cosas, y la cuarta es la que
impide que esto vuelva: **barre cada pantalla buscando cualquier elemento que
responda al clic y no al teclado** —cursor de mano, sin ser enfocable, sin rol
ni `tabindex`— y falla nombrándolo.

### El resultado

**0 violaciones de axe en las 24 mediciones** que había entonces, en las cuatro
gravedades. La línea base pasó a ser todo ceros, así que a partir de aquí la
puerta no tolera ni una: cualquier violación nueva, en cualquier ruta o diálogo
cubierto, deja `test:all` en rojo. (En C3.1 entró `/agenda` y son **25**.)

Sigue siendo **un suelo, no un techo**. Que axe no encuentre nada no dice que
el orden de tabulación tenga sentido, ni que un formulario clínico se pueda
completar de principio a fin con lector de pantalla. Eso sigue en `TESTING.md`
como validación manual.

# Estados de carga, vacío y error (C2)

## El inventario, y lo que encontró

| Estado | Cómo estaba |
|---|---|
| **Carga** | El mismo círculo girando **copiado en 19 pantallas**. Sin `role`, sin texto, sin nada que anunciar: con lector de pantalla la aplicación se quedaba muda mientras cargaba |
| **Vacío** | **14 cajas** con la misma idea y ninguna igual: distintos rellenos, tamaños de texto y tratamientos del icono. **Una sola de las catorce ofrecía qué hacer** |
| **«No encontrado»** | **11 pantallas** con un `<h3>` suelto en mitad de la nada. Ocho de ellas, sin explicación y sin forma de volver |
| **Error de carga** | **No existía.** Ni un solo estado de error en toda la aplicación |

## Lo que apareció al buscar el estado de error

No es que faltara la pantalla: es que **la aplicación no podía saber que había
fallado**. `loadAppState` devolvía `null` en dos casos muy distintos —«no hay
nada guardado» y «no se pudo leer»— y la interfaz recibía el mismo `null` para
ambos. Con el expediente dañado, el panel decía:

> Aún no tienes miembros registrados

...con el historial clínico completo intacto en el navegador, sin abrir. Es el
peor mensaje posible: **afirma que todo está en orden**, así que nadie va a
reintentar ni a restaurar una copia.

Y había algo peor en el mismo sitio. Ante un fallo de lectura, la función
ejecutaba:

```ts
window.localStorage.removeItem(key);   // ← el expediente, borrado
```

Un byte corrupto, una cuota llena o un almacenamiento bloqueado por el
navegador bastaban para **destruir el expediente de una familia** sin preguntar,
sin avisar y sin dejar rastro.

### Lo que se hizo

`src/lib/lecturaExpediente.ts` sustituye ese `null` ambiguo por una respuesta
que dice cuál de las tres cosas pasó:

```ts
{ estado: 'VACIO' }                          // expediente nuevo, no es un fallo
{ estado: 'OK'; datos }
{ estado: 'ILEGIBLE'; motivo }               // JSON roto, no es objeto, faltan campos, o el almacén falló
```

Y **no borra nada, nunca**. El original se queda donde está —para que
reintentar signifique algo— y además se guarda una copia bajo
`pate:cuarentena:<clave>`, que es de lo único que se puede tirar para rescatar
los datos a mano. La primera copia no se pisa: si el expediente se sigue
escribiendo sobre sí mismo tras el fallo, la más antigua es la que más
probabilidades tiene de estar completa.

15 pruebas unitarias cubren el módulo, y dos de ellas existen solo para vigilar
que el expediente ilegible **sigue ahí** después de intentar leerlo.

## Los tres componentes

| Componente | Cuándo | Qué garantiza |
|---|---|---|
| `ui/EstadoCarga` | Se está esperando | `role="status"` con **texto**, no solo un círculo. El giro es `aria-hidden` y se detiene con `motion-reduce` |
| `ui/EstadoError` | Algo falló | `role="alert"`, y siempre tres cosas: qué pasó, qué **no** pasó, y qué se puede hacer ahora |
| `ui/EstadoVacio` | No hay nada todavía | Sin `role="alert"` y sin colores de alarma: un expediente nuevo es normal. `accion` es opcional pero está en el contrato para que su ausencia se note al escribirla |

`layout/PuertaExpediente` es el único sitio donde se comprueba el error de
carga. Ponerlo en las 19 rutas habría multiplicado por 19 la ocasión de
olvidarlo en la ruta 20.

## Dos decisiones que conviene explicar

**El error de «familiar no encontrado» no ofrece reintentar.** Volver a mirar
la misma lista da el mismo resultado. Ofrece la única salida real —la lista de
familiares— y dice lo que sí se sabe: que el expediente **sí** se pudo abrir.
Cuando el fallo es de carga, quien lo anuncia es `PuertaExpediente`, y esa
pantalla ni siquiera llega a pintarse.

**Tres estados vacíos se quedaron sin acción, a propósito.** El historial
clínico se deriva de lo demás; las alarmas y las tareas nacen de las citas y
los medicamentos. Poner ahí un botón habría sido inventarse una salida que no
lleva a ningún sitio, que es justo el defecto que este paso venía a corregir.

## Cómo funciona la línea base

El proyecto arrastra deuda de accesibilidad conocida. Meter axe en el arnés sin
más dejaría `test:all` en rojo durante los cinco pasos de C1, y una puerta en
rojo permanente pierde lo único que aporta: distinguir una regresión nueva de
la deuda de siempre.

Se usa el mismo mecanismo que ya funciona con el lint —y que en A6-F3 detectó
una violación real de las reglas de los hooks que yo mismo había introducido—:

| Archivo | Papel |
|---|---|
| `e2e/axe-baseline.json` | La deuda aceptada, por ruta y gravedad |
| `e2e/validar-accesibilidad.ts` | Lee, compara y decide. No abre el navegador |
| `e2e/accesibilidad.e2e.ts` | Ejecuta axe sobre las rutas y aplica la comparación |

La regla es simple: **cualquier gravedad que suba, incluso `minor`, falla la
suite.** La línea base existe para congelar la deuda, no para dejar sitio a más.

Cuando la deuda baja, la suite **no falla**: avisa por consola y recuerda
regenerar la línea base para fijar el avance.

### Cómo se cuentan las violaciones

Se cuenta **una por nodo afectado**, no una por regla. Cinco campos sin
etiqueta son cinco problemas, aunque axe los agrupe bajo la misma regla. Si se
contara por regla, arreglar cuatro de los cinco no movería el número y el
progreso sería invisible.

## Cómo bajar la línea base

Al terminar cada paso de C1:

```bash
npm run axe              # ver el estado actual y el detalle por regla
npm run axe:linea-base   # regenerar axe-baseline.json con lo medido
npm run test:all         # confirmar que todo sigue en verde
```

`axe:linea-base` existe como script de Node y no como `AXE_ACTUALIZAR=1 npm run
axe` porque esa forma de pasar variables de entorno no funciona en el símbolo
del sistema de Windows, que es donde se desarrolla este proyecto.

**La línea base solo debería bajar.** Si sube, el commit que la sube tiene que
explicar por qué.

## Rutas cubiertas

| Ruta | Por qué |
|---|---|
| `/dashboard` | La pantalla de entrada; concentra tarjetas, alertas y navegación |
| `/members` | Listado con imágenes y acciones por fila |
| `/settings` | La pantalla más densa: conmutadores, formularios y diálogos |
| `/appointments/import` | Formulario principal del Bloque B: área de texto y adjuntos |
| `/reminders` | Listas con acciones y estados |
| `/members/new` | Alta de familiar: el formulario más largo de la aplicación |
| `/onboarding` | Primera pantalla que ve alguien nuevo |
| `/agenda` | C3.1: la vista unificada de citas, tomas y controles |
| `/members/:id/appts` · `checkups` · `documents` · `exams` · `medications` · `orders` · `vaccines` | Las siete subrutas de la ficha, **cada una medida dos veces**: en reposo y con su diálogo abierto |
| `/members/:id/orders` · tres diálogos | C1.3b: autorización, agendar y adjuntar soporte. Sus botones solo existen si hay una orden en el estado adecuado, así que la prueba **siembra dos órdenes sintéticas** antes de abrirlos |

Todas requieren sesión, así que la suite entra por `entrarEnModoDemo()`: sin
cuenta de Google, sin OAuth y sin red, igual que el resto del arnés.

El identificador del familiar no está escrito a mano: se lee de la base de
demostración, así que la suite no se rompe si cambian los datos de ejemplo.

## El patrón de diálogo (C1.3a)

Los formularios vivían en `<div className="fixed inset-0">`. Eso pinta algo que
PARECE un diálogo pero no lo es: el foco sigue paseándose por la página de
debajo, Escape no cierra, y un lector de pantalla anuncia el fondo como si
estuviera disponible. Once formularios clínicos estaban así.

**`src/components/ui/Dialog.tsx`** los sustituye. Usa el `<dialog>` nativo
porque `showModal()` trae de fábrica lo que una implementación a mano suele
fallar: foco atrapado, cierre con Escape, fondo inerte para la tecnología
asistiva y devolución del foco al elemento que lo abrió. Cero dependencias.

Una decisión que conviene explicar: **por defecto NO cierra al pulsar fuera**.
Estos diálogos contienen formularios clínicos a medio rellenar, y perder media
hora de datos por un clic descuidado en el fondo es peor que un clic de más en
«Cancelar». Se puede activar por diálogo con `cerrarAlPulsarFuera`.

`ConfirmDialog` (A6-F2) sigue existiendo aparte: resuelve preguntar y ofrecer
opciones; `Dialog` envuelve contenido arbitrario. No se fusionan porque sus
contratos son distintos.

### Triaje de los 15 `fixed inset-0`

| Clasificación | Cuántos | Qué se hizo |
|---|---|---|
| **Diálogo interactivo** | 11 | Migrados a `Dialog`: 8 en C1.3a y los 3 restantes en C1.3b. **Completo** |
| **Capa de carga** | 2 | Se conservan: sincronización con Calendar (`appts`) y subida (`documents`). No son diálogos; solo necesitan `role="status"` |
| **Ya correcto** | 1 | El bloqueo de sesión de la Navbar, con `role="dialog"` y `aria-modal` desde A6-F3 |
| **Falso positivo** | 1 | `settings:1847` es un overlay de carga, no un modal |

Migrados en C1.3a: Programar Nueva Cita, Registrar Control de Salud, Subir
Documento Clínico, Resultados de Laboratorio, Registrar Examen Clínico,
Registrar Nuevo Medicamento, Registrar Nueva Orden Médica y Registrar Vacuna.

Migrados en C1.3b: los tres de `orders` —autorización, agendar y adjuntar
soporte—. Dos viven dentro de funciones inmediatas cuyo único trabajo es buscar
la orden y salir si no existe; esa envoltura **se conserva** (es donde se decide
si hay algo que mostrar) y lo que cambió es su interior. No hizo falta extraer
componentes ni subir estado: el título dinámico es una expresión más en la
propiedad `titulo`.

## Confirmaciones y avisos (C1.3b)

`window.confirm` resultaba cómodo —`if (confirm(...)) borrar()`— y el precio era
alto: el cuadro lo pinta el navegador, así que no tiene nombre accesible propio,
no se puede localizar por rol en una prueba, no se puede estilar y, en un PWA
instalado, aparece como un aviso del sistema ajeno a la aplicación. Algunos
navegadores lo suprimen del todo en pestañas de segundo plano: la pregunta
desaparece y el flujo se queda a medias sin que nadie decida nada.

**`src/context/Confirmacion.tsx`** conserva la ergonomía y quita el precio:

```ts
if (await confirmar({ titulo, descripcion, etiquetaConfirmar })) borrar();
```

Por dentro es el `ConfirmDialog` de A6-F2 sobre `<dialog>` nativo. El contrato
que fija la prueba `e2e/confirmaciones-destructivas.e2e.ts`:

1. La acción **no ocurre** hasta que alguien la confirma explícitamente.
2. **Escape cancela, nunca confirma.** La promesa se resuelve a `false` en todo
   camino que no sea pulsar el botón de confirmación, incluido el desmontaje.
3. El diálogo se localiza **por rol y nombre accesible**, que es como lo
   encuentra un lector de pantalla.
4. El **foco inicial no está en el botón destructivo**: lo recibe «Cancelar»,
   de modo que un Intro reflejo cancela en vez de borrar.

**`src/context/Avisos.tsx`** hace lo propio con `alert`. Un `alert` detiene la
aplicación entera para decir «listo»: lo más ruidoso posible para lo menos
importante. Se sustituye por una región viva (`role="status"`,
`aria-live="polite"`) que anuncia sin robar el foco y se retira sola.

Los **errores recuperables siguen usando `alert` a propósito**: interrumpen
porque hay algo que decidir. Llevarlos al sitio donde ocurrió el fallo es
trabajo de C1.5. De los 46 `alert` originales quedan 23, y todos son errores.

---

## Estado tras C1.2

| Ruta | Críticas | Graves | Moderadas | Leves |
|---|---|---|---|---|
| `dashboard` | 0 | 20 | 1 | 0 |
| `members` | 0 | 7 | 1 | 0 |
| `settings` | **0** ▼4 | 27 | 1 | 0 |
| `appointments-import` | 0 | 10 | 1 | 0 |
| `reminders` | **0** ▼3 | 13 | 1 | 0 |
| **TOTAL** | **0** ▼7 | **77** | **5** | **0** |

Las siete violaciones críticas se resolvieron en C1.2: tres conmutadores y un
`<select>` en Ajustes, y dos indicadores de estado en Recordatorios que se
anunciaban como botones sin serlo.

**Los indicadores de Recordatorios no recibieron un nombre: dejaron de ser
controles.** Eran `<button>` sin manejador propio —quien responde al clic es
la tarjeta entera—, así que ponerles `aria-label` habría anunciado una acción
que no existe. Ahora son `<span aria-hidden>`, que es lo que siempre fueron.

**Queda un problema de teclado que esto deja al descubierto y que corresponde a
C1.5:** la tarjeta de recordatorio responde al clic desde un `<div>`, no desde
un control, así que **con teclado no se puede marcar un recordatorio como
hecho**. axe no lo detecta porque no hay nada mal etiquetado: sencillamente no
hay control.

---

## Línea base inicial (C1.1)

| Ruta | Críticas | Graves | Moderadas | Leves |
|---|---|---|---|---|
| `dashboard` | 0 | 20 | 1 | 0 |
| `members` | 0 | 7 | 1 | 0 |
| `settings` | 4 | 27 | 1 | 0 |
| `appointments-import` | 0 | 10 | 1 | 0 |
| `reminders` | 3 | 13 | 1 | 0 |
| **TOTAL** | **7** | **77** | **5** | **0** |

Reglas incumplidas, por número de nodos:

| Regla | Nodos | Gravedad | Dónde |
|---|---|---|---|
| `color-contrast` | 77 | grave | las cinco rutas |
| `button-name` | 6 | **crítica** | `settings` 3, `reminders` 3 |
| `select-name` | 1 | **crítica** | `settings` |
| `link-name` | 1 | grave | `appointments-import` |
| `meta-viewport` | 5 | moderada | una por ruta; es la misma etiqueta del layout |

Tres lecturas que orientan el resto de C1:

**El contraste domina.** 77 de 89 violaciones son `color-contrast`, y no se
arreglan con marcado sino con la paleta. Es trabajo de C1.5, no de C1.2.

**Las críticas son pocas y concretas.** Siete nodos: seis botones sin nombre y
un `<select>` sin etiqueta. Es exactamente lo que resuelve C1.2.

**`meta-viewport` es un solo fallo, contado cinco veces.** Está en el layout
raíz —`maximumScale: 1` y `userScalable: false` impiden ampliar la página—, así
que se arregla una vez y desaparece de las cinco rutas.

# Funcionalidades clínicas (C3)

## Agenda unificada (C3.1)

Las citas, las tomas y los controles se guardaban en tres estructuras escritas
por separado que acabaron representando lo mismo de tres maneras: **tres
nombres de campo temporal, dos granularidades y dos catálogos de estado
incompatibles** —`COMPLETED` en unas, `TAKEN` en otras—. Cualquier pantalla que
quisiera enseñarlos juntos tenía que traducir, y si cada pantalla traduce por su
cuenta, cada una se equivoca a su manera.

`lib/agenda.ts` traduce una sola vez a `EventoCalendario`. `/agenda` navega por
mes y semana, filtra por familiar y **no hace ni una llamada a Google**: hay una
prueba que vigila justamente eso.

**Las fechas se manejan como texto `YYYY-MM-DD`** y, cuando hay que calcular, se
construyen con `new Date(año, mes, día)`. `new Date('2026-03-10')` es medianoche
UTC: al oeste de Greenwich dibuja media agenda un día antes, y eso solo se nota
en producción.

## Avisos locales (C3.2)

El cuerpo del aviso es **una plantilla fija por tipo**, nunca una
interpolación: «Es hora de una toma de medicamento», no qué medicamento ni de
quién. Se lee sobre la pantalla bloqueada, delante de quien tenga el móvil a la
vista. El clic lleva a `/reminders`, jamás a la ficha de un familiar, porque el
destino también identifica.

El permiso se pide **bajo demanda** y después de explicar, incluido lo que no
hace. Un cuadro del navegador que aparece solo se deniega por reflejo, y esa
denegación es difícil de deshacer.

**Limitación conocida:** con la aplicación cerrada no suena nada, y no hay forma
de arreglarlo sin servidor. El detalle y las tres vías descartadas están en
`TESTING.md` §6.12.

## Ficha del familiar (C3.3)

Cada una de las nueve secciones tenía un solo enlace, «Volver al perfil»: para
ir de citas a vacunas había que subir y bajar. Y **ninguna decía de quién era el
expediente**, así que con la aplicación abierta en «Vacunas» no había forma de
saber si eran las de un hijo o las del titular.

`members/[id]/layout.tsx` pone la cabecera y la barra de secciones una sola vez.
No envuelve al perfil —ya trae la suya— ni al formulario de edición, donde una
barra de navegación invita a salirse a medio rellenar.

`lib/edad.ts` recoge un cálculo que estaba copiado dos veces y escrito otras dos
distinto. Cuenta **meses y días** por debajo del año: «0 años» no dice nada de un
bebé de tres meses, y en pediatría esa diferencia lo es todo.

## Pautas de medicación (C3.4)

`lib/pautaMedicacion.ts` genera las tomas, con **tope de 400** y aviso previo:
el diálogo dice cuántas van a salir antes de crear ninguna.

`reprogramarDosis` cambia la pauta **sin tocar lo ocurrido**. Conserva las tomas
marcadas y también **las pendientes ya vencidas**: que nadie registrara una toma
no la convierte en inexistente, y borrarla haría desaparecer justo lo que un
médico querría ver.

---

# Decisiones deliberadas

Ninguna de estas es un descuido. Si alguien las cambia, que sea sabiendo qué se
decidió y por qué.

| Decisión | Por qué |
|---|---|
| **`Dialog` no cierra al pulsar fuera** | Contienen formularios clínicos a medio rellenar. Perder media hora de datos por un clic descuidado es peor que un clic de más en «Cancelar». Se activa por diálogo con `cerrarAlPulsarFuera` |
| **Los avisos no llevan datos clínicos** | Se leen sobre la pantalla bloqueada. El detalle queda dentro de la aplicación, detrás del bloqueo de sesión de A6-F3 |
| **El clic de un aviso va a `/reminders`** | Un enlace a `/members/<id>` identificaría a la persona desde la propia notificación |
| **«Familiar no encontrado» no ofrece reintentar** | Volver a mirar la misma lista da el mismo resultado. Ofrece la salida real: la lista de familiares |
| **Tres estados vacíos se quedaron sin acción** | El historial se deriva de lo demás; las alarmas nacen de citas y medicamentos. Un botón ahí sería una salida que no lleva a ningún sitio |
| **Los `placeholder` siguen en `slate-400`** | axe no los mide, y oscurecerlos los acerca al texto ya escrito: justo la confusión que un marcador no debe provocar |
| **`animate-pulse` fuera de los textos** | Un texto que se atenúa dos veces por segundo es ilegible en el valle, lo mida quien lo mida. Se conserva en iconos y puntos de estado |
| **El indicador de un recordatorio es `<span aria-hidden>`** | No tiene manejador propio: quien responde al clic es la tarjeta entera. Como `<button>` se anunciaba como un control que no hacía nada |
| **Un expediente ilegible no se borra** | Se conserva el original y una copia en `pate:cuarentena:`. Reintentar solo significa algo si los datos siguen ahí |
| **El aviso de revacunar no dice el nombre del animal** (D3) | Ver abajo |
| **El botón de cerrar de `Dialog` se llama «Cerrar», sin el título** (D4) | Ver abajo |

## El nombre de la mascota tampoco va en un aviso (D3)

El plan de D3 dejaba la decisión abierta: una mascota no es un dato clínico
humano, así que ¿por qué no decir «Toca revacunar a Nube»?

**Se mantiene el patrón genérico**, por dos razones y la segunda pesa más:

1. Un nombre de mascota en una pantalla bloqueada **identifica un hogar** casi
   tan bien como el de una persona. Quien lo lea por encima del hombro en un
   autobús sabe de quién es ese teléfono.
2. Y sobre todo: **«sin interpolación en el cuerpo del aviso» es una regla que
   una prueba puede comprobar.** «Sin datos sensibles, salvo los de mascotas»
   no lo es: exige criterio en cada caso, y el criterio se cansa. La frontera
   se mantiene donde se puede vigilar, y hay pruebas que la vigilan
   (`PROHIBIDO_EN_AVISOS`).

El clic sigue llevando a `/reminders`, como fijó C3.2: un enlace directo a
`/members/<id>/pets/<id>` identificaría a la familia desde la propia
notificación. Dentro de la aplicación, en cambio, el evento de agenda **sí**
lleva a la cartilla de esa mascota: ahí ya se ha pasado el bloqueo de sesión.

---

## El nombre de un control es también su dirección (D4)

El botón de cerrar de `Dialog` se llamaba **«Cerrar {titulo}»**: «Cerrar
Registrar vacuna», «Cerrar Registrar mascota», «Cerrar Marcar inactiva». Se lee
bien en voz alta, y por eso duró tanto.

El problema es que un nombre accesible hace dos trabajos a la vez. Anuncia el
control, sí, pero además es **como se le localiza**: por él lo busca quien
navega con un lector de pantalla, y por él lo buscan las pruebas. Y los títulos
de los diálogos están hechos de los mismos sustantivos que sus campos. El
diálogo «Registrar vacuna» tiene un campo «Vacuna», así que el nombre del botón
de cerrar **contenía** el nombre del campo: buscar «Vacuna» devolvía dos
elementos. Ocurrió en D1, en D2 y otra vez en D3.

Se podía seguir tapando caso por caso con `exact: true`. Pero eso lo arregla en
la prueba, no en la aplicación: quien navegue por nombres sigue encontrando dos
cosas donde hay una.

**La convención, desde D4:**

```tsx
aria-label="Cerrar"
aria-describedby={idTitulo}   // el <h2> del propio diálogo
```

El nombre vuelve a identificar solo la acción. El contexto no se pierde: un
lector de pantalla ya anuncia el diálogo entero al entrar, y al llegar al botón
la descripción repite el título. Lo que cambia es en qué campo vive el título —
descripción en vez de nombre—, y ese campo no se usa para buscar.

**La regla general, que es lo que de verdad se fija:** dentro de un diálogo,
ningún nombre de etiqueta puede ser subcadena de otro. Vale para `aria-label`,
para `aria-labelledby` y para un `<label for>`, que son las tres fuentes que
`getByLabel` resuelve, y se compara sin distinguir mayúsculas porque `getByLabel`
tampoco las distingue.

Lo vigilan tres pruebas en `nombres-accesibles.e2e.ts`:

| Prueba | Qué fija |
|---|---|
| **N6** | Cada diálogo tiene **exactamente un** botón llamado exactamente «Cerrar», y su `aria-describedby` apunta al título |
| **N7** | Ningún nombre de etiqueta del diálogo es subcadena de otro |
| **N8** | El caso que originó todo: en «Registrar vacuna» de una mascota, `getByLabel('Vacuna')` —sin `exact`— encuentra **un** elemento |

N8 va aparte a propósito. Los diálogos de N6 y N7 no tenían la colisión ni
antes del cambio: sin N8, la regla pasaría sin mirar nada. Con el nombre
anterior, las tres fallan.

# Puerta de C9

*Lo que hay que volver a comprobar antes de dar el Bloque C por bueno en la
validación final.*

## Rutas cubiertas por la red de axe

Son **25 mediciones** (no 24: `/agenda` entró en C3.1). Las siete subrutas de la
ficha se miden **dos veces** —en reposo y con su diálogo abierto— y las órdenes
médicas aportan tres diálogos más:

| Ruta | Mediciones |
|---|---|
| `/dashboard` · `/members` · `/settings` · `/reminders` · `/agenda` · `/onboarding` | 6 |
| `/appointments/import` | 1 |
| `/members/new` | 1 |
| `/members/:id/appts` · `checkups` · `documents` · `exams` · `medications` · `orders` · `vaccines` | 14 (7 en reposo + 7 con diálogo) |
| `/members/:id/orders` → autorización, agendar y adjuntar soporte | 3 |

**Nota sobre el listado del plan:** no existe ninguna ruta `/appointments`. La
agenda unificada está en **`/agenda`** y `/appointments/import` es la
importación manual del Bloque B.

**Dos rutas quedan fuera de la red y conviene saberlo:**

| Ruta | Por qué no está |
|---|---|
| `/members/:id/edit` | No entró en la cobertura de C1.3a y no se añadió después. Sus campos **sí** están etiquetados —los cubre `etiquetas-campos.e2e.ts`— pero axe no la mide |
| `/login` | Se mide en `sin-configuracion.e2e.ts` por otro motivo, no por accesibilidad |

Añadirlas es trabajo de una línea cada una en `RUTAS`. Se deja anotado en vez de
hacerlo aquí, porque cambiar la cobertura al cerrar el bloque mueve los números
que este mismo documento acaba de dar por buenos.

## Funcionalidades a verificar

| Funcionalidad | Dónde está su prueba |
|---|---|
| Agenda unificada | `agenda-unificada.e2e.ts` (6) |
| Avisos locales | `notificaciones-locales.e2e.ts` (6) |
| Ficha coherente | `ficha-familiar.e2e.ts` (5) |
| Pautas recurrentes | `recordatorios-recurrentes.e2e.ts` (5) |
| Teclado y foco | `teclado-navegacion.e2e.ts` (4) |
| Nombres accesibles | `etiquetas-campos.e2e.ts` (4) · `nombres-accesibles.e2e.ts` (10) |
| Estados de carga, vacío y error | `estados-carga-error.e2e.ts` (6) |
| Confirmaciones irreversibles | `confirmaciones-destructivas.e2e.ts` (3) |
| Lector de pantalla | **Manual**: `TESTING.md` §6.12 |

## Criterio de aprobación

C9 aprueba el Bloque C **solo si se cumplen las tres**:

1. `npm run test:all` en verde: 298 unitarias, `tsc` sin errores, lint sin
   regresiones y 115 E2E.
2. **0 violaciones de axe** en las 25 mediciones, en las cuatro gravedades.
3. **`TESTING.md` §6.12 aprobada**, con fecha, ejecutante y observaciones.

La tercera no es un trámite. Las otras dos las puede pasar una aplicación que
nadie consiga usar con lector de pantalla; §6.12 es la única que lo comprueba.

---

## Lista de comprobación para componentes nuevos

Hasta que C1.3 fije el patrón definitivo, lo mínimo exigible:

- [ ] Todo control tiene nombre accesible: texto visible o `aria-label`.
- [ ] Ese nombre no contiene el de otro control del mismo diálogo. El botón
      de cerrar se llama «Cerrar»; el contexto va en `aria-describedby`.
- [ ] Todo campo de formulario tiene `id` y un `<label htmlFor>` asociado.
      Un `placeholder` **no** es una etiqueta: desaparece al escribir.
- [ ] Toda imagen tiene `alt`, descriptivo o `alt=""` si es decorativa.
- [ ] Los diálogos usan el componente compartido, con foco atrapado y cierre
      con Escape (se establece en C1.3).
- [ ] El foco es visible en todos los estados.
- [ ] El contraste cumple AA: 4,5:1 en texto normal, 3:1 en texto grande.
- [ ] `npm run axe` no aumenta ningún recuento.
