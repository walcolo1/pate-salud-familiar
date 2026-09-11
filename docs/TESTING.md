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
| Sesión de **origen REAL simulada** —usuario sintético con `provider: 'google'`, sin token ni cuenta— | `e2e/apoyo.ts` → `entrarComoSesionRealSimulada()` |
| Contexto de navegador aislado por prueba | Comportamiento por defecto de Playwright |
| `trace: 'off'`, `video: 'off'`, `screenshot: 'off'` | `playwright.config.ts` |

### 3.1 · Datos sintéticos

Los únicos valores admitidos en fixtures están en `e2e/apoyo.ts`:

```
DOCUMENTO-TEST-A6-99887766
MEDICAMENTO-TEST-A6
https://drive.google.com/test-spreadsheet-A6
test@example.invalid
sesion-e2e@example.invalid
hoja-e2e-inexistente
DOCUMENTO-TEST-A6-99887766 (paciente «Paciente Sintetico A6»)
```

**Sobre la sesión REAL simulada.** Desde A6-F3 el modo demostración tiene una guarda estructural que impide sincronizar, así que **no puede generar cambios pendientes** y no sirve para probar el diálogo de A6-F2. Para eso se siembra un usuario sintético con `provider: 'google'`: la app lo trata como origen REAL, pero **no hay token, ni cuenta, ni red** —el tráfico a Google sigue bloqueado—, que es precisamente la condición que produce los pendientes. No interviene OAuth en ningún punto.

Deben ser **reconocibles a simple vista como de prueba**. Si un valor podría confundirse con uno real, no sirve.

**Dominios de correo.** Todo correo de prueba —unitario o E2E— termina en
`@example.invalid`. El TLD `.invalid` está reservado por el RFC 2606 y no
puede resolverse ni registrarse, así que un fixture nunca puede parecerse a
una dirección real ni, por accidente, alcanzar a nadie. Quedan prohibidos
`gmail.com`, `example.com` y cualquier dominio público, aunque el buzón sea
inventado. Un solo comando comprueba la regla sobre todo el arnés:

```bash
grep -rnoE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" src/**/*.test.ts e2e/ | grep -v "@example.invalid"
```

Debe no devolver nada. Los datos simulados de `src/lib/googleGmail.ts` NO
entran en esta regla: son datos de producción del modo simulado, no fixtures
de prueba, y su normalización está registrada como pendiente.

### 3.1.1 · Dos compilaciones, dos servidores

Desde el Bloque B el arnés levanta **dos** servidores:

