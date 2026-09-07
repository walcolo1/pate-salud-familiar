# Arnés de pruebas · Paté · Salud Familiar

Documento permanente. Aplica a todos los bloques del proyecto, no solo a A6.

---

## 1 · Objetivo

Esta aplicación gestiona historia clínica familiar. El arnés existe para que cada cambio que toque **autenticación, permisos, persistencia, sincronización, invitaciones, datos clínicos o backend** llegue con evidencia reproducible, y para que esa evidencia **no se pueda confundir con la que no se tiene**.

De ahí la regla que gobierna todo lo demás: **una tabla de cobertura inflada es peor que no tener tabla**. Si algo se probó con dobles, se dice. Si no se probó, se dice.

---

## 2 · Comandos

```bash
npm run test:all        # todo, en orden, y se detiene en el primer fallo
```

equivale a, en este orden:

```bash
npm run test:run        # unitarias (Vitest, entorno node)
npm run typecheck       # tsc --noEmit
npm run lint:cambiados  # ESLint solo sobre archivos que toca el cambio
npm run e2e             # Playwright sobre Chromium real
```

Individuales:

| Comando | Qué hace |
|---|---|
| `npm test` | Vitest en modo vigilancia |
| `npm run test:run` | Vitest una pasada |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint global — **falla por deuda preexistente**, ver §2.1 |
| `npm run lint:cambiados` | ESLint solo sobre archivos modificados o nuevos frente a `origin/main` |
| `npm run e2e` | Playwright; levanta `next build && next start` en el puerto 3100 |
| `npx playwright test e2e/<archivo>` | Un solo archivo E2E |

### 2.1 · Por qué el lint es dirigido y no global

El proyecto arrastra deuda de ESLint documentada en la auditoría (P2-1). Un `eslint .` fallaría siempre, y un comando que siempre falla deja de aportar información.

`lint:cambiados` analiza solo los archivos que el cambio toca y compara los errores de cada uno con `scripts/lint-baseline.json`:

| Situación | Comportamiento |
|---|---|
| Archivo nuevo o sin línea base | se exige **cero** errores |
| Archivo con deuda registrada | falla **solo si empeora** |
| Archivo que mejora | avisa para bajar la línea base |

Línea base vigente:

```json
{ "src/context/AppContext.tsx": 83, "src/app/settings/page.tsx": 15 }
```

Así un fallo significa siempre *"esta tarea introdujo un problema"*, y la deuda existente no puede crecer sin que se note. Subir una línea base es una decisión deliberada y visible en el diff:

```bash
npm run lint:cambiados -- --actualizar-linea-base
```

La deuda de fondo se ataca en el **bloque C, tarea C7**, que además añade `eslint-plugin-jsx-a11y` y convierte `no-console` y `no-explicit-any` en errores. Cuando las líneas base lleguen a 0, este mecanismo puede retirarse y pasar a lint global.

---

## 3 · Aislamiento — reglas no negociables

El arnés E2E monta un entorno que **no puede** tocar nada real:

| Medida | Dónde |
|---|---|
| Servidor local con `next build && next start`, puerto 3100 | `playwright.config.ts` |
| **Nunca** Vercel ni producción | `baseURL: http://127.0.0.1:3100` |
| Backend de pruebas `NEXT_PUBLIC_DATA_BACKEND=sheets` | `playwright.config.ts` → `webServer.env` |
| Credenciales de Firebase deliberadamente falsas (`demo-e2e-a6`, `e2e-falsa`) | idem |
| Bloqueo de red hacia `accounts.google.com`, `apis.google.com`, `googleapis.com`, `firebaseio.com`, `gstatic.com` | `e2e/apoyo.ts` → `bloquearGoogle()` |
| Sesión por el **modo demostración** de la app, nunca OAuth | `e2e/apoyo.ts` → `entrarEnModoDemo()` |
| Contexto de navegador aislado por prueba | Comportamiento por defecto de Playwright |
| `trace: 'off'`, `video: 'off'`, `screenshot: 'off'` | `playwright.config.ts` |

### 3.1 · Datos sintéticos

Los únicos valores admitidos en fixtures están en `e2e/apoyo.ts`:

```
DOCUMENTO-TEST-A6-99887766
MEDICAMENTO-TEST-A6
https://drive.google.com/test-spreadsheet-A6
test@example.invalid
```

Deben ser **reconocibles a simple vista como de prueba**. Si un valor podría confundirse con uno real, no sirve.

### 3.2 · Prohibido en el repositorio

Nunca se versiona, ni siquiera temporalmente:

- `storageState`, cookies, perfiles de navegador
- claves, tokens OAuth, credenciales de cualquier tipo
- capturas de pantalla, vídeos, trazas de Playwright
- datos clínicos reales, correos reales, documentos de identidad reales

Barreras: la configuración desactiva capturas, vídeos y trazas; y `.gitignore` excluye `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/` y `e2e/.auth/`.

---

## 4 · Clasificación obligatoria de la evidencia

Cada resultado se etiqueta con **una** de estas categorías. **Nunca se mezclan en la misma fila de una tabla.**

