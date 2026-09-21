# G0 — el repositorio de verdad

**El contador de escrituras mudas: 31 → 0.**

`SheetsRepository` tenía los 31 métodos de escritura con el cuerpo vacío. Ahora
la implementación vive en `src/lib/repositorioBackend.ts`, escribe por mutación
contra el router de E y no tiene un solo cuerpo mudo.

`scripts/escrituras-mudas.json` está vacío y la prueba pasó de `≤ 31` a `= 0`:
la deuda no se puede volver a abrir apuntando una línea nueva.

---

## Cómo está repartido

| Pieza | Qué pone |
|---|---|
| `transporteBackend.ts` | la conversación: `pedir`, `aplicar`, `obtenerRevision` |
| `descriptores.ts` | qué columna es cada campo |
| `mapeoFilas.ts` | la traducción, y el colapso de lectura |
| `repositorioBackend.ts` | qué colección toca cada método, y qué se hace cuando no hay dónde |

`sheetsRepository.ts` es hoy **una línea**: un alias. El nombre sigue porque la
bandera dice `sheets`; el renombre es de G4.

---

## Las tres cosas que no eran mecánicas

### 1 · La hoja solo anexa

`anexarFilas_` **añade** filas. No modifica ninguna. Es la decisión que el
router tomó en E6 y no se descubre leyendo el contrato: se descubre leyendo
`Router.gs`.

Consecuencias, todas:

- Guardar dos veces el mismo paciente deja **dos filas**.
- Borrar deja una tercera con `borrado_en`.
- **Leer no es leer filas: es colapsarlas.**

La regla del colapso es **la última fila que habla manda, entera**. Entera, y no
«el último valor no vacío de cada columna»: con esa segunda regla, vaciar una
nota la haría reaparecer, porque el valor anterior seguiría ganando. Para quien
acaba de borrarla, eso es el dato volviendo solo.

Y «que habla» porque `PERFIL_HUMANO` tiene **dos dueños**: `members` escribe la
identidad y `healthProfiles` lo clínico. Cada descriptor solo puede ser pisado
por una fila que escriba **sus** columnas; si no, corregir un apellido borraría
las alergias.

Lo que la regla no cubre, y queda dicho: dos personas editando a la vez el
mismo registro no se mezclan — gana quien escribió después, con el registro
entero. Es lo mismo que hacía la hoja antes de todo esto, y qué avisar es cosa
de G2.

### 2 · Una mutación sin paciente se deniega, también al titular

`puede()` comprueba el alcance **antes** de mirar el rol:

```ts
if (id.length === 0) return false;
```

Así que un `pacienteId` olvidado no es un permiso de menos: es el **lote entero
rechazado**. Cada mutación lo lleva.

Con una limitación acotada: `deleteX` solo recibe un identificador, y salvo en
`members` no hay de dónde sacar el paciente sin leer la hoja primero. Se manda
el propio identificador. Al titular —alcance `*`— no le afecta; a un rol con
alcance parcial le saldrá un `PERMISO_INSUFICIENTE` en vez de un borrado a
medias. Se resuelve cuando G2 tenga la copia local.

### 3 · Leer el expediente entero cuesta una petición o cuesta once por persona

`consultar` filtra **por paciente y por pestaña**. Once pestañas por persona son
once peticiones por persona, y con el sondeo de G2 por delante eso es cuota que
se nota.

`exportar` trae el expediente completo en una sola llamada. Así que `loadAll`
pide `exportar` y **solo si el rol no llega** —`PERMISO_INSUFICIENTE`— se cae al
camino largo.

Cualquier otro fallo sube. Devolver `EMPTY_FAMILY_DATA` cuando la red falla
sería enseñar una historia clínica en blanco y dejar que alguien saque
conclusiones.

---

## Lo que se niega en voz alta

Ocho de los 31 métodos no escriben: **lanzan con su motivo**. Lanzar no cuenta
como mudo en G1, y esa es toda la diferencia — un método que lanza avisa; el que
calla pierde el dato sin dejar rastro.

| Método | Por qué |
|---|---|
| `saveTask` | `SEGUIMIENTOS` es el seguimiento de una orden, no una tarea genérica ([E10](E10-ESQUEMA-V2.md)) |
| `saveGmailSource`, `deleteGmailSource`, `saveAppointmentCandidate`, `saveSettings` | la importación desde Gmail es E11 y no está construida |
| `createFamily` | la familia **es** la hoja, y se crea copiando la plantilla |
| `acceptInvitation` | el canje necesita el token del correo; lo hace `/invitacion` |
| `saveExamResults` sin paciente | ver abajo |

---

## La única decisión que G0 devuelve: `EXAMENES_RESULTADOS`

Esa pestaña **no tiene columna de paciente**. De ahí salen dos cosas, y las dos
tienen la misma raíz:

1. **No se puede escribir** sin decir de quién es el examen, porque el router
   deniega toda mutación sin paciente. Se añadió un `memberId` opcional al
   contrato —Firestore lo ignora— y, sin él, `saveExamResults` lanza.
2. **No se puede leer.** `consultar` filtra por `paciente_id` y ahí no hay
   ninguna, así que `examResults` vuelve vacío.

Hoy nadie pasa ese `memberId`: `AppContext` no se ha tocado, que era la
condición de G0. Así que **los valores de examen no se guardarían ni se leerían
el día que gire la bandera**.

**Mi recomendación: una columna `paciente_id` en `EXAMENES_RESULTADOS`**
(esquema v4, por el final como siempre). Resuelve las dos mitades de golpe y es
una columna, no un rediseño. No la he aplicado porque supondría otra subida de
esquema justo mientras la v3 se está instalando, y eso es tuyo.

La alternativa —dejarlo así y que G2 pase el paciente al guardar— arregla la
escritura y **no arregla la lectura**.

---

## Lo que NO cambió

**La aplicación funciona exactamente igual que hoy.** La bandera sigue en
`firebase`, `AppContext` no se ha tocado y `FirebaseRepository` es quien
responde. Este código todavía no lo llama nadie.

Lo que falta para que pueda llamarlo, y es G2 y G3:

- **La identidad.** `sesionDelNavegador()` devuelve la URL que dejó E9 y un
  `id_token` **nulo**: sacarlo de Firebase Auth y ponerlo al alcance de toda la
  aplicación es G3. Hasta entonces se niega en voz alta en vez de mandar una
  cadena vacía, que acabaría en un `TOKEN_INVALIDO` lejos de su causa.
- **El sondeo** de revisión, con `revision()` ya escrito y sin usar.

---

## Las puertas

| Puerta | Resultado |
|---|---|
| `test:run` | 973/973 ✅ (894 → 973) |
| `tsc` | 0 ✅ |
| `lint:cambiados` | sin regresiones ✅ |
| Trinquete de G1 | **0 escrituras mudas**, y visto en rojo al volver a vaciar un método ✅ |

El trinquete se comprobó en los dos sentidos, como en G1: vaciando `saveVaccine`
a mano, la prueba lo nombra y falla.