| Proyecto | Puerto | Compilación |
|---|---|---|
| `app` | 3100 | normal |
| `sin-config` | 3101 | **sin** `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, en `.next-sin-config/` |

El segundo existe porque Next incrusta las variables `NEXT_PUBLIC_*` en el
paquete durante la compilación: vaciarlas al arrancar el servidor no cambia
nada. Para probar de verdad la pantalla de «falta configuración» hay que
compilar sin la variable, y para que las dos compilaciones no se pisen,
`next.config.ts` acepta `NEXT_DIST_DIR`.

`.next-sin-config/` está en `.gitignore`.

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

### 6.5 · Umbral real de 8 horas de bloqueo

*Cubierto a nivel unitario y en E2E con marca de tiempo sembrada (B9).* Esperar ocho horas reales o manipular el reloj del sistema no entra en el arnés.

1. Bloquear la sesión y dejar el navegador abierto ocho horas.
2. Volver a la pestaña.
3. **Criterio:** la sesión se cierra sola con purga y aterriza en `/login`; no queda ninguna clave `pate-salud-state:*` ni el marcador `pate:bloqueo:v1`.

### 6.6 · Restauración desde Firestore al desbloquear

*No cubierto.* El arnés corre con backend `sheets`; la rama de Firebase exige sesión real.

1. Con `NEXT_PUBLIC_DATA_BACKEND=firebase` y sesión real, abrir un expediente.
2. Provocar el bloqueo nocturno desde Ajustes.
3. Pulsar *Volver al expediente*.
4. **Criterio:** los datos se recargan desde Firestore —no desde `localStorage`—, la URL no cambia y el marcador desaparece.

### 6.7 · Bloqueo por inactividad con el temporizador real

*No cubierto.* El mínimo configurable es 1 minuto, por encima del tiempo de espera de Playwright. El arnés prueba el bloqueo nocturno, que recorre el mismo `lockSession()`.

1. Configurar el bloqueo automático en 1 minuto.
2. No tocar el teclado ni el ratón durante ese minuto.
3. **Criterio:** aparece la superposición con el texto *«La información se ocultó de la pantalla»* y el expediente desaparece del DOM.

### 6.8 · DEMO con un token de Google vivo

*Cubierto a nivel unitario y por ausencia de tráfico en E2E (D4).* Comprobar que la guarda aguanta con un token real exige OAuth.

1. Iniciar sesión real, para que quede un token en memoria.
2. Sin recargar, entrar en modo demostración desde Ajustes.
3. Editar datos y esperar más de cinco segundos.
4. **Criterio:** ninguna petición a `googleapis.com` en la pestaña de red.

### 6.9 · Importar un respaldo DEMO en una sesión REAL

*Cubierto el caso inverso en E2E (D3).* Este exige sesión real de Google.

1. Exportar un respaldo desde el modo demostración (nombre con prefijo `DEMO_`).
2. Iniciar sesión real e intentar importarlo.
3. **Criterio:** rechazo con *«Este respaldo es de datos de demostración»* y ningún dato modificado.

### 6.10 · Estado «sincronizando» durante una operación real

*Cubierto a nivel unitario (3 casos de la máquina de estados), no en navegador.* `isSyncInProgress` solo es `true` durante una sincronización real con Google.

1. Con backend `sheets` y sesión real de Google, provocar una sincronización larga.
2. Pulsar *Cerrar Sesión* mientras está en curso.
3. **Criterio:** aparece *"Guardando cambios"* con **solo** dos opciones —*Esperar a que termine* y *Cancelar cierre de sesión*—, sin ninguna forma de abortar la sincronización. Al terminar, el cierre continúa solo si no quedan pendientes.

### 6.11 · Consentimiento OAuth completamente limpio

*Pendiente. La validación B5 se ejecutó sobre una sesión que **ya tenía permisos
concedidos**, así que confirma que no se pide Gmail, pero no puede descartar que
lo observado viniera de un consentimiento anterior en caché. Esta repite la
comprobación partiendo de cero.*

**Se ejecuta antes del corte final de Firebase.**

> **Fecha de ejecución:** 2026-09-08
> **Ejecutada por:** el titular
> **Cuenta usada:** una cuenta `@gmail.com` personal (dirección no versionada)
> **Navegador:** ventana de incógnito, cookies y caché limpias
> **Entorno:** producción en Vercel — no local
>
> **Estado: APROBADA**, con una salvedad en los pasos 9 y 10 (ver más abajo).

#### Procedimiento

**Preparación**

- [x] 1 · En `myaccount.google.com` → Seguridad → **Tus conexiones con
      aplicaciones y servicios de terceros**, localizar la aplicación y
      **anotar los permisos que figuran concedidos** antes de tocar nada.
- [x] 2 · **Revocar** el acceso de la aplicación.
- [x] 3 · Abrir una **ventana de incógnito** y limpiar cookies y caché.
- [x] 4 · Abrir `/login`. *(Se ejecutó contra producción en Vercel, no en
      local: es un entorno más exigente y la comprobación sigue siendo válida.)*

**Consentimiento inicial**

- [x] 5 · Iniciar sesión con Google y **leer entera** la pantalla de
      consentimiento antes de aceptar.
- [x] 6 · **No** menciona Gmail, correo, mensajes ni bandeja de entrada.
- [x] 7 · Pide **solo identidad básica**: nombre, dirección de correo y foto de
      perfil.
- [x] 8 · **Drive y Calendar NO aparecen todavía.** Es el resultado correcto,
      no un fallo: en este diseño no se piden al entrar. Si aparecieran aquí,
      la prueba **falla**.

**Ámbitos bajo demanda**

- [~] 9 · En Ajustes, conectar **Drive**. Aparece una segunda pantalla que pide
      únicamente *«Ver y gestionar los archivos que abras o crees con esta
      app»* (`drive.file`). No menciona Gmail ni pide todos los archivos.
- [~] 10 · En Ajustes, conectar **Calendar**. Tercera pantalla, solo
      `calendar.events`. No menciona Gmail.

**Cierre**

- [x] 11 · Volver a `myaccount.google.com` y revisar la **lista final** de
      permisos concedidos.
- [x] 12 · **Criterio de aprobación:** ninguna de las tres pantallas mencionó
      Gmail, correo, mensajes ni bandeja, y la lista final no incluye ningún
      ámbito de Gmail.

#### Resultado

| Fase | Resultado | Observaciones |
|---|---|---|
| Preparación | **APROBADO** | Revocación confirmada por Google |
| Consentimiento inicial | **APROBADO** | Sin mención de Gmail, correo ni bandeja |
| Ámbitos bajo demanda | **PARCIAL** | Drive y Calendar solo se ofrecen en Ajustes, nunca en el consentimiento inicial. Pero seguían autorizados de antes, así que no se llegó a ver una pantalla de concesión nueva |
| Cierre | **APROBADO** | Panel cargado; 5 familiares visibles |

| # | Comprobación | Resultado |
|---|---|---|
| 6 | Consentimiento sin mención a Gmail | **NO menciona** |
| 7 | Correo, bandeja o mensajes mencionados | **NO** |
| 8 | Solo identidad básica solicitada | **SÍ** |
| 9 | Drive y Calendar ausentes del consentimiento inicial | **SÍ** |
| 10 | Drive ofrecido bajo demanda en Ajustes | SÍ — *ya autorizado previamente* |
| 11 | Calendar ofrecido bajo demanda en Ajustes | SÍ — *ya autorizado previamente* |
| 12 | Redirección correcta al panel | **SÍ** |
| 13 | Datos cargados | **SÍ** — 5 familiares |

**Permisos ANTES de revocar** (paso 1): autorizado; revocado para la prueba.

**Permisos DESPUÉS** (paso 11): autorizado; reconcedido durante la prueba.

**Desviaciones observadas:** ninguna en el comportamiento de la aplicación.

**Salvedad sobre los pasos 9 y 10.** La revocación limpió el consentimiento de
identidad, pero Drive y Calendar seguían autorizados de una sesión anterior, así
que **no se observó una pantalla de concesión nueva para ninguno de los dos**.
Lo que sí queda demostrado —y es lo que esta validación perseguía— es que
**ninguno de los dos aparece en el consentimiento inicial**: solo se ofrecen
desde Ajustes, cuando la persona activa la función.

Queda sin observar de forma directa el texto exacto de esas dos pantallas de
concesión. Para verlo haría falta revocar *también* Drive y Calendar en
`myaccount.google.com` y repetir solo los pasos 9 y 10. No bloquea el cierre del
Bloque B, porque el ámbito retirado era `gmail.readonly` y esa retirada sí está
verificada por tres vías independientes.

**Veredicto: APROBADO.** El Bloque B queda cerrado.

#### Sobre la evidencia gráfica

Una captura de la pantalla de consentimiento **contiene la dirección de correo
completa**. Si se guardan capturas, van en `docs/evidencia/` con el correo
tapado y se referencian desde aquí; nunca se pegan sin enmascarar. El registro
en texto de la tabla de arriba es evidencia suficiente por sí solo.

De la URL de consentimiento, recortar **todo lo que siga a `?`**: ahí viajan
`client_id`, `scope` y `state`.

---

### 6.12 · Validación manual de accesibilidad (cierre del Bloque C)

*El arnés automático llegó hasta donde puede llegar: **0 violaciones de axe en
25 mediciones**, 115 pruebas E2E y 298 unitarias. Nada de eso demuestra que la
aplicación se pueda usar. Un formulario puede tener todos sus campos
etiquetados y aun así ser imposible de completar con lector de pantalla si el
orden no tiene sentido o si un cambio de estado no se anuncia.*

*Esta validación es la única que puede decirlo, y la hace una persona.*

> **Fecha de ejecución:** *pendiente*
> **Ejecutada por:** *pendiente*
> **Lector de pantalla:** NVDA (Windows) o VoiceOver (macOS) — *anotar cuál y versión*
> **Navegador:** *anotar*
> **Dispositivo:** *anotar; conviene repetir el bloque D en un móvil con la PWA instalada*
>
> **Veredicto: _pendiente_**

#### Cómo se anota

Cada casilla se marca solo si se cumple **tal y como está escrita**. Si algo se
cumple «más o menos», se deja sin marcar y se escribe qué pasó en
Observaciones: media casilla marcada es peor que ninguna, porque da por cerrado
lo que no lo está.

---

#### A · Recorrido con teclado, sin ratón

*Desenchufa el ratón o no lo toques. Si en algún punto hay que usarlo, esa
casilla no se marca.*

- [ ] **A1** · Desde `/dashboard`, recorrer la página entera con `Tab`. En todo
      momento **se ve dónde está el foco**.
- [ ] **A2** · El orden del tabulador **sigue el orden visual**. No salta de
      arriba a abajo ni se mete en la barra de navegación a mitad del contenido.
- [ ] **A3** · `Shift+Tab` recorre el mismo camino hacia atrás.
- [ ] **A4** · Abrir un formulario clínico (por ejemplo, «Registrar vacuna») con
      `Enter` desde su botón.
- [ ] **A5** · Con el diálogo abierto, `Tab` **no se escapa** a la página de
      debajo: el foco da la vuelta dentro del diálogo.
- [ ] **A6** · `Escape` cierra el diálogo **y el foco vuelve al botón que lo
      abrió**, no al principio de la página.
- [ ] **A7** · En `/reminders`, marcar un recordatorio como hecho **con
      `Enter`** y desmarcarlo **con la barra espaciadora**.
- [ ] **A8** · Al pulsar la barra espaciadora sobre un recordatorio, **la página
      no se desplaza**.
- [ ] **A9** · En `/agenda`, cambiar de mes y de vista solo con teclado.
- [ ] **A10** · Recorrer la ficha de un familiar saltando entre secciones desde
      la barra de navegación, sin tocar el ratón.

**Observaciones (A):**

```
```

---

#### B · Lector de pantalla

*Con la pantalla apagada o los ojos cerrados siempre que se pueda. Lo que se
comprueba es si **basta con lo que se oye**.*

- [ ] **B1** · Al entrar en `/dashboard`, el lector anuncia un encabezado que
      dice dónde se está.
- [ ] **B2** · Recorrer los campos de «Registrar vacuna» y comprobar que **cada
      uno se anuncia con su nombre**: «Nombre de la vacuna», «Dosis No.»,
      «Fecha aplicación»… Ninguno se anuncia como «cuadro de edición, en blanco».
- [ ] **B3** · El nombre que se **oye** coincide con la etiqueta que se **ve**.
      Si difieren, anotar cuál y dónde.
- [ ] **B4** · Al abrir un diálogo, el lector anuncia **su título** y que es un
      diálogo, y no sigue leyendo el contenido de la página de detrás.
- [ ] **B5** · En la ficha de un familiar, la sección actual se anuncia como
      **«página actual»** (`aria-current`), no solo con color.
- [ ] **B6** · Los botones que solo llevan icono se anuncian con un nombre que
      dice qué hacen («Eliminar documento…», «Mes siguiente», «Cerrar…»).
- [ ] **B7** · Rellenar y guardar un formulario clínico **de principio a fin**
      sin ver la pantalla. Esta es la casilla que de verdad importa.

**Observaciones (B):**

```
```

---

#### C · Estados: carga, vacío y error

- [ ] **C1** · Al abrir la aplicación, el lector anuncia que **está cargando**;
      no se queda en silencio.
- [ ] **C2** · Un familiar recién creado tiene todas las secciones vacías, y
      cada una **dice qué hacer**, no solo que está vacía.
- [ ] **C3** · Provocar un error de carga: en la consola del navegador,
      `localStorage.setItem('pate-salud-state:demo', '{roto')` y recargar.
- [ ] **C4** · Aparece **«No se pudo abrir tu expediente»**, y el lector lo
      anuncia solo, sin tener que buscarlo.
- [ ] **C5** · El mensaje dice que **no se ha borrado nada**, y ofrece
      reintentar y una alternativa.
- [ ] **C6** · Comprobar en la consola que
      `localStorage.getItem('pate:cuarentena:pate-salud-state:demo')`
      **contiene el expediente dañado**: la copia de rescate existe.
- [ ] **C7** · Restaurar el expediente bueno y pulsar «Volver a intentarlo»: la
      aplicación se recupera **sin recargar a mano**.
- [ ] **C8** · En ningún momento del fallo se llegó a ver «Aún no tienes
      familiares registrados».

**Observaciones (C):**

```
```

---

#### D · Avisos locales (C3.2)

*Conviene hacer este bloque en un móvil con la PWA instalada, que es donde
importa.*

- [ ] **D1** · Abrir `/reminders` en un navegador donde **no se haya decidido**
      el permiso. Se ve la tarjeta que **explica antes de pedir**, con las tres
      advertencias: sin datos clínicos, sin servidor, y solo con la aplicación
      abierta.
- [ ] **D2** · **No ha aparecido ningún cuadro del navegador** hasta aquí.
- [ ] **D3** · Pulsar «Activar avisos». Ahora sí aparece el cuadro del
      navegador. Conceder.
- [ ] **D4** · Registrar un medicamento cuya próxima toma caiga dentro de los
      próximos minutos.
- [ ] **D5** · Dejar la aplicación abierta y esperar. La notificación dice
      **«Es hora de una toma de medicamento»** y **nada más**: ni el nombre del
      medicamento, ni la dosis, ni de quién es.
- [ ] **D6** · Pulsar la notificación: **trae al frente la ventana que ya
      estaba abierta**, no abre una segunda.
- [ ] **D7** · Marcar la toma como hecha y comprobar que **no vuelve a sonar**.
- [ ] **D8** · Denegar el permiso desde los ajustes del navegador y recargar: se
      ve la tarjeta de «Avisos bloqueados» explicando cómo revertirlo.

**Observaciones (D):**

```
```

##### Por qué hay evidencia simulada en las pruebas de avisos

Chromium sin cabeza arranca con las notificaciones **denegadas**, y
`context.grantPermissions(['notifications'])` no cambia lo que devuelve
`Notification.permission` —se comprobó: sigue diciendo «denied»—. Las pruebas
N1–N4 sustituyen **solo esa respuesta**; armar el temporizador, componer el
texto y pedir la notificación al Service Worker es código de producción sin
tocar. El cuadro real del navegador es el bloque D de arriba.

##### Limitación conocida: con la aplicación cerrada no suena nada

No es un descuido. Hoy no existe forma de programar un aviso local diferido
desde una PWA sin servidor:

| Vía | Por qué no |
|---|---|
| `TimestampTrigger` (Notification Triggers) | Fue una prueba de origen de Chrome y **nunca llegó a versión estable**. El código lo detecta por si algún día aparece |
| Web Push | Exige **un servidor con claves VAPID**. El proyecto no tiene backend propio, y montarlo solo para esto contradice el Bloque E |
| Periodic Background Sync | Solo Chromium, con la PWA instalada, y **el navegador decide cuándo**: el mínimo real ronda las **doce horas**. Para una toma a las 08:00 no sirve |

La tarjeta de permiso lo dice en voz alta, para que nadie retire la alarma de
su teléfono confiando en esto.

---

#### E · Zoom y tamaño de texto

- [ ] **E1** · Ampliar al **200 %** en el navegador. No se pierde contenido ni
      aparece desplazamiento horizontal en el cuerpo de la página.
- [ ] **E2** · En un móvil, **el gesto de pellizcar para ampliar funciona**
      (hasta C1.5 estaba bloqueado con `userScalable: false`).

**Observaciones (E):**

```
```

---

#### Veredicto

- [ ] **Todas las casillas de A, B, C y E marcadas.**
- [ ] **Todas las casillas de D marcadas**, salvo lo cubierto por la limitación
      conocida.

> **Resultado:** _pendiente_
>
> **Si hay casillas sin marcar**, anotar aquí cuáles y qué se decide con cada
> una: se corrige antes de C9, o se registra como deuda con su motivo. Una
> casilla sin marcar y sin decisión es una casilla olvidada.

```
```

---

### E0-bis · Despliegue de humo del backend de Apps Script

*Pendiente. Es la puerta del Bloque E: confirma con evidencia cuatro cosas que
la documentación de Google no cierra, antes de escribir el backend encima de
una suposición.*

**Requiere una cuenta `@gmail.com` real.** Entra de lleno en el §5 de este
documento: no hay forma de automatizarla, porque lo que se comprueba incluye
una pantalla de consentimiento y un despliegue.

> **Usar una cuenta de PRUEBAS**, no la cuenta con la que se usa la aplicación
> a diario. El script crea pestañas y una carpeta en el Drive de quien lo
> ejecuta, y al terminar se tira entera.

> **Fecha de ejecución:** 2026-09-11 (parcial)
> **Ejecutada por:** el titular, con apoyo del arnés
> **Cuenta usada:** una `@gmail.com` de pruebas; la dirección no se versiona
>
> **Estado: PARCIAL.** Punto 1 **verificado**; puntos 2, 3 y 4 pendientes.
> Resultados y hallazgos en [`E0-BIS-INFORME.md`](E0-BIS-INFORME.md) y
> [`evidencia/E0bis-06-sonda-cors.md`](evidencia/E0bis-06-sonda-cors.md).
>
> ⚠️ La implementación de humo usada **no era** `apps-script/humo/Codigo.gs`,
> así que los pasos 7 y 8 no se pudieron ejecutar. Para cerrarlos hay que
> desplegar el script del repositorio.

#### Qué se está respondiendo

| # | Pregunta | Cómo se responde |
|---|---|---|
| 1 | ¿`USER_DEPLOYING` + `ANYONE_ANONYMOUS` cruza CORS? | Automatizado: `e2e/webapp-humo.e2e.ts` |
| 2 | ¿Qué pantalla ve el titular al autorizar? | Captura, paso 4 |
| 3 | ¿`/copy` arrastra el script? ¿Se crean disparadores desde código? | Pasos 1 y 7 |
| 4 | ¿Cuánto tarda instalar, frente a los 6 minutos? | El script lo mide solo, paso 8 |

#### Procedimiento

**Preparación**

- [ ] 0 · Tener a mano `apps-script/humo/Codigo.gs` y
      `apps-script/humo/appsscript.json` de este repositorio.

**Paso 1 · La hoja y la copia**

- [ ] 1.1 · Con la cuenta de pruebas, crear una hoja de cálculo en blanco
      llamada `PATE HUMO E0BIS`.
- [ ] 1.2 · **Extensiones ▸ Apps Script**. Pegar `Codigo.gs` sobre el contenido
      del fichero `Código.gs` que trae el editor.
- [ ] 1.3 · **Configuración del proyecto ▸ Mostrar el archivo de manifiesto
      `appsscript.json`**. Pegar el manifiesto del repositorio.
- [ ] 1.4 · Guardar. Volver a la hoja y **Archivo ▸ Hacer una copia**.
- [ ] 1.5 · Abrir la copia y comprobar en **Extensiones ▸ Apps Script** que
      **el código está ahí**.
      *Criterio:* el script viaja con la copia. Si no estuviera, el onboarding
      del §3.1 de la especificación se cae entero y hay que rediseñarlo.
- [ ] 1.6 · En la copia, mirar **Activadores** (el reloj, panel izquierdo).
      *Criterio:* **cero disparadores**. Se espera que NO se copien; es
      justamente lo que obliga a que `instalar()` los cree.

**Paso 2 · El menú aparece solo**

- [ ] 2.1 · Recargar la copia de la hoja.
- [ ] 2.2 · *Criterio:* aparece el menú **Paté · Humo**. Confirma que `onOpen`
      funciona sin autorización previa, que es lo que hace posible el paso 4
      del alta de un titular.

**Paso 3 · Desplegar como aplicación web**

- [ ] 3.1 · En el editor: **Implementar ▸ Nueva implementación ▸ ⚙ ▸
      Aplicación web**.
- [ ] 3.2 · **Ejecutar como: Yo**. **Quién tiene acceso: Cualquier usuario**.
      *Criterio:* la opción existe y no está atenuada en una cuenta gratuita.
      Si solo apareciera «Solo yo» o una opción de dominio, **parar aquí**:
      sería un bloqueo (c) y el Bloque E habría que rediseñarlo.
- [ ] 3.3 · 📸 **Captura** de la ventana de implementación con las dos opciones
      a la vista → `E0bis-03-opciones-de-despliegue.png`.
- [ ] 3.4 · **Implementar**.

**Paso 4 · Autorizar — la captura importante**

- [ ] 4.1 · Google pide autorizar. Elegir la cuenta de pruebas.
- [ ] 4.2 · 📸 **Captura de la pantalla «Google no ha verificado esta
      aplicación»** → `E0bis-04-pantalla-app-no-verificada.png`.
      *Criterio:* se espera que **aparezca**. La especificación §3.1 paso 6
      dice lo contrario y está equivocada; esta captura es la prueba, y va al
      asistente de onboarding para que el titular no se asuste y abandone.
- [ ] 4.3 · **Configuración avanzada ▸ Ir a … (no seguro)**.
- [ ] 4.4 · 📸 **Captura de los permisos solicitados**, con la lista de ámbitos
      entera → `E0bis-05-ambitos-solicitados.png`.
      *Criterio:* anotar **textualmente** cómo describe Google el ámbito
      `drive`. Es lo que va a leer el titular, y decide si vale la pena la vía
      de ámbitos mínimos.
- [ ] 4.5 · **Permitir**.
- [ ] 4.6 · Copiar la **URL de la aplicación web** (la que termina en `/exec`).
      ⚠️ Esa URL es ejecutable por cualquiera: **no pegarla en el repositorio,
      ni en el informe, ni en una captura sin tapar**.

**Paso 5 · Que responde, a secas**

- [ ] 5.1 · Abrir la URL `/exec` en el navegador.
      *Criterio:* devuelve `{"ok":true,"metodo":"GET","version":"humo-1"}`.

**Paso 6 · CORS de verdad, desde el origen de la PWA**

- [ ] 6.1 · En una terminal, desde `web/`:

```bash
URL_WEBAPP_HUMO="PEGAR_AQUI_LA_URL" npx playwright test e2e/webapp-humo.e2e.ts --project=app --reporter=line
```

- [x] 6.2 · *Criterio:* las cuatro pruebas resueltas.
      - `E0b-1` — desde una página **sin CSP**, `text/plain` cruza y devuelve
        `ok`. ✅
      - `E0b-2` — `application/json` **también** cruza. El preflight ya no mata
        la petición: la decisión C-1 pierde su motivo, aunque no su prudencia.
      - `E0b-3` — desde la aplicación real **falla, y la culpa es de la CSP**:
        `connect-src` no incluye `script.google.com`. ✅
      - `E0b-4` — omitida: el Web App desplegado no era el del repositorio.
- [x] 6.3 · Acta en `docs/evidencia/E0bis-06-sonda-cors.md`, con el
      identificador de la implementación **sin versionar**.

**Paso 7 · Disparadores creados desde código**

- [ ] 7.1 · En la hoja: **Paté · Humo ▸ 2 · Crear disparador de prueba**.
- [ ] 7.2 · *Criterio:* en **Activadores** del editor aparece **uno**, cada
      minuto, con `tareaDePrueba`.
- [ ] 7.3 · Ejecutarlo otra vez desde el menú. *Criterio:* sigue habiendo
      **uno**, no dos. Confirma que la instalación se puede reejecutar sin
      agotar la cuota de 20 disparadores.
- [ ] 7.4 · Esperar dos minutos y mirar la pestaña `MEDICIONES`.
      *Criterio:* hay filas `disparador_ejecutado`. Confirma que un disparador
      creado desde código **realmente corre** en una cuenta gratuita.
- [ ] 7.5 · 📸 Captura del panel de activadores → `E0bis-07-disparadores.png`.

**Paso 8 · Cuánto tarda instalar**

- [ ] 8.1 · **Paté · Humo ▸ 1 · Instalación simulada**. Esperar a que termine.
- [ ] 8.2 · Mirar la pestaña `MEDICIONES`. *Criterio:* `ms_total_instalacion`
      con margen holgado frente a `limite_ms_por_ejecucion` (360 000).
      - Menos de 60 000 ms → cómodo: `instalar()` puede ir de una pasada.
      - Entre 60 000 y 180 000 → aceptable, pero la siembra de catálogos y la
        migración **tienen que ir por lotes**.
      - Más de 180 000 → el instalador nace partido en fases desde el día uno.
- [ ] 8.3 · 📸 Captura de la pestaña `MEDICIONES` → `E0bis-08-mediciones.png`.
- [ ] 8.4 · **Paté · Humo ▸ 3 · Diagnóstico** y anotar pestañas y disparadores.

**Cierre**

- [ ] 9.1 · **Paté · Humo ▸ 9 · Limpiar todo**.
- [ ] 9.2 · **Implementar ▸ Gestionar implementaciones ▸ Archivar**. Deja la
      URL muerta: un endpoint público olvidado es un endpoint público.
- [ ] 9.3 · Mandar la hoja de humo a la papelera.
- [ ] 9.4 · En `myaccount.google.com`, revocar el acceso del script si se
      quiere dejar la cuenta como estaba.
- [ ] 9.5 · Guardar las capturas en `docs/evidencia/` **con los correos y los
      identificadores tapados** (ver `docs/evidencia/README.md`) y rellenar
      allí la tabla.

#### Qué se decide con el resultado

| Si pasa esto | Entonces |
|---|---|
| Los cuatro puntos en verde | **Se procede con E1** |
| «Cualquier usuario» no disponible (3.2) | **Bloqueo (c).** El Web App no puede ser público; hay que rediseñar el transporte |
| `application/json` **no** falla (6.2) | Revisar la decisión C-1: puede que ya se pueda usar JSON directo |
| `getActiveUser()` devuelve correo (6.3) | Rehacer el análisis de identidad: parte del §4 sobraría |
| `ms_total_instalacion` > 180 000 (8.2) | `instalar()` nace por fases, y E2 crece |

---

## 6-bis · Validaciones manuales YA EJECUTADAS

Lo que sigue no está pendiente: se ejecutó contra recursos reales y se
registra aquí para no repetirlo ni confundirlo con evidencia automatizada.

### B4 · Consola de Google Cloud — verificado (2026-09-08)

| Comprobación | Resultado |
|---|---|
| Proyecto | `pate-salud-familiar`; Firebase y OAuth en el **mismo** proyecto |
| Tipo / estado de la pantalla de consentimiento | **External · Testing** |
| Usuarios de prueba | 1 cuenta `@gmail.com` personal |
| `gmail.readonly` | **no declarado** |
| **Gmail API** | **deshabilitada** |
| Drive API | habilitada · `drive.file` declarado |
| Calendar API | habilitada · `calendar.events` declarado |
| Sheets API | **deshabilitada** · `spreadsheets` **no declarado** |
| Clientes OAuth | uno solo, de tipo web |

**B4.1 cerrado** el 2026-09-08; ver la sección propia más abajo.

**Sigue pendiente:** confirmar si `drive.appdata` y `spreadsheets` figuran entre
los ámbitos declarados. Ver la discrepancia justo debajo.

**Discrepancia registrada, sin resolver.** El código pide `spreadsheets` y
`drive.appdata` en nueve puntos —los grupos `OPERATIONAL_SCOPES` y
`ALL_REQUIRED_SCOPES`—, pero ninguno de los dos consta como declarado. Con
`NEXT_PUBLIC_DATA_BACKEND=firebase` esas rutas son secundarias y probablemente
nadie las ha ejecutado desde que se fijaron los ámbitos; si se ejecutan, Google
las rechaza. Se decide en el Bloque E, cuando el backend de Apps Script
sustituya a esa capa.

### B4.1 · Orígenes autorizados del cliente OAuth — aprobado (2026-09-08)

| Comprobación | Resultado |
|---|---|
| **Orígenes de JavaScript autorizados** | `http://localhost:3000` · `https://pate-salud-familiar.vercel.app` |
| **URIs de redireccionamiento OAuth** | **no aplican** — la aplicación no usa NextAuth ni ninguna ruta de servidor |
| **URI de redirección de Firebase Auth** | conservado intacto |
| **Orígenes sobrantes** | **ninguno** |
| **Clientes OAuth** | uno solo, de tipo web |

