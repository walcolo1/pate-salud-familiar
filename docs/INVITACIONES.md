# Invitaciones — cómo entra un familiar sin autorizar nada (Bloque E, E7)

El titular pasa una fricción de cuatro minutos, una vez: la pantalla de «Google
no ha verificado esta aplicación», los siete ámbitos, la copia de la hoja.

**Todos los demás no pasan por ninguna.** No autorizan nada, no ven una pantalla
de permisos de Google y no instalan nada. Reciben un correo con un enlace, se
identifican con su cuenta de siempre y entran.

Eso no es una comodidad: es lo que hace que la restricción de cuentas
personales se sostenga en la práctica. Si cada familiar tuviera que consentir
los ámbitos del script, la mitad no pasaría de la pantalla de advertencia.

---

## El recorrido completo

```
  titular ──── invitar ────► ACCESO: fila INVITADO + hash del token
                   │
                   └──────► correo con el enlace
                                  │
  familiar ◄──────────────────────┘
      │
      └─ abre el enlace ─► PWA ─► inicia sesión con Google ─► id_token
                                         │
                                         └─► aceptarInvitacion ─► ACCESO: ACTIVO
```

El familiar se identifica **contra la PWA**, que es una aplicación OAuth ya
verificada para él, no contra el script del titular. Por eso no ve ninguna
pantalla de permisos.

---

## El token

Dos `Utilities.getUuid()` concatenados sin guiones: **244 bits** de entropía en
64 caracteres hexadecimales.

Uno solo bastaría —un UUID v4 tiene 122 bits y adivinarlo es impracticable—
pero la generación queda fuera de nuestro control y no se puede auditar. La
segunda llamada no cuesta nada, así que se hace.

**En la hoja va su SHA-256, nunca el token.** Una hoja de cálculo se comparte
por accidente con una facilidad que un servidor no tiene; si eso ocurre, los
hashes no dejan entrar a nadie.

Caduca a los **siete días**. Una invitación que no se usa en una semana es una
invitación olvidada, y una invitación olvidada que sigue viva es una puerta
abierta en el correo de alguien.

> **El byte con signo.** `Utilities.computeDigest` devuelve bytes de −128 a 127,
> herencia del `byte` de Java. Pasarlos a hexadecimal sin corregir el signo
> produce un hash distinto para la mitad de las entradas y —lo que lo hace
> peligroso— **estable**: nada falla, sencillamente ninguna invitación se
> encuentra nunca. Por eso la conversión está en el módulo de TypeScript, donde
> hay una prueba que la fija, y no en el `.gs`.

---

## La segunda excepción a la cadena

`aceptarInvitacion` es el único sitio donde alguien con **identidad verificada y
sin acceso** llega a un manejador. No puede ser de otra manera: quien acepta
viene justo a conseguir el acceso que no tiene.

Es un agujero nuevo en el muro que E6-live validó, así que está declarado en la
tabla y no escondido en un `if`:

```ts
aceptarInvitacion: { verbo: null, exigeAcceso: false, muta: true },
```

Cuatro invariantes lo cierran, y cada uno tiene su prueba:

| Invariante | Por qué |
|---|---|
| `ping` es la **única** con `exigeToken: false` | Sin identidad no hay nada que comprobar después |
| `aceptarInvitacion` es la **única** con token y sin acceso | Cualquier otra sería un segundo agujero |
| Saltarse el acceso obliga a `verbo: null` | Un verbo se comprueba contra un rol, y el rol sale del acceso |
| Saltarse el token obliga a saltarse el acceso | No hay correo con el que resolverlo |

Lo que la protege no es la matriz de E5, que aquí no aplica, sino el token: 244
bits, caducidad y un solo uso.

---

## Una invitación reenviada no funciona

El correo que manda es el del **`id_token`**, no el del enlace. Si Ana le pasa
su enlace a Luis, Luis recibe `INVITACION_DESTINATARIO_INVALIDO`.

Cuesta algún caso de soporte —«me lo mandaron al correo del trabajo»— y evita
que un correo perdido, reenviado o encontrado en una bandeja ajena sea una
puerta abierta a un expediente clínico.

Los dos correos se comparan **normalizados**, por lo mismo que en E6-bis: el
titular teclea la dirección al invitar y puede escribirla con puntos.

---

## Los códigos, y por qué estos sí dicen el motivo

| Código | Cuándo |
|---|---|
| `INVITACION_DESCONOCIDA` | El token no corresponde a ninguna fila, o está mal formado |
| `INVITACION_DESTINATARIO_INVALIDO` | El token es de otra persona |
| `INVITACION_EXPIRADA` | Pasaron los siete días |
| `INVITACION_YA_USADA` | Esa invitación se canjeó |
| `INVITACION_REVOCADA` | El titular se arrepintió antes de que se abriera el correo |

En E3 y E4 el motivo **nunca** sale: decir «figuras pero estás revocado» en vez
de «no figuras» le confirma a quien lo intenta que ese correo existe en esta
familia.

Aquí es distinto, y la diferencia tiene motivo: **para llegar a estos códigos
hay que traer un token**, que es un secreto de 244 bits. A quien ya lo tiene,
decirle que caducó no le revela nada. Y `INVITACION_DESTINATARIO_INVALIDO` es lo
único que permite a la PWA decir «estás en la cuenta equivocada» en vez de
dejar a alguien mirando un error mudo, que es exactamente el momento en que la
gente abandona.

