# Estado del proyecto — Paté · Salud Familiar

*Instantánea para retomar el trabajo sin releer el historial. El detalle paso a
paso está en [TABLERO.md](TABLERO.md); esto es dónde estamos, qué sostiene lo
hecho y qué falta.*

Última actualización: **21 de septiembre de 2026**, al cerrar **E10**.

---

## Dónde estamos

| Bloque | Contenido | Estado |
|---|---|---|
| **A** | Saneamiento y seguridad de base | cerrado |
| **B** | OAuth y retirada de Gmail | cerrado |
| **C** | Accesibilidad y UX | cerrado · queda la validación manual §6.12 |
| **D** | Mascotas y veterinario | **cerrado** |
| **E** | Backend de Apps Script por titular | **cerrado** · E0 a E9 validados · **E10** amplía el esquema a v2 |
| **G** | Corte seco de Firebase | **en curso** · G1 cerrado · G0 **parado** por la brecha de modelo |
| **H** | Eliminar el autoguardado global de PHI | **absorbido por G** · hacer G bien lo obliga |

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

Estado al preparar E6-live:

| Puerta | Resultado |
|---|---|
| `vitest run` | 676 pruebas, 28 ficheros |
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
- **Ámbitos mínimos en Apps Script.** Servicios avanzados en vez de los
  clásicos, para pedir `drive.file` en vez de `drive` y `script.send_mail` en
  vez del buzón entero. El backend de E1 **no pide ningún ámbito restringido**.
- **El esquema de la hoja se define una vez.** `src/lib/esquemaHoja.ts` es la
  única definición; el `Esquema.gs` del instalador se genera, y una prueba falla
  si se queda atrás.

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
| Confirmar que no llegan correos de error de los disparadores (al día siguiente de instalar) | `EVIDENCIA_E2.md` |
| Las cinco capturas de la pantalla de «app no verificada», sobre una copia de usar y tirar | `PLANTILLA_PRODUCCION.md` · paso 6 |
| La carpeta `Temporal` existe y **nadie la vacía** hasta que E11 implemente la tarea diaria | `planInstalacion.ts` · `EVIDENCIA_E2.md` |
| Actualizar una copia ya repartida cuando cambie el código: la maestra no actualiza a nadie hacia atrás | `PLANTILLA_PRODUCCION.md` |
| Mirar el cuerpo del correo de invitación recibido: es lo único que queda de E9 | `EVIDENCIA_E9.md` |
| Pegar el consolidado v2 en la plantilla maestra y reinstalar la hoja de pruebas para que reparen encabezados | `E10-ESQUEMA-V2.md` |
| Las 4 escrituras de E11 siguen sin pestaña: lanzarán un error explícito en vez de callar | `G0-BRECHA-DE-MODELO.md` |
| `version_esquema` dice en qué versión está una hoja, pero **nadie actúa** en consecuencia todavía | `E10-ESQUEMA-V2.md` |
| `SheetsRepository` tiene **las 31 escrituras mudas**: girar la bandera a `sheets` hoy perdería datos en silencio. Medido y acotado por G1; lo arregla **G0** | `scripts/escrituras-mudas.json` |
| Validación de consentimiento OAuth limpio | `TESTING.md` §6.11 |
| `/members/:id/edit` y `/login` fuera de la red de axe | `ACCESIBILIDAD.md`, puerta de C9 |
| 23 `alert` de error siguen sin migrar al sistema de avisos | `src/` |
| Deuda de lint en `AppContext.tsx` (72 errores en línea base) | `scripts/lint-baseline.json` |
| Adjuntos del historial veterinario: el campo `documentoId` existe y nadie lo rellena | `src/domain/mascotas.ts` |
| `E0b-4` sin volver a pasar contra el despliegue de E6: el criterio 1 está cerrado desde Node, no desde un navegador | `EVIDENCIA_E6.md` · paso 7 |
| El cerrojo de `aplicar` y el lote de varias pestañas siguen sin comprobarse en vivo: hacen falta dos peticiones a la vez y datos que escribir | `ROUTER.md` · después del **Bloque G** |

---

## El Bloque E, cerrado

Diez pasos. El backend de cada familia vive dentro de su propia hoja, con su
propio despliegue y su propio Drive: el aislamiento es de la infraestructura de
cuentas de Google, no de reglas que alguien pueda escribir al revés.

| Paso | Qué | Validado contra Google |
|---|---|---|
| **E0 · E0-bis** | Reconocimiento, cuotas y transporte | ✅ · corrigió tres afirmaciones de la especificación |
| **E1** | Plantilla, 21 pestañas y siete ámbitos, ninguno restringido | ✅ en E2 |
| **E2** | Instalador idempotente | ✅ · 23 s desde cero, 4,9 s al repetir |
| **E3** | Verificación del `id_token` | ✅ en E6-live |
| **E4** | Rol, alcance y revocación inmediata | ✅ · 2 535 ms con la caché caliente |
| **E5** | Matriz de permisos por rol | ✅ por la cadena, en E6-live |
| **E6 · E6-live** | Router: puerta única y `aplicar()` por lotes | ✅ · 9 de 9 |
| **E6-bis** | Normalización simétrica de correos | Probado en frío |
| **E7** | Invitaciones | ✅ · correo enviado y canjeado de verdad |
| **E8** | Plantilla maestra y guion de publicación | ✅ · molde publicado y `/copy` probado |
| **E9** | Ruta `/invitacion` en la PWA | ✅ · **un familiar entró sin ver una sola pantalla de permisos** |

**Lo que queda del bloque no es código**: armar la hoja maestra, capturar la
pantalla de permisos y las cinco comprobaciones de E7, que necesitan la ruta
`/invitacion` de la PWA. Están en la tabla de deuda, cada una con su sitio.

---

## Siguiente paso

**Retomar G0**: el mapeo de modelos a pestañas, ahora sobre base firme. E10
cerró la brecha añadiendo 23 columnas en 6 pestañas y subiendo el esquema a
**v2** ([E10-ESQUEMA-V2.md](E10-ESQUEMA-V2.md)).

Antes conviene pegar el consolidado nuevo en la plantilla maestra y reinstalar
la hoja de pruebas: `instalar()` ahora repara encabezados de pestañas que ya
existían, y eso no se ha ejercitado contra Google todavía.

El plan completo, con los seis pasos y sus puertas, está en
[PLAN_BLOQUE_G.md](PLAN_BLOQUE_G.md).

Las dos comprobaciones de `aplicar()` que siguen abiertas en `ROUTER.md` no se
desbloquean aceptando una invitación: hacen falta dos peticiones simultáneas y
datos que escribir. Llegan cuando la PWA guarde de verdad contra el backend,
después de G.
