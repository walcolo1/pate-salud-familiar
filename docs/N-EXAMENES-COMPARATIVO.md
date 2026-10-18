# Bloque N: exámenes clínicos, lectura de informes y comparativo histórico

## 1 · De dónde salen los valores

Están en `/members/[id]/exams` ▸ **Registrar examen** (`RegistroExamen.tsx`). Los valores pueden llegar de tres formas:

| Fuente | Qué pasa |
|---|---|
| **Subir PDF** | `extraerTextoPdf` (pdf.js 6, con su worker en el propio origen y la CSP de A7 sin tocar) lee la capa de texto **en el navegador**. El archivo no se sube ni se envía a ningún servicio. Si el PDF está escaneado, dañado o pasa de 8 MB, se avisa, y quedan disponibles el texto pegado y la captura a mano. |
| **Pegar texto** | Se usa el mismo lector que para el PDF. |
| **A mano** | Una fila vacía por cada valor. |

El lector es `parsearInforme` (`src/lib/resultadosLaboratorio.ts`). Funciona con reglas y expresiones regulares, sin red y sin IA, así que el mismo texto da siempre las mismas filas. Reconoce:

- **Filas** con la forma `ANALITO [método] valor [marca *, H, L, ↑] unidad rango`. Ejemplos: `HDL COLESTEROL 48.0 mg/dL * 55 - 85`, `Glucosa: 95 mg/dL (70-100)` y `PLAQUETAS 250.000 /mm3 150.000 - 450.000`.
- **Números**:
  - la coma o el punto decimal;
  - `1.234,5` y `1,234.5`;
  - el punto de miles, **solo** en unidades de recuento (`/mm3`, `x10^3/µL`, `cel/µL`). En `mg/dL`, `1.200` se lee 1,2.
- **Rangos**: `80 - 200`, `3,5 a 7,2`, `< 150`, `Menor de 130`, `Menos de 200`, `Hasta 5`, `> 40` y `Mayor a 40`.
- **Fecha de la muestra**:
  - Formatos: `dd/mm/aaaa`, `aaaa-mm-dd`, `12-MAR-2025` y «3 de febrero de 2026».
  - Prioridad: primero la etiqueta de toma de muestra, luego la de resultado o validación, luego la de ingreso y por último cualquier «Fecha».
- **Laboratorio**:
  - una etiqueta `Laboratorio:` o `IPS:`;
  - nombres conocidos: Colcan, Synlab, Dinámica, Sura, Cafam, Colsanitas, Compensar, Hospital Militar, Dirección de Sanidad, Establecimiento de Sanidad Militar, etc.;
  - una línea que diga «laboratorio».
- **Líneas que no son resultados**: se descartan las de edad, teléfono, cédula, página, fecha, paciente, etc. Un nombre que no está en el catálogo solo se propone si la línea trae a la vez una unidad de laboratorio **y** un rango, y entonces su confianza es `BAJA`.

### Catálogo canónico y especie

`CATALOGO_ANALITOS` reúne unos 60 analitos, cada uno con sus sinónimos. Ejemplos: «Glicemia basal», «Glucosa en suero» → `GLUCOSA`; «Colesterol LDL», «LDL-C» → `COLESTEROL_LDL`; «TGP» → `ALT`.

- Cuando un nombre podría corresponder a varios analitos, gana el sinónimo más largo: «Hemoglobina glicosilada» es `HBA1C`, no `HEMOGLOBINA`.
- Una prueba impide que el mismo sinónimo apunte a dos analitos distintos.

Cada analito declara sus especies (`HUMANO`, `MASCOTA` o ambas):

- **Analitos de una sola especie**: el PSA o la HbA1c solo son humanos, y el SDMA o la cPL solo de mascota. Si aparecen en el informe de la otra especie, se ignoran y se avisa.
- **Informe completo**: `detectarEspecie` busca marcas veterinarias (especie, raza, propietario, «veterinaria») y marcas humanas (cédula, EPS, Sanidad Militar, sexo). Si el informe es de la otra especie, se **bloquea** el guardado: no se rellena la tabla y tanto «Agregar fila» como «Guardar» quedan desactivados.

Las fichas de `/members` son de personas (`HUMANO`). El módulo ya admite `MASCOTA` para cuando el historial veterinario reciba sus propios exámenes.

## 2 · Bandeja de verificación (obligatoria)

Antes de guardar, los valores leídos se muestran en una tabla editable con estas columnas: analito, valor, unidad, mínimo (o texto de referencia cualitativo), máximo y estado calculado.

- Cada fila muestra lo que impide guardarla: falta el analito, el valor o la unidad, el mínimo es mayor que el máximo, etc.
- Se pueden corregir números, quitar filas y añadir filas a mano.
- **Guardar** solo se activa cuando no queda ninguna fila con errores y se ha marcado «Revisé cada valor contra el informe original». Cualquier edición posterior desmarca la revisión.

## 3 · Persistencia: `EXAMENES` + `EXAMENES_RESULTADOS`, sin cambiar el esquema

La pestaña ya existía en el esquema v6. Sus columnas reales son las de `esquemaHoja.ts`:

```
id · examen_id · parametro · valor · unidad · rango_referencia · fuera_de_rango ·
confianza_extraccion · verificado_por · (sincronización) · paciente_id
```