**Lo que no sale nunca es para quién era la invitación.** Hay una prueba que
recorre todos los rechazos comprobando que ninguno lleva el correo dentro.

El orden de las comprobaciones también es una decisión: el destinatario se mira
**antes** que la caducidad. Quien llega ahí ya demostró tener el token, así que
lo accionable vale más que lo exacto — decirle «caducó» a quien está en la
cuenta equivocada le manda a pedir otra invitación que tampoco podrá usar.

---

## El correo

Aséptico. Ni el nombre del titular, ni el de la familia, ni el de ningún
paciente, ni nada clínico. La misma regla que rige los avisos de pantalla
bloqueada, por el mismo motivo y con uno más: un correo se reenvía por error, se
queda en la bandeja durante años y lo indexa un buscador de escritorio.

La regla comprobable es **«sin interpolación»**, no «sin datos sensibles»: la
primera la verifica una prueba, la segunda exige criterio cada vez. El único
marcador de la plantilla es `{{enlace}}`, y hay un trinquete —
`PROHIBIDO_EN_CORREO`— que se pone rojo si alguien añade `{{nombre}}` o
`{{paciente}}` «solo un poco».

**Texto plano, sin HTML.** No ejecuta nada y no delata si se abrió.

**`MailApp`, no `GmailApp`.** Los dos envían correo; `GmailApp` exige
`https://mail.google.com/`, un ámbito **restringido** con acceso total al buzón,
y `MailApp` se conforma con `script.send_mail`, que solo permite enviar. Pedir
el buzón entero para mandar una invitación es justo el tipo de exceso que hace
que un titular cancele la instalación.

Cuota: **100 destinatarios al día** en una cuenta gratuita, y es la del titular.
Las invitaciones son raras; lo que hay que vigilar es la automatización de E11,
que comparte ese cupo.

---

## El enlace lleva la dirección del backend

```
https://…/invitacion?t=<token>&backend=<url del /exec de esta familia>
```

La PWA es la misma para todas las familias y no sabe con qué hoja hablar hasta
que se lo dicen. Esa dirección **es una credencial** —quien la tenga puede
llamar al endpoint— así que viaja por el mismo canal que el token y con la misma
caducidad efectiva: el enlace entero se consume de una vez.

La base de la PWA se valida antes de meterla en un correo: tiene que ser
`https`, sin credenciales embebidas y sin consulta. Una base mal configurada
mandaría a toda la familia a un sitio que no es el nuestro, con el token puesto.

Dos propiedades del script, que el titular configura una vez:

| Propiedad | Qué es |
|---|---|
| `URL_PWA` | La dirección de la aplicación web |
| `URL_BACKEND` | La `/exec` de este despliegue |

Si falta cualquiera de las dos, `invitar` **falla cerrado**, igual que `Auth.gs`
sin audiencia: una instalación a medias no debe poder mandar enlaces que no
llevan a ninguna parte.

---

## Se escribe antes de enviar, y no al revés

Si el envío falla después de escribir, queda una fila con un token que nadie
recibió: el titular reinvita y `mutarAcceso` **reescribe la misma fila**, sin
duplicarla.

Al revés —enviar primero— dejaría a alguien con un enlace en el correo que no
corresponde a ninguna fila, y eso no se arregla solo.

De los dos fallos posibles, se elige el que se corrige repitiendo la operación.

---

## El reparto de siempre

| Dónde | Qué |
|---|---|
| `src/lib/invitaciones.ts` | Forma del token, caducidad, tabla de estados, quién puede aceptar, el cuerpo del correo, la conversión a hexadecimal. **62 pruebas** |
| `apps-script/plantilla/Invitaciones.gs` | `Utilities.getUuid`, `Utilities.computeDigest`, la hoja, el cerrojo y `MailApp` |

`mutarInvitacion_` es la hermana de `mutarAcceso` para el único caso que aquella
no puede cubrir, porque `mutarAcceso` exige TITULAR y quien acepta no es nadie
todavía. Lleva el mismo cerrojo de script —dos pestañas aceptando a la vez
leerían la misma hoja y una escritura desaparecería— y sube la versión por el
mismo motivo.

La fila se busca **por el hash**, nunca por el correo: buscar por correo dejaría
que alguien comprobara si una dirección figura en esta familia sin tener ningún
token.

---

## Qué falta comprobar contra Google

Las 62 pruebas cubren todas las decisiones con dobles. Lo que espera a una
validación real:

1. Que `MailApp.sendEmail` salga de verdad desde una cuenta gratuita, y con qué
   aspecto llega.
2. Que el familiar **no vea ninguna pantalla de permisos** — la promesa del
   bloque entero, y la única que no se puede demostrar con una prueba.
3. Que el enlace sobreviva al cliente de correo sin romperse ni acortarse.
4. Que aceptar desde la cuenta equivocada dé `INVITACION_DESTINATARIO_INVALIDO`
   y no un error mudo.
5. Que el token quede consumido: repetir el mismo enlace da
   `INVITACION_YA_USADA`.

Los cinco caben en un recorrido de una sola sesión con las dos cuentas de
E6-live. La ruta `/invitacion` que hacía falta ya existe (**E9**), y el guion
está escrito en [EVIDENCIA_E9.md](EVIDENCIA_E9.md).
