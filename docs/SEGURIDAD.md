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

## Dónde está lo demás

| Tema | Documento |
|---|---|
| Cabeceras HTTP y CSP | `next.config.ts`, con la justificación de cada origen |
| Purga de datos clínicos al cerrar sesión | `src/lib/purgaLocal.ts`, `purgaFirestore.ts` |
| Bloqueo de sesión | `src/lib/bloqueoSesion.ts` |
| Retirada de Gmail | `TRANSICION-GMAIL.md` |
| Verificación en Google Cloud | `B4-VERIFICACION-GOOGLE-CLOUD.md` |
| Política de pruebas y evidencia | `TESTING.md` |
