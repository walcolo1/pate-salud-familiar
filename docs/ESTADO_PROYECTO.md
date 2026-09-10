# Estado del proyecto — Paté · Salud Familiar

*Instantánea para retomar el trabajo sin releer el historial. El detalle paso a
paso está en [TABLERO.md](TABLERO.md); esto es dónde estamos, qué sostiene lo
hecho y qué falta.*

Última actualización: **10 de septiembre de 2026**, al cerrar **D4-fase-2**.

---

## Dónde estamos

| Bloque | Contenido | Estado |
|---|---|---|
| **A** | Saneamiento y seguridad de base | cerrado |
| **B** | OAuth y retirada de Gmail | cerrado |
| **C** | Accesibilidad y UX | cerrado · queda la validación manual §6.12 |
| **D** | Mascotas y veterinario | **cerrado** |
| **E** | Backend de Apps Script por titular | pendiente |
| **G** | Corte seco de Firebase | pendiente |
| **H** | Eliminar el autoguardado global de PHI | pendiente |

El Bloque D cierra con cuatro pasos y una fase de convención:

- **D1** · modelo, validación de dominio y CRUD de mascotas (sin borrado: baja lógica).
- **D2** · controles de peso, con gráfica accesible sin `canvas` y alertas a ±10 % / ±20 %.
- **D3** · vacunación, con estado **calculado** y aviso genérico sin nombre del animal.
- **D4-fase-1** · el botón de cerrar de `Dialog` se llama «Cerrar»; el contexto va en `aria-describedby`.
- **D4-fase-2** · historial clínico veterinario.

---

## Las puertas, y cómo se ejecutan

Todo desde `web/`:

```bash
npm run test:all
```

Equivale a `vitest run` → `tsc --noEmit` → `lint:cambiados` → `playwright test`.
La suite de accesibilidad (`e2e/accesibilidad.e2e.ts`) compara contra
`e2e/axe-baseline.json` con **tolerancia cero**: cualquier violación nueva es
una regresión, y la línea base solo se reescribe con bajadas reales.

Estado al cerrar D4-fase-2:

| Puerta | Resultado |
|---|---|
| `vitest run` | 417 pruebas, 19 ficheros |
| `tsc --noEmit` | 0 |
| `lint:cambiados` | sin regresiones |
| Playwright | 157 pruebas |
| axe | 0 violaciones en 33 mediciones |

`AppContext.tsx` arrastra deuda de lint anterior (72 errores permitidos en la
línea base). No aumenta; tampoco se ha reducido.

---

## Decisiones que sostienen lo construido

Están razonadas en [ACCESIBILIDAD.md](ACCESIBILIDAD.md) y en las cabeceras de
cada módulo. Las que más condicionan lo que venga:

- **Nada de datos en el cuerpo de un aviso.** Se leen sobre la pantalla
  bloqueada. La regla es «sin interpolación», no «sin datos sensibles»: la
  primera se puede comprobar con una prueba (`PROHIBIDO_EN_AVISOS`), la segunda
  exige criterio cada vez. Alcanza también a los nombres de mascota.
- **Un solo catálogo de estados.** `EstadoEvento` tiene cuatro valores y
  `TipoEvento` otros cuatro. Una agenda con varios vocabularios de estado es una
  agenda que nadie puede filtrar.
- **El estado se calcula, no se guarda.** Vale para las vacunas: un estado
  guardado que nadie refresca miente en cuanto pasa la medianoche.
- **Nada se borra.** Baja lógica en mascotas, `allow delete: if false` en las
  reglas de Firestore, y un expediente ilegible se conserva y se pone en
  cuarentena en vez de eliminarse.
- **Fechas siempre en hora local.** Nunca `new Date('YYYY-MM-DD')`: es
  medianoche UTC y al oeste de Greenwich cae en el día anterior.
- **Validar en el dominio, no en el formulario.** El formulario no es la única
  puerta: también entran datos por la restauración de un respaldo y, en el
  Bloque G, desde Firestore.
- **El nombre accesible es también la dirección del control.** Ningún nombre de
  etiqueta puede ser subcadena de otro dentro de un diálogo (D4-fase-1).

---

## Restricciones permanentes

- **Cuentas personales.** Ningún titular ni familiar puede necesitar Google
  Workspace en ningún punto del flujo. Si un bloque lo necesitara, **parar y
  avisar** antes de implementarlo. Afecta sobre todo a **E** y **G**.
- **Nunca versionar** correos, nombres, números de documento, contenido
  clínico, identificadores completos ni tokens. Ningún mapa hash → identificador
  real se persiste en ninguna parte.
- **No tocar** Google Cloud, Firebase, APIs, ámbitos ni clientes OAuth por
  iniciativa propia. No reescribir el historial de git.
- **Pruebas antes que código**, y evidencia real, emulada y simulada siempre
  clasificadas por separado (ver [TESTING.md](TESTING.md)).

---

## Deuda conocida y trabajo pendiente

| Qué | Dónde |
|---|---|
| Validación con lector de pantalla, escrita pero **no ejecutada** | `TESTING.md` §6.12 |
| Validación de consentimiento OAuth limpio | `TESTING.md` §6.11 |
| `/members/:id/edit` y `/login` fuera de la red de axe | `ACCESIBILIDAD.md`, puerta de C9 |
| 23 `alert` de error siguen sin migrar al sistema de avisos | `src/` |
| Deuda de lint en `AppContext.tsx` (72 errores en línea base) | `scripts/lint-baseline.json` |
| Adjuntos del historial veterinario: el campo `documentoId` existe y nadie lo rellena | `src/domain/mascotas.ts` |

---

## Siguiente paso

**Bloque E — backend de Apps Script por titular.** Antes de empezar, comprobar
que ningún paso del diseño exige una cuenta de organización; si lo exige, parar
y avisar.
