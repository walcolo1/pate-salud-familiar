# E10 — el esquema crece para que no se pierda nada al mudarse

**Estado: v2 VALIDADO EN VIVO el 21 de septiembre de 2026. v3 (E10-bis) escrito,
sin aplicar todavía.**

Queda aplicarlo a la plantilla maestra y repetir `instalar()` en la hoja de
pruebas, que sigue en v2.

G0 se paró al descubrir que el esquema de la hoja y el modelo de la aplicación
no son el mismo modelo ([G0-BRECHA-DE-MODELO.md](G0-BRECHA-DE-MODELO.md)).
Mapear sin decidir habría tirado campos que hoy un usuario ve, de uno en uno y
sin avisar.

E10 es la parte de esa decisión que toca el Bloque E, y por eso va como paso
propio y no escondida dentro de G.

---

## Qué se añadió

**23 columnas en 6 pestañas.** La estimación era «unas 18»; al bajar al detalle
salieron 23.

| Pestaña | Columnas nuevas |
|---|---|
| `ORDENES` | `descripcion`, `autorizacion_numero`, `autorizacion_fecha`, `autorizacion_vence_en`, `eps_o_proveedor`, `ips_o_clinica`, `documento_id`, `cita_relacionada_id` |
| `MEDICAMENTOS` | `cantidad`, `cantidad_unidad`, `duracion_dias`, `indicaciones`, `documento_id` |
| `PERFIL_HUMANO` | `medicamentos_actuales`, `medico_cabecera`, `seguro` |
| `CITAS` | `documentos_ids`, `completada_en`, `politica_recordatorio` |
| `DOCUMENTOS` | `tamano_bytes`, `archivo_drive_url`, `categoria_clinica` |
| `PACIENTES` | `foto_url` |

`CONFIG.version_esquema` pasa de **1 a 2**.

**Sin columnas opacas.** Ninguna guarda JSON: cada dato tiene su columna con su
nombre, y la hoja se sigue leyendo a simple vista. Era la condición.

---

## Solo se puede crecer por el final

Las 23 van **al final de su pestaña, detrás incluso de las tres columnas de
cierre** (`creado_en`, `actualizado_en`, `borrado_en`).

No es estética, y conviene entender por qué antes de mover una:

> En una hoja ya instalada, cada dato ocupa la posición que tenía el día que se
> escribió. Meter una columna en medio desplazaría **todas las de su derecha**:
> la fecha de nacimiento de alguien pasaría a leerse como su tipo de sangre.
> Sin error, sin aviso, en todas las filas a la vez.

Añadir por el final es la única operación que una hoja vieja sobrevive.

`scripts/esquema-v1.json` congela los encabezados de la versión 1, y una prueba
exige que los de cada versión posterior **empiecen exactamente igual**. Si
alguien reordena o quita una columna, se pone roja antes de que llegue a
ninguna hoja.

### Una convención que hubo que romper

Hasta ahora una prueba exigía que las tres columnas de cierre fueran las
**últimas** de cada tabla. Era buena costumbre y ya no puede ser: lo nuevo tiene
que ir detrás de ellas.

La prueba ahora exige que estén **juntas y en orden**, donde sea. Entre una
convención de lectura y no desplazar los datos de nadie, gana lo segundo — pero
se pierde algo, y queda dicho.

---

## Instalar ya no basta con crear lo que falta

`instalar()` solo creaba las pestañas **ausentes**. Una hoja instalada con v1
conservaba su fila 1 para siempre: los datos se seguirían leyendo y escribiendo
bien —la posición la fija el esquema, no la hoja— pero **las etiquetas
mentirían**, y el titular vería columnas sin nombre al final de su expediente.

Ahora hay un paso más, idempotente como el resto:

- Si el esquema **extiende por el final** lo que hay, se reescribe la fila 1 y
  se anota qué columnas son nuevas.
- Si los encabezados **divergen** en cualquier posición, **no se toca nada** y
  queda avisado en el registro. Eso no es una hoja vieja: es una hoja que
  alguien editó a mano, y reescribir su fila 1 renombraría columnas con datos
  dentro sin moverlos.

La decisión vive en `planInstalacion.ts` con sus pruebas; `Instalador.gs` solo
escribe. El reparto de siempre.