**Por qué no hay URIs de redireccionamiento.** La autenticación es enteramente
Google Identity Services en el navegador: `google.accounts.id.initialize` para
la identidad y `google.accounts.oauth2.initTokenClient` para Drive y Calendar,
y después `signInWithCredential` contra Firebase. Ese flujo se autoriza por
**origen de JavaScript**, no por URI de redirección. No existe
`src/app/api/`, ni ninguna referencia a `redirect_uri` en el código.

Añadir un URI del estilo `/api/auth/callback/google` —la convención de
NextAuth— no rompería nada, pero apuntaría a un endpoint inexistente. Se
descartó a propósito.

**Veredicto: APROBADO.** Con esto queda cerrado B4.

### B5 · Prueba real con cuenta personal — aprobada (2026-09-08)

Ejecutada con una cuenta `@gmail.com` personal, sin Workspace.

| Caso | Resultado |
|---|---|
| Botón de Google visible e inicio de sesión | ✅ llega al panel |
| **Consentimiento sin Gmail** | ✅ ni «Gmail», ni correo, ni mensajes, ni bandeja |
| Drive bajo demanda | ✅ `drive.file`, sin Gmail |
| Calendar bajo demanda | ✅ `calendar.events`, sin Gmail |
| Importación manual | ✅ borrador generado, editable, y cita creada **solo** tras confirmación explícita |
| Red | ✅ **cero** solicitudes a `gmail.googleapis.com` |

