# Decisiones de seguridad

Registro de decisiones que afectan a la seguridad de la aplicación y que no se
deducen leyendo el código. Cada una dice qué se decidió, por qué, y qué queda
abierto.

---

## Client ID de OAuth incrustado en el historial (A9-D4)

**Decisión: el historial de Git NO se reescribe. El Client ID histórico se
conserva.**

Hasta el Bloque B, `login/page.tsx` y `AppContext.tsx` llevaban un Client ID de
OAuth como valor por defecto:

```ts
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '<un Client ID concreto>'
```

Se retiró —hoy la ausencia de la variable produce un error de configuración
visible—, pero el valor sigue en dos commits del historial.

**Por qué no se reescribe:**

- Un Client ID de OAuth es **público por diseño**. Viaja en cada petición de
  autorización y cualquiera que abra la aplicación puede leerlo en el paquete
  del navegador. No es un secreto y no hay nada que rotar.
- El daño que causaba no era la exposición, sino que ataba el binario a un
  proyecto de Google Cloud concreto y convertía una configuración ausente en un
  fallo silencioso: la aplicación intentaba autenticar contra un proyecto ajeno
  en lugar de avisar. Eso ya está corregido.
- Reescribir el historial invalida todos los hashes, rompe los clones
  existentes y obliga a un `push --force`. El coste supera con mucho al
  beneficio de borrar un identificador que de todos modos es público.

**Lo que sí protege esa decisión:** una prueba automática recorre `src/` y
falla si vuelve a aparecer un literal `apps.googleusercontent.com`, una clave
`AIzaSy`, un token `ya29.` o una clave privada en código de producción, y
también si alguien reintroduce el patrón `process.env.X || 'literal'`. Está en
`src/lib/configuracionEntorno.test.ts`.

**Lo que NO cubre:** si algún día se filtrara un secreto de verdad —un
`client_secret`, una clave de cuenta de servicio—, esta decisión no aplica. Ahí
lo correcto es **rotar la credencial**, no limpiar el historial: una vez
publicada, se considera comprometida aunque se borre.

---

## Ámbitos OAuth declarados frente a los que pide el código

**Estado: discrepancia conocida, sin resolver.**

La pantalla de consentimiento declara `drive.file` y `calendar.events`. El
código pide además `spreadsheets` y `drive.appdata` en nueve puntos, a través
de los grupos `OPERATIONAL_SCOPES` y `ALL_REQUIRED_SCOPES`.

Con `NEXT_PUBLIC_DATA_BACKEND=firebase` esas rutas son secundarias —exportar a
hoja de cálculo, configuración en la carpeta privada de Drive— y probablemente
no se han ejecutado desde que se fijaron los ámbitos. Si se ejecutan, Google
las rechaza.

Se decide en el **Bloque E**, cuando el backend de Apps Script por titular
sustituya a esa capa: puede que los ámbitos haya que declararlos, o puede que
desaparezcan del código. Detalle en `TESTING.md` §6-bis.

---

## Sin Google Workspace, en ningún punto

**Restricción del proyecto, no preferencia.** Ni el titular ni ningún familiar
puede necesitar una cuenta de organización para instalar el backend, invitar a
alguien o autenticarse. Todo funciona con cuentas `@gmail.com` gratuitas.

La pantalla de consentimiento es **External** —«Internal» es la que exige
Workspace— en estado **Testing**, que admite hasta 100 usuarios de prueba.

Verificado con recursos reales el 8 de septiembre de 2026 (`TESTING.md`
§6-bis). Si alguna decisión futura exigiera Workspace, se detiene y se consulta
antes de implementarla.

---

## Apps Script en `connect-src` (E0-bis, 2026-09-11)

La CSP ganó **dos destinos**, y son los dos primeros que se abren desde A7. No
es un ajuste menor: cada entrada de `connect-src` es un sitio al que podrían
salir datos clínicos.

```
connect-src 'self'
            https://*.googleapis.com
            https://accounts.google.com
            https://script.google.com              ← nuevo
            https://script.googleusercontent.com   ← nuevo
```

**Por qué.** En el Bloque E el backend de cada familia es un Web App de Apps
Script en el Drive de su titular. La PWA le habla por `fetch`. Sin estos
destinos, el navegador corta la conexión y la aplicación no tiene backend.

**Por qué dos y no uno.** Esto no se dedujo, se midió. `…/exec` responde con
una redirección a `script.googleusercontent.com/macros/echo`, y `connect-src`
comprueba **también el destino de la redirección**. Con solo el primer host la
petición sigue muriendo, con el mismo `TypeError: Failed to fetch`. La primera
versión de este cambio llevaba un solo host y la prueba `E0b-3` lo cazó antes
del commit.

**Dónde NO están.** Solo en `connect-src`. No en `script-src`, ni en
`frame-src`, ni en `img-src`. El Web App es un **destino de datos**, no una
fuente de código ni un marco: si `script.google.com` apareciera en `script-src`,
el Web App de cualquier titular podría ejecutar código dentro de la aplicación.
`cabecerasSeguridad.test.ts` lo comprueba directiva por directiva.

**Y no hace falta ningún otro host.** No es una suposición: `E0b-3` exige **cero
violaciones de `connect-src` en la consola** del navegador, no solo que el
`fetch` termine bien. Si el flujo necesitara un sexto destino —otro
`*.googleusercontent.com`, `gstatic.com`, lo que fuera— habría aparecido ahí
como una violación más. No apareció ninguna.