| Categoría | Qué significa | Qué NO demuestra |
|---|---|---|
| **Unitaria** | Función pura o módulo aislado, sin navegador | Nada sobre integración ni sobre la interfaz |
| **Unitaria con dobles** | Igual, pero con dependencias sustituidas por *stubs* | Nada sobre el comportamiento real de la dependencia sustituida |
| **E2E navegador real** | Chromium real, servidor local, sin dobles en la app | Nada sobre servicios externos, que están bloqueados |
| **E2E simulada** | Navegador real pero con alguna pieza sustituida o forzada | Debe decir **qué** pieza está simulada |
| **Integración con emulador** | Emulador de Firebase u otro servicio local | No es el servicio de producción |
| **Firebase real / recurso real** | Contra el proyecto productivo | Solo puede afirmarse si se ejecutó de verdad |
| **Validación manual pendiente** | Requiere intervención humana | **No cuenta como aprobada** hasta que haya evidencia |

Regla de redacción: no escribir *"probado contra Firebase"* si se usaron dobles, jsdom, *stubs* o el emulador. Nombrar siempre la categoría exacta.

---

## 5 · Qué hacer cuando algo no se puede automatizar

Cuando una prueba exija cuenta Gmail real, OAuth real, Apps Script real, Firebase productivo, dos dispositivos o una acción en consola:

1. **Automatizar todo lo automatizable** con dobles o emulador, y decir con precisión qué queda fuera.
2. **Declararla como validación manual pendiente**, en §6 de este documento.
3. **Escribir instrucciones paso a paso** para quien la ejecute: preparación, acción, criterio de aceptación observable.
4. **Nunca marcarla como aprobada sin evidencia.** Ni "debería funcionar", ni "por construcción".

---

## 6 · Validaciones manuales pendientes

Se ejecutan antes del **corte final de Firebase en el bloque G**.

### 6.1 · Limpieza efectiva de IndexedDB de Firestore

*Cubierto solo por dobles.* `terminate()` y `clearIndexedDbPersistence()` están sustituidos en `purgaFirestore.test.ts`; lo probado es la lógica del marcador, no el borrado real.

1. Arrancar con `NEXT_PUBLIC_DATA_BACKEND=firebase` y una sesión real.
2. Abrir un expediente para forzar lecturas de Firestore.
3. Herramientas de desarrollo → *Application → IndexedDB*: confirmar que existe `firestore/[DEFAULT]/…`.
4. Cerrar sesión.
5. **Criterio:** esa base desaparece o queda vacía.

### 6.2 · Purga diferida real con dos pestañas

*Cubierto solo por dobles.* `failed-precondition` depende de que otra pestaña tenga el *lease* de IndexedDB; no es forzable de forma determinista.

1. Abrir la app en **dos** pestañas con sesión iniciada.
2. Cerrar sesión en una.
3. **Criterio:** aparece la franja ámbar *"quedan datos en caché…"*, que **no** afirma que se borraron, y `pate:purga_firestore_pendiente` sigue en `localStorage`.

### 6.3 · Recarga única tras purga diferida con éxito

*No cubierto.* Vive en `AppContext` y solo se activa con backend `firebase`.

1. Tras 6.2, cerrar la otra pestaña.
2. Recargar la app.
3. **Criterio:** se recarga **una sola vez** (no en bucle), el marcador desaparece y la base de Firestore queda vacía.

### 6.4 · Modo incógnito

*No cubierto.* Playwright no expone el incógnito real de Chrome con IndexedDB restringido.

1. Ventana de incógnito → iniciar sesión → cerrar sesión.
2. **Criterio:** cierra sin excepciones en consola y redirige a `/login`.

### 6.5 · Estado «sincronizando» durante una operación real

*Cubierto a nivel unitario (3 casos de la máquina de estados), no en navegador.* `isSyncInProgress` solo es `true` durante una sincronización real con Google.

1. Con backend `sheets` y sesión real de Google, provocar una sincronización larga.
2. Pulsar *Cerrar Sesión* mientras está en curso.
3. **Criterio:** aparece *"Guardando cambios"* con **solo** dos opciones —*Esperar a que termine* y *Cancelar cierre de sesión*—, sin ninguna forma de abortar la sincronización. Al terminar, el cierre continúa solo si no quedan pendientes.

---

## 7 · Política de trabajo

**Antes de cambiar código** que toque autenticación, permisos, persistencia, sincronización, invitaciones, datos clínicos o backend: añadir o actualizar primero las pruebas pertinentes en este arnés.

**Antes del commit de un bloque:** ejecutar `npm run test:all` y reportar la tabla de resultados con las categorías de §4.

**Antes de cualquier despliegue:** ejecutar `npm run test:all`, más las pruebas de seguridad que apliquen, y **pedir aprobación explícita**. Nunca desplegar por iniciativa propia.

**Cuando una prueba requiera recursos reales:** aplicar el procedimiento de §5 sin excepción.

---

## 8 · Estructura del arnés

```
web/
├── playwright.config.ts          configuración E2E y aislamiento
├── vitest.config.ts              unitarias, entorno node, sin jsdom
├── scripts/
│   └── lint-cambiados.mjs        ESLint dirigido a lo que toca el cambio
├── e2e/
│   ├── apoyo.ts                  bloqueo de red, sesión demo, datos sintéticos
│   ├── purga-almacenamiento.e2e.ts
│   └── dialogo-cierre.e2e.ts
├── src/lib/*.test.ts             unitarias junto al módulo que prueban
└── docs/TESTING.md               este documento
```

Los módulos se diseñan **testeables sin jsdom**: aceptan un almacén inyectable en lugar de leer `window.localStorage` directamente. Eso mantiene las unitarias rápidas y sin emulación del navegador.