---

## Qué hay que hacer con las hojas que ya existen

### La plantilla maestra

Es la más fácil, y por una razón que se decidió en E8: **nunca se instaló**. No
tiene ninguna de las 21 pestañas, así que no hay encabezados que reparar.

1. `node scripts/consolidar-gs.mjs`
2. Pegar `apps-script/dist/Pate.gs` como único `.gs`.
3. Guardar. **No ejecutar nada**, como siempre.

Cada copia nueva nacerá con el esquema v2.

### La hoja de pruebas

Esa sí está instalada, con v1.

1. Pegar el consolidado nuevo.
2. **Administrar implementaciones ▸ ✏️ ▸ Versión: Nueva versión.**
3. Ejecutar `instalar()` desde el menú Paté.

El resumen dirá cuántas pestañas se repararon. Compruébalo mirando la fila 1 de
`ORDENES`: tiene que terminar en `cita_relacionada_id`.

Y en `CONFIG`, `version_esquema` tiene que decir **2**.

---

## La comprobación en vivo

La reparación de encabezados **no se ha ejercitado nunca contra Google**. Es lo
único de E10 que sigue probado solo en frío, y es justo la parte que toca una
hoja con datos dentro.

Sobre la hoja de pruebas, después de pegar el consolidado y publicar versión
nueva:

| # | Qué | Resultado |
|---|---|---|
| 1-2 | `instalar()` sobre la hoja de pruebas | ✅ las **6 pestañas reparadas**, sin error |
| 3 | La fila 1 de `ORDENES` | ✅ termina en `cita_relacionada_id` |
| 4 | `CONFIG.version_esquema` | ✅ **2** |
| 5 | Las filas de datos que ya existían | ✅ **cada valor bajo su encabezado original. Ninguno se desplazó** |
| 6 | Reejecutar `instalar()` | ✅ nada que reparar dos veces |
| — | Una hoja **editada a mano** no se toca | ⬜ **sin probar en vivo** · cubierto en frío |

El paso 5 era el que importaba. Los otros confirman que el cambio ocurrió; ese
confirma que **no rompió nada**, que es lo que había que demostrar antes de
tocar la plantilla maestra.

Queda sin ejercitar contra Google el caso de la hoja editada a mano. Su
cobertura en frío es real —hay una prueba que lo fija— pero nadie ha visto al
instalador negarse de verdad.

### La prueba que de verdad da miedo, y cómo hacerla sin riesgo

Que una hoja **editada a mano** no se toque.

En una **copia** de la hoja de pruebas —nunca en la original—: renombra a mano
cualquier encabezado de `PACIENTES`, por ejemplo `nombre` → `NOMBRE_MIO`, y
ejecuta `instalar()`.

Tiene que **dejarlo como está** y escribir en el registro de ejecuciones algo
como:

```
encabezados de PACIENTES editados a mano en la columna 3:
se esperaba «nombre» y hay «NOMBRE_MIO». No se toca.
```

Si en vez de eso lo reescribe, la lógica está mal y arreglarlo es urgente:
significaría que renombra columnas con datos dentro sin moverlos.

Tira la copia al terminar.

---

## E10-bis · las 10 que faltaban

El barrido de los descriptores de G0 —campo por campo, sobre los 14 modelos—
dejó **14 campos sin casa**. De ellos, 10 se resolvieron con columna y 4 con
una decisión.

| Pestaña | Columnas | Por qué |
|---|---|---|
| `EXAMENES` | `solicitado_por`, `solicitada_en`, `documentos_ids` | quién pidió el examen y cuándo, y los documentos que lo acompañan |
| `CONTROLES` | `proxima_fecha`, `profesional` | `periodicidad_meses` no es lo mismo que la próxima fecha concreta |
| `PERFIL_HUMANO` | `email` | el correo de `ACCESO` es el de quien **tiene acceso**; un familiar sin portal se quedaba sin el suyo |
| `RECORDATORIOS` | `descripcion` | había título y no cuerpo |
| `MEDICAMENTOS` · `DOSIS` | `evento_calendario_id` | `CITAS` ya lo tenía; sin esto la sincronización con Calendar nacería coja |
| `ORDENES` | `autorizacion_estado` | **son dos cosas**: `estado` es el ciclo clínico de la orden y esto el trámite con la EPS. Una orden autorizada puede seguir pendiente de cita |

