# Plantilla del backend — Bloque E

El expediente de una familia **es** esta hoja. El script vive dentro de ella, no
al lado: eso es lo que hace que `Archivo ▸ Hacer una copia` se lo lleve a la
cuenta del titular, y todo el alta del §3.1 depende de ello.

E1 entregó la estructura y E2 el instalador. El resto de la lógica llega en
E3–E6; esos ficheros traen su contrato escrito y lanzan `NO_IMPLEMENTADO` con
el paso que los cierra.

---

## Los ámbitos, uno por uno

Siete, declarados a mano en `appsscript.json` y comparados uno a uno por
`src/lib/manifiestoPlantilla.test.ts`: la lista se compara **entera**, así que
añadir un ámbito obliga a tocar la prueba y justificarlo.

**Ninguno es un ámbito restringido**, y eso no es casualidad: dos de las
elecciones de abajo evitan uno.

| Ámbito | Para qué | Qué evita |
|---|---|---|
| `spreadsheets` | Leer y escribir la hoja del titular, abierta por identificador | Nada. Es el único amplio, y abajo está el porqué |
| `drive.file` | Crear el árbol de carpetas y guardar documentos. Solo alcanza a lo que el propio script creó | `drive` —**restringido**—, que ve, edita y borra todo el Drive |
| `calendar.events` | Crear y mover los eventos de las citas | `calendar`, que además gestiona los calendarios enteros |
| `script.send_mail` | Enviar el correo de invitación con `MailApp` | `https://mail.google.com/` —**restringido**—, que exigiría `GmailApp` y daría acceso total al buzón |
| `script.scriptapp` | Crear los disparadores desde `instalar()` | — |
| `script.external_request` | `UrlFetch`, para verificar el `id_token` contra Google | — |
| `userinfo.email` | Capturar el correo del titular durante la instalación | — |

### Tres decisiones que hay detrás de esa tabla

**Servicios avanzados en vez de los clásicos.** `DriveApp` y `CalendarApp` son
más cómodos de escribir, pero arrastran los ámbitos amplios: el primero exige
`drive` entero, que es restringido. Con los servicios avanzados —`Drive.Files`,
`Calendar.Events`, declarados en `dependencies`— y los `oauthScopes` fijados a
mano, se consigue lo mismo con `drive.file` y `calendar.events`.

El precio de `drive.file` hay que conocerlo: **el script solo ve los ficheros
que él mismo creó**. Para el árbol de carpetas y los documentos que suba la
aplicación, sobra. Si algún día hiciera falta leer un fichero que el usuario
dejó por su cuenta, no se podrá — y la respuesta correcta será que la aplicación
lo importe, no ampliar el ámbito.

**El ámbito de hojas no se pudo estrechar, y conviene saber por qué.**
`spreadsheets.currentonly` parecía lo correcto para un script vinculado: da
acceso al documento que lo contiene y a ninguno más. **No sirve aquí.** En una
ejecución de Web App no hay documento activo —el script no corre desde la hoja,
corre desde una petición HTTP—, así que `getActiveSpreadsheet()` devuelve
`null` y el router no podría ni leer `ACCESO`. La hoja hay que abrirla por
identificador, y `openById` exige el ámbito completo.

Consecuencia de diseño, no solo de permisos: **`instalar()` tiene que guardar el
identificador de la hoja** en `PropertiesService` mientras todavía hay documento
activo. Si no lo hace, el Web App no sabrá a qué hoja hablar.

La hoja tampoco se alcanza por Drive: la copió el titular, no la creó el script,
así que `drive.file` no la ve. No importa, porque no se usa esa vía.

**`openid email profile` no van aquí.** Son ámbitos del cliente OAuth de la
**PWA**, que es quien firma al usuario y obtiene el `id_token`. Dentro del
script no hacen nada: lo que hace falta para saber el correo del titular es
`userinfo.email`. Son dos consentimientos distintos, de dos aplicaciones
distintas, y confundirlos deja el manifiesto pidiendo permisos que no usa y sin
el que sí necesita.

### Lo que todavía no está, y por qué importa

El escaneo de correo de E11 necesitará `gmail.readonly` o el ámbito completo de
Gmail —**restringido** en ambos casos—. No está declarado aquí a propósito.
Cuando se añada, **cada titular tendrá que volver a autorizar**, y la pantalla
que verá será bastante más seria que la de hoy. Conviene decidir esa función
sabiendo lo que cuesta en confianza, no descubrirlo al desplegarla.

---

## Los ficheros

| Fichero | Qué es | Se implementa en |
|---|---|---|
| `appsscript.json` | Manifiesto: ámbitos, servicios avanzados y `webapp` | E1 ✅ |
| `Esquema.gs` | **Generado.** Las 21 pestañas y sus encabezados | E1 ✅ |
| `Instalacion.gs` | **Generado.** Las decisiones del instalador y las semillas | E2 ✅ |
| `Instalador.gs` | `onOpen`, `instalar()` idempotente, disparadores y auditoría | E2 ✅ |
| `Router.gs` | `doPost` único. Hoy responde lo mínimo para ser sondeable | E6 |
| `Auth.gs` | `verificarIdentidad` y `normalizarEmail` | E3 |
| `Acceso.gs` | `resolverAcceso` y `mutarAcceso`, con versión de caché | E4 |
| `Permisos.gs` | Matriz de roles y `puede()`, con denegación por defecto | E5 |
| `Invitaciones.gs` | Invitar, aceptar, cambiar rol y revocar | E5 |

**Los dos ficheros marcados «Generado» no se editan a mano.** Salen de
`src/lib/esquemaHoja.ts` y `src/lib/planInstalacion.ts`, que es donde viven las
pruebas:

```bash
node scripts/generar-gs.mjs
```

Una prueba comprueba que no se han quedado atrás. Si alguien toca un `.gs`
directamente, la siguiente ejecución del generador lo pisa sin avisar.

Ese reparto es lo que hace que el instalador sea probable: las **decisiones**
—qué pestañas faltan, qué disparadores borrar— están en TypeScript y tienen 29
pruebas; `Instalador.gs` se queda con las llamadas a Google, que solo una
ejecución real puede comprobar.

---

## Cómo se arma la plantilla

El orden importa: **la hoja primero, el script después**. Un proyecto autónomo
al que se le asocia una hoja no viaja con `/copy`, y ahí se cae el onboarding.

1. Hoja de cálculo nueva → nombrarla `Paté · Salud Familiar — PLANTILLA`.
2. **Extensiones ▸ Apps Script**. El proyecto nace vinculado.
3. **Configuración del proyecto ▸ Mostrar el archivo de manifiesto**, y pegar
   `appsscript.json`.
4. Un fichero por cada `.gs` de este directorio, con el mismo nombre.
5. Guardar, recargar la hoja y comprobar que aparece el menú **Paté**.

La plantilla no se despliega ni se instala: es el molde. Quien despliega es cada
titular, sobre su copia.

---

## Lo que sigue sin comprobarse

Que `/copy` arrastre el script vinculado **sigue sin verificarse**, y es la
suposición de la que cuelga todo este diseño. Eso, el tiempo real de
`instalar()` y ver un disparador ejecutarse son los criterios de aceptación de
E2, con su guion en [`../../docs/EVIDENCIA_E2.md`](../../docs/EVIDENCIA_E2.md).

El código está escrito y probado en frío. Un plan probado no es una ejecución
probada.