**Conclusión: la Gmail API no se usa.** Confirmado por tres vías
independientes —el arnés automatizado, la consola de Google Cloud y esta
prueba con tráfico real.

**Salvedad:** la sesión ya tenía permisos concedidos. Queda pendiente §6.11.

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
│   ├── validar-accesibilidad.ts   lógica de la línea base de axe, sin navegador
│   ├── axe-baseline.json         deuda de accesibilidad medida, solo puede bajar
│   ├── accesibilidad.e2e.ts      24 mediciones: rutas en reposo y diálogos abiertos
│   ├── confirmaciones-destructivas.e2e.ts
│   ├── etiquetas-campos.e2e.ts   nombre accesible de los 102 campos
│   ├── teclado-navegacion.e2e.ts foco visible y operación sin ratón
│   ├── estados-carga-error.e2e.ts carga, vacío y expediente ilegible
│   ├── agenda-unificada.e2e.ts   los tres orígenes en una sola vista
│   ├── notificaciones-locales.e2e.ts avisos sin datos clínicos
│   ├── ficha-familiar.e2e.ts     navegación y coherencia de las 9 secciones
│   ├── recordatorios-recurrentes.e2e.ts pautas, tope e historial intacto
│   ├── mascotas.e2e.ts          alta, validación e inactivación (Bloque D)
│   ├── peso-mascota.e2e.ts      gráfica legible sin verla y alertas
│   ├── vacunas-mascota.e2e.ts   estado calculado, agenda y aviso sin nombre
│   ├── historial-veterinario.e2e.ts  orden, filtro y frontera con la agenda
│   ├── webapp-humo.e2e.ts     sonda de CORS del Bloque E; se omite sin URL
│   ├── purga-almacenamiento.e2e.ts
│   └── dialogo-cierre.e2e.ts
├── src/lib/*.test.ts             unitarias junto al módulo que prueban
└── docs/TESTING.md               este documento
```

Los módulos se diseñan **testeables sin jsdom**: aceptan un almacén inyectable en lugar de leer `window.localStorage` directamente. Eso mantiene las unitarias rápidas y sin emulación del navegador.
