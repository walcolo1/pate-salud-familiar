# Tablero del proyecto

Estado de los bloques del plan de refactorización y migración.
Última actualización: **2026-09-08**.

Verificado en esta fecha contra el código y el arnés: 199 unitarias, 55 E2E,
`tsc` limpio y lint sin regresiones.

---

## Bloque A · Saneamiento y seguridad de base — **CERRADO**

| Tarea | Estado | Commit |
|---|---|---|
| A1 · Repositorio de workspace | cerrada | `670bc80` ᴿ |
| A2 · Normalización de fin de línea | cerrada | `2503d29` ᴿ, `b98bdca` ᴿ |
| A3 · Una sola fuente para las reglas de Firestore | cerrada | `8a2f763` ᴿ |
| A4 · Endurecer `permissions` en las reglas | cerrada | desplegada en producción |
| A4-bis · Auditoría de datos, solo lectura | cerrada | informe saneado en `docs/analisis/` |
| A5 · Endurecer la lectura de invitaciones | cerrada | desplegada en producción |
| A6-F1 · Preferencias no clínicas separadas | cerrada | `bfb677d` |
| A6-F2 · Purga al cerrar sesión + arnés E2E | cerrada | `f474818` |
| A6-F3 · Bloqueo veraz y aislamiento DEMO | cerrada | `6bbb0ef` |
| A7 · Cabeceras de seguridad HTTP | cerrada | `6a6aa8f` |
| A8 · Verificación de configuración de entorno | cerrada | `b491cbe` |
| A9 · Limpieza del árbol y documentos de análisis | cerrada | `b491cbe`, `1c706aa` |

ᴿ = commit del repositorio **raíz** (`pate-salud-familiar-workspace`). Los
demás son de `web/` (`pate-salud-familiar`).

**Qué dejó A6:** el expediente no sobrevive al cierre de sesión, no se muestra
bajo bloqueo, y el bloqueo sobrevive a una recarga con un marcador de tres
campos sin PHI. **Lo que NO resolvió:** el autoguardado global de PHI en
`localStorage` mientras la sesión está abierta. Eso es del **Bloque H**.

---

## Bloque B · OAuth y retirada de Gmail — **CERRADO**

| Tarea | Estado | Commit |
|---|---|---|
| B0 · Documento de transición | cerrada | `7b6fc04` |
| B1 · Inventario de ámbitos y dependencias | cerrada | `7b6fc04` |
| B2 · Importación manual de citas | cerrada | `7b6fc04` |
| B3 · Pruebas unitarias y E2E | cerrada | `7b6fc04` |
| D1 · Lectura local de PDF con pdf.js | cerrada | `7b6fc04` |
| B4 · Verificación en Google Cloud Console | cerrada | evidencia en `TESTING.md` §6-bis |
| B4.1 · Orígenes de JavaScript autorizados | cerrada | `49dfee0` |
| B5 · Prueba real con cuenta personal | cerrada | `49dfee0` |
| §6.11 · Consentimiento limpio | **aprobada con salvedad** | `49dfee0` |

**Resultado:** `gmail.readonly` retirado por completo, Gmail API deshabilitada
en el proyecto, y la importación de citas conservada por texto pegado o PDF
leído en el propio dispositivo. Ningún ámbito restringido, ninguna evaluación
CASA, ningún requisito de Google Workspace.

**Salvedad de §6.11:** Drive y Calendar seguían autorizados de una sesión
anterior, así que no se observó una pantalla de concesión nueva para ninguno de
los dos. Sí quedó verificado que **no aparecen en el consentimiento inicial**.

---

## Bloque C · Accesibilidad y UX — **CERRADO** (pendiente la validación manual §6.12)

| Paso | Estado |
|---|---|
| C1.1 · Arnés de accesibilidad con axe | **cerrado** |
| C1.2 · Botones sin nombre accesible | **cerrado** |
| C1.3a · Componente `Dialog` base, 8 diálogos y cobertura ampliada | **cerrado** |
| C1.3b · 3 diálogos de órdenes, 18 `confirm` y 23 `alert` sustituidos | **cerrado** |
| C1.4 · Etiquetas de los campos de formulario | **cerrado** |
| C1.5 · Foco visible, teclado, contraste AA y zoom | **cerrado** |
| C2 · Estados de carga, vacío y error unificados | **cerrado** |
| C3.1 · Agenda unificada (citas, dosis, controles) | **cerrado** |
| C3.2 · Avisos locales sin PHI (con limitación conocida) | **cerrado** |
| C3.3 · Ficha del familiar coherente (9 secciones) | **cerrado** |
| C3.4 · Pautas de medicación recurrentes | **cerrado** |
| C4 · Cierre: validación manual documentada y puerta de C9 | **cerrado** |

---

## Bloque D · Mascotas y veterinario — **EN CURSO**

| Paso | Estado |
|---|---|
| D1 · Modelo de datos, CRUD y pantalla de mascotas | **cerrado** |
| D2 · Controles de peso (gráfica y alertas) | **cerrado** |
| D3 · Vacunación (calendario y recordatorios) | pendiente |
| D4 · Historial clínico veterinario | pendiente |

---

## Bloques posteriores

| Bloque | Contenido | Estado |
|---|---|---|
| **E** | Backend de Apps Script por titular | pendiente |
| **G** | Corte seco de Firebase | pendiente |
| **H** | Eliminar el autoguardado global de PHI | pendiente |

---

## Deuda registrada y decidida

| Asunto | Decisión | Dónde |
|---|---|---|
| Ámbitos `spreadsheets` y `drive.appdata` pedidos pero no declarados | se resuelve en el Bloque E | `SEGURIDAD.md` |
| Client ID público en el historial de Git | no se reescribe el historial | `SEGURIDAD.md` |
| `emailSources` conservado como dato sin interfaz | se retira o migra en el Bloque E | `TRANSICION-GMAIL.md` |
| Campo `gmailMessageId` con nombre heredado | se renombra en el Bloque E | `TRANSICION-GMAIL.md` |
| Imágenes y PDF escaneados sin OCR | fuera de alcance por ahora | `TRANSICION-GMAIL.md` |
| `'unsafe-inline'` en `script-src` | deuda consciente; el nonce sacaría 20 rutas de la generación estática | `next.config.ts` |

---

## Validaciones manuales pendientes

Se ejecutan antes del corte de Firebase del Bloque G. Detalle en
`TESTING.md` §6: limpieza real de IndexedDB, purga diferida con dos pestañas,
recarga única, modo incógnito, umbral real de 8 horas, restauración desde
Firestore, temporizador de inactividad, DEMO con token vivo, respaldo DEMO en
sesión real y estado «sincronizando» durante una operación real.
