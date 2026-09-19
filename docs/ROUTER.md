# Router — contrato de la API del backend (Bloque E, E6)

Aquí se juntan las tres piezas. Todo entra por `doPost` y pasa por la misma
cadena, en este orden y sin saltos.

---

## La cadena

```
  cuerpo JSON            →  ERROR_PAYLOAD
  E3 · verificarIdentidad →  TOKEN_INVALIDO
  E4 · resolverAcceso     →  ACCESO_DENEGADO
  E5 · puede()            →  PERMISO_INSUFICIENTE
  despachar               →  ERROR_DESPACHO · ERROR_CERROJO
```

**El orden no es negociable.** Sin identidad no hay rol, y sin rol no hay
permiso. Hay una prueba que lo comprueba paso a paso: cuando el token se
rechaza, `resolverAcceso` **no llega a llamarse**; cuando el acceso se deniega,
`puede()` tampoco; y cuando falta permiso, el manejador no se ejecuta.

Una sola puerta es una sola puerta que auditar. No hay función expuesta al
exterior que se salte un eslabón.

---

## Petición y respuesta

**Petición** — `POST`, `Content-Type: text/plain;charset=utf-8`:

```json
{ "idToken": "…", "accion": "consultar", "payload": { "pacienteId": "p_ana" } }
```

El tipo `text/plain` es costumbre prudente, no necesidad: E0-bis midió que
`application/json` también cruza. El cuerpo es JSON de todos modos.

**Respuesta** — siempre uno de los dos:

```json
{ "ok": true,  "data": { … } }
{ "ok": false, "error": "CODIGO" }
```

`despacharPeticion` **nunca lanza**. Una excepción que se escapara dejaría que
Apps Script respondiera con su propia página de error, que enseña la traza y no
le sirve de nada al cliente.

---

## Códigos de error

| Código | Cuándo | Qué hacer en la PWA |
|---|---|---|
| `ERROR_PAYLOAD` | El cuerpo no es JSON, o la petición está mal formada | Es un fallo del cliente. Revisar la llamada |
| `TOKEN_INVALIDO` | Token ausente, caducado, de otra aplicación o sin verificar | Pedir un token nuevo y reintentar **una vez** |
| `ACCESO_DENEGADO` | El correo no figura en `ACCESO`, o no está activo | Mensaje al usuario. **No reintentar** |
| `PERMISO_INSUFICIENTE` | Tiene acceso, pero su rol no admite esa acción sobre ese paciente | Mensaje al usuario. No reintentar |
| `ACCION_DESCONOCIDA` | La acción no está en el catálogo | Fallo del cliente |
| `ERROR_CERROJO` | Otra escritura estaba en curso | Reintentar con espera |
| `ERROR_DESPACHO` | El manejador falló | Reintentar una vez; si persiste, es un fallo real |

**Nunca sale el motivo concreto.** `TOKEN_INVALIDO` no dice si el token caducó
o si la audiencia era otra; `ACCESO_DENEGADO` no dice si el correo no figura o
si está revocado. Decirlo le confirma a quien lo intenta que ese correo existe
en esta familia, o qué corregir en el siguiente intento. El detalle queda en el
registro de ejecuciones.

---

## `ping` es la única acción anónima

Responde sin token. Es una excepción deliberada, y está medida:

- La PWA necesita comprobar la URL que el titular acaba de pegar **antes** de
  registrarla, y en ese momento todavía no hay sesión contra ese backend.
- La sonda de E0-bis sigue sirviendo como prueba de vida del despliegue.

**No cuenta nada.** Devuelve la versión del contrato y la del esquema, y nada
más: ni el correo del titular, ni el identificador de la hoja, ni la revisión.
El endpoint es público y cualquiera puede llamarlo.

> **Esto se corrigió en E6.** La versión de E1 devolvía `usuarioActivo` y
> `usuarioEfectivo` para comprobar el comportamiento de `Session`, lo que
> significaba **regalarle el correo del titular a cualquier desconocido**. La
> prueba `E0b-4` del arnés ahora exige lo contrario: que la respuesta anónima no
> contenga ninguna dirección de correo ni ningún identificador largo.

Hay una prueba que comprueba que `ping` es la **única** anónima, y otra que
recorre todas las demás confirmando que sin token devuelven `TOKEN_INVALIDO`.
Si una acción con verbo pudiera saltarse la identidad, el muro entero sería
decorativo.

---

## El catálogo de acciones