`version_esquema` pasa a **3**.

Los otros cuatro campos se descartaron a conciencia:

- `vaccines.status` — se **calcula**, no se guarda. Es la decisión de D3, y
  vale igual aquí: un estado guardado que nadie refresca miente en cuanto pasa
  la medianoche.
- `doseReminders.dose` y `medicationName` — copias de la pauta. Guardarlas dos
  veces garantiza que algún día digan cosas distintas.
- `tasks` entero — ver abajo.

### La pérdida que hay que tener presente: las tareas genéricas

`SEGUIMIENTOS` habla de seguimientos **de una orden**: `orden_id`, `plantilla`,
`destinatario`, `enviado_en`. `FollowUpTask` es una tarea con título,
descripción y prioridad. No le faltan tres columnas a una para ser la otra:
**son conceptos distintos**, y meter uno en el otro dejaría una pestaña que no
significa lo que dice su nombre.

Así que `tasks` no tiene dónde escribir. `saveTask` lanzará un error explícito
—lanzar no cuenta como mudo en G1, así que el hueco queda visible— y **las
tareas genéricas dejarán de guardarse cuando gire la bandera de G**.

Eso es pérdida de funcionalidad, no solo de columnas, y está decidido a
sabiendas. Si algún día se recuperan, será con su propia pestaña.

### El trinquete ahora vigila todas las versiones

Hay `scripts/esquema-v1.json` y `scripts/esquema-v2.json`, y la prueba exige que
los encabezados de **cada versión congelada** sean prefijo de los actuales.

Comprobar solo contra v1 dejaría fuera justo a las hojas que existen: la de
pruebas está en v2.

---

## v4 · la columna que faltaba en `EXAMENES_RESULTADOS`

Era la única pestaña de datos que colgaba de **otra fila** y no de un paciente,
y G0 se topó con las dos consecuencias, que tienen la misma raíz:

- **No se podía escribir.** `puede()` comprueba el alcance antes de mirar el
  rol, así que una mutación sin paciente se deniega **también al titular**.
- **No se podía leer.** `consultar` filtra por `paciente_id`, y ahí no había
  ninguna.

`paciente_id` va al final, como todo, y `version_esquema` pasa a **4**. Con
ella, la prueba de descriptores dejó de tener excepción: **cada fila de cada
pestaña dice a qué paciente pertenece**, sin salvedades.

`scripts/esquema-v3.json` quedó congelado antes de tocar nada. El trinquete
comprueba v1, v2 y v3 contra los encabezados de hoy.

### Qué hacer con las hojas

Igual que en v3: pegar el consolidado, **publicar versión nueva** y ejecutar
`instalar()`. La única pestaña que se reparará es `EXAMENES_RESULTADOS`, y su
fila 1 tiene que terminar en `paciente_id`.

---

## Lo que E10 NO hace

**No migra datos**, porque no hay nada que migrar: las columnas nuevas nacen
vacías y las viejas no se mueven.

**No implementa la migración entre versiones de esquema.** `version_esquema`
ahora sirve para *saber* en qué versión está una hoja; nadie actúa todavía en
consecuencia. Mientras el cambio sea «añadir columnas al final», reparar
encabezados basta. El día que haga falta transformar datos —partir una columna,
cambiar un formato— hará falta una migración de verdad, y eso es otro paso.

**No toca el router ni los permisos.** Las columnas nuevas entran por
`aplicar()` como cualquier otra, porque los valores se colocan por nombre de
columna y no por posición.

---

## Y ahora sí, G0

Con esto, las tres clases de la brecha quedan resueltas:

| Clase | Qué se hizo |
|---|---|
| Andamiaje de Firestore (22 campos) | Se descartan. El diseño de E los reemplaza con algo mejor |
| Estado de funciones apagadas | Se descartan. Se apagan a conciencia, no por descuido |
| Datos reales sin columna | **Tienen columna** |
| Las 4 escrituras de E11 | Siguen sin pestaña. Lanzarán un error explícito, que en G1 no cuenta como mudo |

El mapeo de G0 puede empezar sobre base firme.
