# Acceso y autorización — Bloque E, E4

E3 responde **quién llama**: un correo que Google firmó. E4 responde la otra
mitad, **qué es dentro de este expediente**.

Son dos preguntas distintas y se resuelven con dos cosas distintas. Confundirlas
es el error clásico: un correo verificado no es un permiso.

---

## De qué titular son los datos: no se pregunta

Esa pregunta no tiene código. La responde **a qué URL se hizo el POST**.

Cada familia tiene su propio despliegue, su propia hoja y su propio Drive. No
hay un `familia_id` que filtrar mal, ni una consulta que se pueda escribir al
revés, ni un `where` que alguien olvide. El aislamiento entre familias es una
propiedad de la infraestructura de cuentas de Google, no de unas reglas que hay
que mantener correctas.

Lo único que queda por resolver es el rol, y se busca en `ACCESO` **de este
documento**.

---

## El ciclo de vida de un acceso

```
                    invitar()                aceptarInvitacion()
   (no figura) ──────────────────► INVITADO ──────────────────────► ACTIVO
                                      │                                │
                                      │ caduca a los 7 días            │ revocar()
                                      ▼                                ▼
                                  (sigue INVITADO,              REVOCADO
                                   el token ya no vale)         (la fila se queda)
```

**Nada se borra.** Revocar marca la fila, no la quita: quién tuvo acceso y hasta
cuándo es justo lo que habría que poder responder después. Es la misma decisión
que con las mascotas en D1 y con un expediente ilegible en C2.

**El token de invitación no se guarda.** En `ACCESO` va su SHA-256. Si la hoja
se filtrara, un hash no deja entrar a nadie. Al aceptar, se consume: se borra el
hash, de modo que una invitación no se puede usar dos veces.

---

## Denegación por defecto

Si el correo no figura en `ACCESO`, o su estado no es `ACTIVO`, **se deniega**.
No hay accesos implícitos.

Es lo contrario de lo que la auditoría del Bloque A encontró en las reglas de
Firestore, que concedían `true` cuando faltaba el documento: *secure by default*
del revés.

Dos detalles que parecen menores y no lo son:

**Un alcance vacío no es alcance total.** Una celda `pacientes_asignados` en
blanco significa «ninguno», no «todos». El fallo contrario sería el más caro
posible y el más silencioso: nadie lo nota hasta que alguien ve lo que no debía.

**El estado se compara con tolerancia.** `activo`, ` ACTIVO ` y `Activo` valen.
La hoja la edita una persona, y un espacio de más al pegar un valor dejaría
fuera a un familiar con un síntoma —«no entro»— que no apunta a ninguna causa
visible.

### El titular es TITULAR pase lo que pase

Aunque su fila diga `REVOCADO`, o aunque no tenga fila.

No es una excepción cómoda. Es la única forma de que no se quede fuera de su
propio expediente por una fila mal editada: sin ella, la única salida sería
arreglar la hoja a mano. Y puede editarla de todos modos — es suya, está en su
Drive.

Su correo se compara con el de `CONFIG`, que `instalar()` capturó durante la
instalación con `Session.getEffectiveUser()`.

---

## Invalidación inmediata: la versión va en la clave

Este es el mecanismo central de E4.

El problema: cachear `ACCESO` cinco minutos hace que un familiar **revocado siga
entrando cinco minutos**. Para un expediente clínico, con alguien a quien se
acaba de quitar el acceso a propósito, eso es demasiado.

La solución no es invalidar entradas —habría que saber cuáles— sino meter un
contador de versión **dentro de la propia clave**:

```
acceso:ana@example.invalid:v7     ← antes de revocar
acceso:ana@example.invalid:v8     ← después
```

`mutarAcceso` incrementa `ACCESO_VERSION` en `PropertiesService`. En ese mismo
instante, **toda entrada anterior deja de encontrarse**: nadie vuelve a
preguntar por `:v7`, y caduca sola. No hay que borrar nada ni saber a quién
afectaba el cambio.

| | |
|---|---|
| Dónde | `CacheService.getScriptCache()` |
| Duración | 300 s, o hasta que suba la versión |
| Clave | `acceso:<correo normalizado>:v<versión>` |
| Contador | `ACCESO_VERSION` en `PropertiesService` |

**La versión solo sube.** Reutilizar un número haría que una entrada vieja
volviera a encontrarse, y con ella el acceso que se acababa de revocar.

**Ausente o ilegible vale 1**, nunca 0 ni `NaN`: una versión rota no puede
convertirse en una clave que colisione con otra cosa.

**Y sube aunque la operación no cambiara nada visible.** Es más barato
invalidar de más que dejar viva una entrada que ya no corresponde.

---

## `mutarAcceso` es la única puerta de escritura

Tres cosas pasan ahí, y el orden importa:

1. **Cerrojo de script** (`LockService.getScriptLock()`, 10 s). Dos titulares no
   existen, pero sí dos pestañas del mismo titular: sin cerrojo, revocar y
   cambiar un rol a la vez leerían la misma hoja y una de las dos escrituras
   desaparecería.