| Columna | Qué guarda el Bloque N |
|---|---|
| `parametro` | El nombre del analito tal como lo verificó la persona. |
| `valor` | Un número con punto decimal (`48`, `5.9`, `250000`) o un texto cualitativo. |
| `unidad` | La del informe. |
| `rango_referencia` | La forma canónica: `70 - 100`, `< 200`, `> 40` o el texto cualitativo. |
| `fuera_de_rango` | `SI` o `NO`, calculado. |
| `confianza_extraccion` | **Nueva en el descriptor**: `ALTA`, `MEDIA` o `BAJA` (lector), `MANUAL` o `CORREGIDO` (la persona cambió lo leído). |
| `verificado_por` | **Nueva en el descriptor**: `REVISION_HUMANA:<aaaa-mm-dd>`. No guarda ni correo ni nombre, y respeta el trinquete de privacidad. |

El código canónico, el mínimo y el máximo **no se guardan**: se derivan al leer, así que una mejora del catálogo reagrupa también el histórico ya guardado. El examen se escribe en el mismo lote atómico (`aplicar`) que sus resultados y su evento de historial (`AppContext.addExam`).

La prueba `repositorioBackend.test.ts` («Bloque N · …») verifica la ida y vuelta: lo que se escribe en la fila sale igual por `exportar`/`loadAll`.

**Pate.gs no cambia.** `aplicar` y `exportar` ya trataban `EXAMENES_RESULTADOS` con el verbo `ESCRIBIR_CONTROL`, y sus columnas ya estaban en el esquema. Regenerar `apps-script/dist/Pate.gs` da el mismo archivo, así que no hay que publicar una versión nueva del despliegue ni de la plantilla.

Las filas anteriores al Bloque N, como las migradas y las de demostración, no traen `verificado_por`. Se muestran con la nota «sin verificar», ni se ocultan ni se reescriben.

## 4 · Comparativo histórico

`construirComparativo` calcula el comparativo y `ComparativoHistorico.tsx` lo pinta, siempre visible en la vista de exámenes.

- **Columnas**: los últimos 6 exámenes **con valores** del paciente, del más antiguo al más reciente. La fecha es la de la muestra (`performedDate`, o la de la orden si falta).
- **Series**: una por `código canónico + unidad normalizada`. **Nunca se compara entre unidades distintas**: `mg/dL` y `mmol/L` son dos series, y la fila avisa «También en mmol/L: no se compara».
- **Estado**: BAJO, NORMAL o ALTO frente al rango **de ese informe**, con los extremos dentro del rango. Un valor cualitativo es NORMAL si coincide con su referencia y «Fuera de referencia» si no. Sin rango, «Sin rango».
- **Δ y Δ %** entre los dos últimos valores numéricos. El Δ % es relativo al anterior y no se calcula si el anterior es 0.
- **Cruce de rango** entre los dos últimos estados, por ejemplo «Cruzó: Alto → Normal».
- **Tendencia**: se calcula con mínimos cuadrados sobre los últimos 4 valores, como el cambio proyectado relativo a la media. Si ese cambio es ≤ 5 % (`UMBRAL_ESTABLE`), la serie es «Estable»; si no, «Subiendo» o «Bajando». Con un solo dato aparece «Un solo dato».
- **Semáforo accesible (AA)**: el estado nunca se indica solo con color. Cada celda lleva un icono (✓, ↑, ↓) y una palabra, con texto de tono 800/900 sobre fondo 50.
- **Línea de evolución**: un SVG con la banda de referencia del último informe y una descripción textual en `aria-label`.
- **Tabla**: tiene `caption`, la región de desplazamiento recibe el foco y la columna del analito queda fija.
- **Aviso legal permanente** (`role="note"`): «Este comparativo es una herramienta para leer tus propios documentos… No es un diagnóstico. La interpretación clínica corresponde siempre al médico o veterinario tratante.»

El resumen que se guarda con el examen solo cuenta, sin interpretar: «3 valores verificados; 2 fuera del rango impreso por el laboratorio.» Las tarjetas pasaron de «Alerta/Estable» a «Fuera de rango/En rango», ahora son botones de verdad y se pueden abrir con el teclado. Se quitó el formulario que inyectaba glucosa y colesterol de prueba.

## 5 · Pendientes de los documentos revisados en este cierre

| Punto | Estado |
|---|---|
| Ficha de emergencia imprimible por miembro | **Hecho**: `/members/[id]/emergencia`, también en la barra de la ficha. Muestra grupo y RH, alergias, condiciones, medicamentos activos (prescripciones `ACTIVE` sin fin vencido más los de la ficha médica, sin duplicados), contacto de emergencia, médico y aseguradora. Lo que falta aparece como «Sin registrar», con un enlace para completarlo. Al imprimir solo sale la tarjeta (`.zona-impresion`). |
| Exámenes de mascotas con rangos veterinarios | El dominio ya está preparado (`especie: 'MASCOTA'`). Falta la pantalla en el historial veterinario, que hoy no tiene sección de exámenes. |
| OCR de PDF escaneados | Fuera de alcance, porque exigiría un modelo en el navegador o un servicio de terceros. Se avisa y se ofrece la captura a mano. |
| Conversión entre unidades (mg/dL ↔ mmol/L) | Deliberadamente **no**: la regla dura es no comparar entre unidades. Si algún día se hace, tendrá que ser explícita por analito y visible en pantalla. |

## Pruebas

| Tipo | Qué cubren |
|---|---|
| Unitarias | `resultadosLaboratorio.test.ts` (36), `fichaEmergencia.test.ts` (3) y la ida y vuelta en `repositorioBackend.test.ts`. |
| E2E | `examenes-comparativo.e2e.ts`: N1, texto → bandeja → guardado → Δ, cruce y tendencia, más el estado guardado; N2, un PDF real con pdf.js sin ninguna petición fuera; N3, bloqueo de un informe veterinario; N4, captura manual; N5, ficha de emergencia. |
| Accesibilidad (axe) | `miembro-exams-verificacion` (la bandeja con filas y errores) y `miembro-emergencia`, ambas con 0 violaciones. |
