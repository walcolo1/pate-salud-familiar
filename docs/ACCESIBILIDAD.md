# Accesibilidad

> Bloque C · Pasos C1.1, C1.2, C1.3a, C1.3b y C1.4 · Última actualización: **2026-09-08**

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

## Lista de comprobación para componentes nuevos

Hasta que C1.3 fije el patrón definitivo, lo mínimo exigible:

- [ ] Todo control tiene nombre accesible: texto visible o `aria-label`.
- [ ] Todo campo de formulario tiene `id` y un `<label htmlFor>` asociado.
      Un `placeholder` **no** es una etiqueta: desaparece al escribir.
- [ ] Toda imagen tiene `alt`, descriptivo o `alt=""` si es decorativa.
- [ ] Los diálogos usan el componente compartido, con foco atrapado y cierre
      con Escape (se establece en C1.3).
- [ ] El foco es visible en todos los estados.
- [ ] El contraste cumple AA: 4,5:1 en texto normal, 3:1 en texto grande.
- [ ] `npm run axe` no aumenta ningún recuento.