2. **La escritura.**
3. **La versión sube** — después de escribir y **dentro** del cerrojo. Si
   subiera antes, una petición intermedia podría cachear el estado viejo con la
   clave nueva, que es exactamente el fallo que este mecanismo existe para
   evitar.

Escribir en `ACCESO` por cualquier otro camino deja a un revocado dentro hasta
que caduque su entrada.

### Quién puede mutar

Solo el **TITULAR**. Un cuidador que pudiera invitar acabaría invitándose a sí
mismo con más alcance, y repartir accesos a un expediente clínico pertenece a
quien lo posee.

Dos reglas más, ambas con prueba:

- **El titular no se puede revocar ni degradar a sí mismo.** Sería la única
  acción de la aplicación sin vuelta atrás desde la propia aplicación.
- **Nadie reparte el rol de TITULAR.** Hay uno, y es quien posee la hoja.

---

## El correo se normaliza a los dos lados (E6-bis)

`normalizarEmail` quita los puntos y las etiquetas `+tag` de las direcciones de
`gmail.com` y `googlemail.com`, porque Google las considera **la misma cuenta**.
No hacerlo dejaría entrar dos veces a la misma persona con dos filas distintas.

Lo que E6 hacía a medias era aplicarlo **solo a un lado**. El correo del
`id_token` llegaba normalizado; la celda de `ACCESO` se comparaba tal y como
estuviera escrita. Resultado: una fila tecleada como `juan.perez@gmail.com`
**no se encontraba nunca**, y un titular con puntos en su dirección se quedaba
fuera de su propio expediente, sin más salida que editar la hoja a mano.

Ahora se normaliza en los cuatro sitios donde se compara o se escribe:

| Dónde | Qué pasaba si faltaba |
|---|---|
| `buscarFila` | La fila del familiar no aparecía: `ACCESO_DENEGADO` permanente |
| `resolverAcceso`, contra `CONFIG.email_titular` | El dueño de la hoja no entraba en su expediente |
| `validarMutacion` | `TITULAR_INTOCABLE` se esquivaba tecleando un punto de más |
| `emailTitular_` e `instalar()` | La celda de `CONFIG` nacía sin normalizar |

**Fuera de `gmail.com` los puntos sí distinguen dos cuentas**, y eso se respeta:
en otros dominios `juan.perez` y `juanperez` son dos buzones diferentes, y
tratarlos como uno dejaría entrar a quien no es. Hay una prueba para cada lado
de esa frontera.

Se encontró leyendo el código al preparar E6-live, no ejecutándolo: la
validación en vivo pasó en verde porque ninguna de las dos cuentas usadas
llevaba puntos. Es el tipo de fallo que solo aparece con el usuario número
tres.

---

## Las columnas se leen por nombre, nunca por posición

`resolverAcceso` saca la posición de cada columna de `encabezadosDe('ACCESO')`,
no de índices escritos a mano.

Si mañana se añade una columna en medio del esquema, un `fila[4]` escrito hoy
empezaría a leer el estado desde otra celda **sin que nada fallara**: la
petición no daría error, simplemente dejaría entrar a quien no debe. Es la clase
de fallo que no aparece en ninguna traza.

---

## Verbo y alcance son dos cosas

«Puede editar citas» no significa nada sin «¿de quién?».

- **El alcance** lo resuelve `alcanza()`, aquí en E4: `*` llega a todos, una
  lista llega a los suyos, y el expediente propio siempre se alcanza.
- **El verbo** lo resuelve `puede()`, en `Permisos.gs` (E5): qué acciones admite
  cada rol, con denegación por defecto.

`puede()` los junta, y por eso recibe el acceso entero y el paciente, no un rol
suelto.

---

## Por qué el motivo del rechazo no sale

Hacia fuera siempre `ACCESO_DENEGADO`. Dentro se registra el motivo —`NO_FIGURA`,
`ESTADO_NO_ACTIVO`, `ROL_DESCONOCIDO`—, pero en el **registro de ejecuciones**,
no en `AUDITORIA`.

Decir «figuras, pero estás revocado» en vez de «no figuras» le confirma a quien
lo intenta que ese correo existe en esta familia. Y escribir en la hoja por cada
intento fallido sería regalar una forma de llenarla.

---

## Qué falta comprobar de verdad

Las 40 pruebas de `acceso.test.ts` cubren las decisiones: los cuatro roles, los
estados que no dejan pasar, los alcances, el titular indestructible, la clave
versionada y las reglas de mutación.

Lo que **no** pueden cubrir, y espera a la validación de E6:

1. Que el cerrojo de verdad serialice dos mutaciones simultáneas.
2. Que subir la versión invalide una entrada de caché real.
3. Que revocar a alguien lo deje fuera **en la siguiente petición**, no en la
   siguiente ventana de caché. Es el criterio que justifica todo este diseño.
