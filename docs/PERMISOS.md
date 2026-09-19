# Permisos — Bloque E, E5

Tres preguntas, tres pasos, y las tres hacen falta:

| | Pregunta | Dónde | Con qué |
|---|---|---|---|
| E3 | ¿Quién llama? | `Auth.gs` | Un `id_token` que Google firmó |
| E4 | ¿Qué es en esta familia? | `Acceso.gs` | Una fila de `ACCESO` |
| **E5** | **¿Puede hacer esto sobre este paciente?** | `Permisos.gs` | Esta matriz |

Un correo verificado no es un rol, y un rol no es un permiso.

---

## Denegación estricta

Todo lo que no esté escrito devuelve `false`. Sin comodines, sin herencia entre
roles, sin «si no está prohibido, se permite».

Una acción nueva nace **denegada para todos, incluido el titular**, hasta que
alguien la añada al catálogo a propósito. Es lo contrario de la regla de
Firestore que la auditoría del Bloque A encontró concediendo `true` cuando
faltaba el documento.

---

## La matriz

El **TITULAR no aparece**: tiene todos los verbos del catálogo por construcción.
Mantener su fila al día sería una forma de olvidarse de actualizarla.

| Verbo | CUIDADOR | MIEMBRO | LECTOR |
|---|:---:|:---:|:---:|
| **Familia** | | | |
| `LISTAR_PACIENTES` | ✅ | ✅ | ✅ |
| `VER_CATALOGOS` | ✅ | ✅ | ✅ |
| `EDITAR_CATALOGOS` | — | — | — |
| `CREAR_PACIENTE` | — | — | — |
| `ADMINISTRAR_ACCESOS` | — | — | — |
| `VER_AUDITORIA` | — | — | — |
| `EXPORTAR_EXPEDIENTE` | — | — | — |
| **Paciente** | | | |
| `LEER_HISTORIA` | ✅ | ✅ | ✅ |
| `LEER_DOCUMENTO` | ✅ | ✅ | ✅ |
| `ESCRIBIR_CITA` | ✅ | ✅ | — |
| `ESCRIBIR_VACUNA` | ✅ | ✅ | — |
| `ESCRIBIR_CONTROL` | ✅ | ✅ | — |
| `SUBIR_DOCUMENTO` | ✅ | ✅ | — |
| `MARCAR_DOSIS` | ✅ | ✅ | — |
| `ESCRIBIR_HISTORIAL_VET` | ✅ | ✅ | — |
| `ESCRIBIR_MEDICACION` | ✅ | — | — |
| `ESCRIBIR_ORDEN` | ✅ | — | — |
| `EDITAR_PACIENTE` | ✅ | — | — |
| `DAR_DE_BAJA_PACIENTE` | — | — | — |

Las siete filas con `—` en las tres columnas son de **solo titular**.

### Por qué cada rol es lo que es

**CUIDADOR** cuida de otros: todo lo clínico sobre los pacientes que tenga
asignados, y nada que reparta accesos ni toque la configuración de la familia.

**MIEMBRO** gestiona lo suyo. Lo mismo que un cuidador salvo **recetar**, editar
la identidad de un paciente y darlo de baja. Cambiar una pauta de medicación es
una decisión que conviene que pase por alguien que cuida, no por el propio
paciente a solas. Sí puede `MARCAR_DOSIS`: tomarse su medicación y apuntarlo es
otra cosa.

**LECTOR** solo mira. Ni un verbo de escritura, **ni siquiera sobre su propio
expediente**. Es el rol para quien tiene que poder consultar —un familiar
lejano, alguien que acompaña a una cita— sin cambiar nada.

**La matriz se escribe entera, sin herencia.** Decir «CUIDADOR es MIEMBRO más
estas tres» ahorra ocho líneas y esconde lo único que importa: qué puede hacer
cada uno. Hay una prueba que comprueba que el reparto sigue teniendo sentido —
nada que pueda un LECTOR le falta a un CUIDADOR— pero eso es una comprobación,
no un mecanismo.

---

## Verbo y alcance se cruzan, no se suman

«Puede editar citas» no significa nada sin «¿de quién?».

```
puede()  =  el rol tiene el verbo        (esta matriz)
         ∧  el paciente está en su alcance (alcanza(), E4)
```

Un CUIDADOR con `ESCRIBIR_CITA` y alcance sobre `p_ana` **no** puede escribir
una cita de `p_juan`. Tiene el verbo y le falta el alcance, y para autorizar
hacen falta los dos.

Al revés también: estar en el alcance no da verbos. Un LECTOR sobre `p_ana`
puede leerla y nada más.

### Un verbo por paciente sin paciente se deniega

Incluso al titular. Es una llamada mal hecha, y ante una llamada mal hecha se
deniega en vez de adivinar a quién se refería.

---

## Aislamiento por especie

Casi todos los verbos valen para las dos: una cita, un documento o una vacuna
son lo mismo en una persona y en un animal, y por eso el modelo **no los
duplica** — una mascota es una fila más en `PACIENTES`.

Solo dos distinguen:

| Verbo | Especie | Por qué |
|---|---|---|
| `ESCRIBIR_HISTORIAL_VET` | MASCOTA | El historial veterinario de D4 |
| `ESCRIBIR_ORDEN` | HUMANO | Una autorización de EPS sobre un perro no significa nada |

**No saber la especie no es permiso.** Si el verbo la exige y no se pasa,
`puede()` deniega. Un historial veterinario sobre alguien de quien no se sabe si
es un animal se queda sin escribir.

### La regla del enunciado ya se cumplía antes de esto

«Un LECTOR o CUIDADOR con alcance a una mascota no adquiere permisos sobre
miembros humanos» se cumple **por el alcance**, no por la especie: el
identificador del humano sencillamente no está en su lista, así que `alcanza()`
devuelve `false` antes de que la especie llegue a mirarse.

El mecanismo de especie resuelve un problema distinto y real: que un verbo que
solo tiene sentido en una especie no se pueda ejercer sobre la otra, aunque
quien lo intente tenga alcance sobre las dos. Hay pruebas de los dos casos.

---

## `puede()` es pura

No lee la hoja, no consulta la caché, no llama a Google. Recibe el acceso **ya
resuelto** por E4 y decide.

Eso es lo que hace que `Permisos.gs` sea el único fichero del backend que se
genera entero desde TypeScript y no tiene contraparte escrita a mano: no hay
nada que solo se pueda comprobar ejecutándolo.

---

## `verbosDe()` no autoriza

Devuelve los verbos de un rol para que la interfaz no ofrezca botones
imposibles. Es una comodidad, no una decisión: **la autorización sigue siendo
`puede()` en cada petición**. Una interfaz que esconde un botón no impide que
alguien llame igualmente a la acción.

---

## Añadir un verbo

1. Ponerlo en `VERBOS`, con su ámbito, su especie y una frase de para qué sirve.
2. Añadirlo a las filas de `MATRIZ_PERMISOS` donde corresponda — o a ninguna, si
   es de solo titular, y entonces también a `VERBOS_SOLO_TITULAR`.
3. Regenerar: `node scripts/generar-gs.mjs`.

Las pruebas comprueban que todo verbo de la matriz existe en el catálogo. Una
errata en un nombre dejaría un permiso que no concede nada, y nadie se enteraría
hasta que alguien no pudiera hacer su trabajo.
