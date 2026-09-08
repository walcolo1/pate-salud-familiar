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

## Dónde está lo demás

| Tema | Documento |
|---|---|
| Cabeceras HTTP y CSP | `next.config.ts`, con la justificación de cada origen |
| Purga de datos clínicos al cerrar sesión | `src/lib/purgaLocal.ts`, `purgaFirestore.ts` |
| Bloqueo de sesión | `src/lib/bloqueoSesion.ts` |
| Retirada de Gmail | `TRANSICION-GMAIL.md` |
| Verificación en Google Cloud | `B4-VERIFICACION-GOOGLE-CLOUD.md` |
| Política de pruebas y evidencia | `TESTING.md` |