**Qué pasa si falta alguno de los dos.** El `fetch` falla con `TypeError: Failed
to fetch`, que es **el mismo error que produce un fallo de CORS**. Sin mirar la
consola, es indistinguible de un problema del lado de Google, y se pierde el
tiempo en el sitio equivocado. Si falta solo el segundo, la petición inicial
sale y muere **en la redirección**, que es todavía más confuso: el primer host
está permitido y aun así no funciona.

**Qué hace falta vigilar.** La lista de `connect-src` está cerrada por una
prueba que la compara entera —no «contiene», sino igual— para que añadir un
destino obligue a justificarlo. Hasta E0-bis había una prueba que exigía la
**ausencia** de Apps Script; se invirtió a propósito, con la medición delante
(`evidencia/E0bis-06-sonda-cors.md`), no de refilón.

**Lo que este cambio NO hace.** No autentica nada. El endpoint del titular es
público y anónimo por diseño (`ANYONE_ANONYMOUS`), y toda la autorización recae
en la verificación del `id_token` dentro de `doPost`. Abrir la CSP solo permite
que la conversación ocurra; no dice quién habla.

---

## Ámbitos del backend de Apps Script (E1)

Siete ámbitos, declarados a mano en `apps-script/plantilla/appsscript.json`.
Cada uno es un permiso que un titular concede **sobre su propia cuenta**, así
que la lista está bajo llave: `src/lib/manifiestoPlantilla.test.ts` la compara
entera —igualdad, no «contiene»— y falla si alguien añade, quita o reordena uno.

| Ámbito | Para qué se pide | Qué evita pedir |
|---|---|---|
| `spreadsheets` | Abrir la hoja del titular por identificador y leer o escribir sus pestañas | — |
| `drive.file` | Crear el árbol de carpetas y guardar los documentos que suba la aplicación | `drive`, **restringido**: ver, editar y borrar todo el Drive |
| `calendar.events` | Crear y mover los eventos de las citas | `calendar`, que además administra los calendarios |
| `script.send_mail` | Enviar el correo de invitación con `MailApp` | `https://mail.google.com/`, **restringido**: acceso total al buzón |
| `script.scriptapp` | Crear los disparadores desde el instalador | — |
| `script.external_request` | `UrlFetch`, para verificar el `id_token` contra Google | — |
| `userinfo.email` | Capturar el correo del titular durante la instalación | — |

**Ninguno es restringido.** No es casualidad: dos elecciones de diseño lo
evitan, y ambas cuestan algo de comodidad.

**Servicios avanzados en vez de los clásicos.** `DriveApp` y `CalendarApp` son
más cómodos, pero arrastran los ámbitos amplios —el primero exige `drive`
entero—. Con `Drive.Files` y `Calendar.Events` declarados en `dependencies`, y
los `oauthScopes` fijados a mano, se hace lo mismo con `drive.file`.

Lo que cuesta: **con `drive.file` el script solo ve los ficheros que él mismo
creó**. Si algún día hiciera falta leer uno que el usuario dejó por su cuenta,
la respuesta correcta será que la aplicación lo importe, no ampliar el ámbito.

**`MailApp`, no `GmailApp`.** Los dos envían correo. `GmailApp` exige el buzón
entero; `MailApp` se conforma con `script.send_mail`, que solo permite enviar.
Pedir acceso a todo el correo de alguien para mandarle una invitación a su
familia es justo el tipo de exceso que hace que una instalación se cancele en
la pantalla de permisos.

### El único que no se pudo estrechar

`spreadsheets.currentonly` parecía lo correcto para un script vinculado: da
acceso al documento que lo contiene y a ninguno más. **No sirve aquí.** En una
ejecución de Web App no hay documento activo —el script no corre desde la hoja,
sino desde una petición HTTP—, así que `getActiveSpreadsheet()` devuelve `null`.
Con ese ámbito el router no podría ni leer la hoja `ACCESO`, que es donde vive
toda la autorización. La hoja se abre por identificador, y `openById` exige el
ámbito completo.

De ahí sale una obligación para el instalador: **guardar el identificador de la
hoja en `PropertiesService`** mientras todavía hay documento activo. Es el único
momento en que se puede.

### Lo que llegará después, y lo que costará

El escaneo de correo de E11 necesitará `gmail.readonly` o el ámbito completo de
Gmail: **restringidos los dos**. No están declarados a propósito. Cuando se
añada esa función, **cada titular tendrá que volver a autorizar**, y verá una
pantalla bastante más seria. Conviene decidirla sabiendo lo que cuesta en
confianza, no descubrirlo el día del despliegue.

## Dónde está lo demás

| Tema | Documento |
|---|---|
| Cabeceras HTTP y CSP | `next.config.ts`, con la justificación de cada origen |
| Purga de datos clínicos al cerrar sesión | `src/lib/purgaLocal.ts`, `purgaFirestore.ts` |
| Bloqueo de sesión | `src/lib/bloqueoSesion.ts` |
| Retirada de Gmail | `TRANSICION-GMAIL.md` |
| Verificación en Google Cloud | `B4-VERIFICACION-GOOGLE-CLOUD.md` |
| Política de pruebas y evidencia | `TESTING.md` |