| Acción | Verbo que exige | Paciente | Muta |
|---|---|---|---|
| `ping` | — *(anónima)* | — | — |
| `obtenerRevision` | `LISTAR_PACIENTES` | — | — |
| `listarPacientes` | `LISTAR_PACIENTES` | — | — |
| `verCatalogos` | `VER_CATALOGOS` | — | — |
| `consultar` | `LEER_HISTORIA` | `payload.pacienteId` | — |
| `aplicar` | `LISTAR_PACIENTES` + uno por mutación | por mutación | ✅ |
| `invitar` · `cambiarRol` · `revocar` | `ADMINISTRAR_ACCESOS` | — | ✅ |
| `verAuditoria` | `VER_AUDITORIA` | — | — |
| `exportar` | `EXPORTAR_EXPEDIENTE` | — | — |

Una acción que no esté aquí devuelve `ACCION_DESCONOCIDA`. Igual que con los
verbos en E5: lo que no está escrito no existe.

`listarPacientes` **filtra por alcance**. Devolver la lista completa ya diría
quién existe en esta familia, aunque no se devolvieran sus datos.

---

## El protocolo de `aplicar`

Cinco pasos, y el orden es lo que lo hace transaccional:

1. **Validar el lote entero** con `puede()`, antes de tocar nada.
2. Tomar el cerrojo de script (15 s).
3. Escribir, **agrupando por pestaña**: un solo `setValues` por tabla.
4. Subir la revisión **una vez por lote**.
5. Dejar traza anonimizada en `AUDITORIA`.

### Por qué se valida todo antes

Escribir tres mutaciones y descubrir en la cuarta que falta permiso deja el
expediente **a medias**, y un expediente a medias es peor que uno sin cambiar:
nadie sabe qué entró y qué no. La validación devuelve además el **índice** de la
mutación que falló, para que el cliente pueda decir cuál.

### Lo que esto NO garantiza

Apps Script no tiene transacciones sobre una hoja. Si el paso 3 falla a mitad
—por cuota, por tiempo de ejecución—, quedan filas escritas y otras no.

Lo que sí garantiza es que **nunca se escribe nada sin haber autorizado todo**,
que es el fallo que importa: el otro deja datos incompletos, este dejaría datos
que alguien no tenía derecho a poner.

### Un solo `setValues` por pestaña

Una llamada por fila es el camino más corto a los 6 minutos de límite. Las
mutaciones se agrupan por tabla y cada grupo se escribe de una vez.

Los valores se colocan **por nombre de columna**, nunca por el orden en que
vinieran en el objeto: un cliente que mandara las claves en otro orden
desplazaría las columnas sin que nada fallara.

### Qué pestañas NO se pueden escribir por `aplicar`

`ACCESO`, `AUDITORIA` y `CONFIG`.

`ACCESO` se muta solo por `mutarAcceso`, que lleva su cerrojo y **sube la
versión de caché**; dejar que el cliente escribiera ahí sería regalar la llave.
`AUDITORIA` solo se añade desde dentro — una auditoría que el auditado puede
editar no es una auditoría. Y `CONFIG` fija la identidad de la familia.

---

## La revisión del documento

`REVISION_DOCUMENTO`, en `PropertiesService`. Sube **una vez por lote**, no una
por fila: sirve para que un cliente sepa si su copia se quedó vieja, y un lote
es un solo cambio visto desde fuera.

`obtenerRevision` la devuelve sin leer la hoja, así que es barata de consultar
a menudo.

---

## La traza de auditoría

Deja **qué se tocó y cuántas filas**, nunca el contenido:

```
CITAS:2 VACUNAS:1
```

Ni los identificadores de paciente. Una auditoría que copia los datos que
audita duplica el problema que intenta vigilar.

---

## Qué falta comprobar contra Google

Las 35 pruebas de `router.test.ts` cubren la cadena con dobles: el orden de los
eslabones, cada corte, la validación del lote, la traducción de errores. Lo que
esperan a una validación real:

1. Que `UrlFetchApp` alcance `tokeninfo` desde el Web App (heredado de E3).
2. Que un token real emitido por la PWA pase las tres validaciones.
3. Que el cerrojo serialice dos `aplicar` simultáneos (heredado de E4).
4. **Que revocar deje a alguien fuera en la siguiente petición**, no en la
   siguiente ventana de caché. Es el criterio que justifica el diseño de E4.
5. Que un lote de varias pestañas escriba en una pasada y suba la revisión una
   sola vez.
