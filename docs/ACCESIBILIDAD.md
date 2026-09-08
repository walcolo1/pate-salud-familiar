# Accesibilidad

> Bloque C · Pasos C1.1 y C1.2 · Última actualización: **2026-09-08**

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

**Consecuencia práctica:** el trabajo de C1.4 sobre los campos **no se verá
reflejado en esta línea base** salvo que antes se amplíe la cobertura. La
recomendación es hacerlo en C1.4: añadir las rutas con formularios visibles y
abrir cada modal antes de analizar. Hasta entonces, la línea base mide una
parte de la deuda, no toda.

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

Todas requieren sesión, así que la suite entra por `entrarEnModoDemo()`: sin
cuenta de Google, sin OAuth y sin red, igual que el resto del arnés.

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
