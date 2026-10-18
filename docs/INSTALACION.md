# Instalar Paté · Salud Familiar en tu cuenta

Esto lo hace **una sola persona por familia**, una sola vez, y tarda unos cinco
minutos. Los demás familiares no tienen que hacer nada de esto: recibirán un
correo con un enlace y ya está.

Lo que vas a montar es **tu propio expediente, en tu propia cuenta de Google**.
No hay un servidor nuestro en medio. Tus datos no salen de tu Drive.

> **Necesitas una cuenta `@gmail.com` normal.** No hace falta Google Workspace
> ni ninguna cuenta de empresa, en ningún paso.

---

> **El camino corto (Bloque M):** en la aplicación, **«¿Tu familia todavía no
> usa Paté? Crea su expediente»** (o la pantalla que ve una cuenta sin
> acceso). Allí se autoriza el tratamiento de datos de salud y se abre la
> plantilla. Son tres pasos: copiar → **Paté ▸ Instalar** → **Paté ▸ Conectar
> con la aplicación ▸ Abrir Paté ya conectado**. Esta guía cuenta lo mismo con
> más detalle.

## 1 · Copia la plantilla

Abre el enlace de la plantilla (en la aplicación, «Hacer mi copia de la
plantilla») y pulsa **Hacer una copia**.

Ponle el nombre que quieras: `Paté · Familia Pérez`, por ejemplo. La copia es
tuya y vive en tu Drive.

> La copia se lleva también el programa que hace funcionar la aplicación. Si
> abres la copia y no ves el menú del paso 2, es que algo salió mal en la copia:
> vuelve a hacerla desde el enlace original.

## 2 · Abre la hoja y busca el menú «Paté»

Al abrir tu copia, en la barra de menús —junto a *Archivo*, *Editar*, *Ver*—
aparece uno nuevo: **Paté**.

Puede tardar unos segundos la primera vez.

## 3 · Paté ▸ Instalar o actualizar

Google te va a pedir permiso. **Es normal y hace falta**, porque el programa
tiene que crear cosas en tu cuenta.

Verás dos pantallas seguidas:

**Primera: «Google no ha verificado esta aplicación».**
Es la pantalla que Google enseña con cualquier programa que no haya pasado por
su revisión comercial. El programa es el que acabas de copiar a tu cuenta.
Pulsa **Configuración avanzada** y luego **Ir a … (no seguro)**.

**Segunda: la lista de permisos.** Merece la pena leerla. Pide siete cosas, y
cada una tiene un motivo:

| Lo que pide | Para qué |
|---|---|
| Ver y gestionar hojas de cálculo | Escribir en tu propio expediente |
| Ver y gestionar los archivos que esta app cree | Guardar tus documentos. **Solo los suyos**: no ve el resto de tu Drive |
| Ver y editar eventos de tus calendarios | Poner las citas médicas en tu agenda |
| Enviar correo en tu nombre | Mandar las invitaciones a tu familia. **No puede leer tu correo** |
| Crear tareas programadas | Los avisos de vacunas y seguimientos |
| Conectarse a un servicio externo | Comprobar que quien entra es quien dice ser |
| Ver tu dirección de correo | Saber que el expediente es tuyo |

Cuando estés de acuerdo, **Permitir**.

## 4 · Espera a que termine

Aparece un aviso abajo a la derecha con el tiempo que tardó. En una hoja nueva
son unos pocos segundos.

Se han creado:

- las **22 pestañas** del expediente, con sus encabezados;
- una carpeta **Paté · Salud Familiar** en tu Drive, con `Documentos`,
  `Respaldos` y `Temporal` dentro;
- los catálogos de arranque: vacunas de perro y gato, y los dominios de las EPS
  y laboratorios más comunes, que podrás ajustar desde la aplicación;
- **tres tareas programadas**, que son las que después mandan los avisos.

La instalación además deja configurado, sin pedirte nada, con qué aplicación
se identifica tu expediente (`OAUTH_CLIENT_ID`): lo lee de la propia
aplicación. Antes había que crearlo a mano y nada lo decía.

## 5 · Paté ▸ Conectar con la aplicación

Abre **Paté ▸ Conectar con la aplicación**. La primera vez te explica cómo
publicar tu expediente (los pasos de abajo). En cuanto está publicado, el mismo
menú te da un botón **«Abrir Paté ya conectado»** y otro para **mandarte el
enlace por correo** (para abrirlo en el celular). No hay que copiar ni pegar
ninguna URL.

### Publicar (una sola vez)

Este es el único paso incómodo.

1. **Extensiones ▸ Apps Script**. Se abre el editor en otra pestaña.
2. Arriba a la derecha: **Implementar ▸ Nueva implementación**.
3. Pulsa el engranaje ⚙ y elige **Aplicación web**.
4. Dos opciones, y las dos importan:
   - **Ejecutar como: Yo**. Es lo que hace que tu familia no tenga que dar
     ningún permiso a Google: todo ocurre con tu autorización, no con la suya.
   - **Quién tiene acceso: Cualquier usuario**. Suena peor de lo que es: la
     dirección es imposible de adivinar, y el programa comprueba la identidad de
     quien llama antes de responder nada. Si pusieras otra opción, la aplicación
     no podría hablar con tu expediente.
5. **Implementar**, y vuelve a la hoja: **Paté ▸ Conectar con la aplicación**.

> **La URL de la implementación es la llave de tu expediente.** No la publiques
> ni la pegues en un grupo de WhatsApp. El menú la mete en el enlace de
> conexión por ti.

## 6 · Abre Paté ya conectado

En el diálogo, **Abrir Paté ya conectado** y entra con **la misma cuenta de
Google** con la que instalaste. La aplicación comprueba que tu hoja responde y
es compatible, la recuerda en ese navegador y carga tu expediente.

¿Prefieres hacerlo a mano? También puedes pegar la URL en **Ajustes ▸ Hoja de
la familia ▸ Cambiar dirección de la hoja**.

Ya está. A partir de aquí, invitas a tu familia desde la aplicación y ellos solo
tienen que abrir un enlace.

---

## Si algo va mal

**No aparece el menú «Paté».** Cierra y vuelve a abrir la hoja. Si sigue sin
aparecer, la copia no se llevó el programa: hazla otra vez desde el enlace
original, con **Archivo ▸ Hacer una copia**.

**Me equivoqué y quiero volver a empezar.** Ejecuta **Paté ▸ Instalar o
actualizar** otra vez. Está hecho para poder repetirse: no duplica nada y no
borra lo que ya tengas escrito.

**Hay una versión nueva del programa.** Pega el `Pate.gs` nuevo en el editor,
ejecuta **Paté ▸ Instalar o actualizar** y, en **Implementar ▸ Administrar
implementaciones**, edita la que ya tienes con **Nueva versión**. Así la URL no
cambia. El detalle está en el manual de usuario, sección 11.

**Quiero parar los avisos.** **Paté ▸ Quitar disparadores**. Deja tu expediente
intacto y solo apaga las tareas programadas. Para volver a encenderlas, instala
de nuevo.

**Me llega un correo de error de Google.** No debería pasar. Si pasa, mándanoslo:
significa que una tarea programada está fallando, y eso se arregla de nuestro
lado.

---

## Lo que esta instalación NO hace

- **No lee tu correo.** El permiso que pide es para *enviar*, no para leer. La
  lectura del correo llegará más adelante, y cuando llegue te lo tendrá que
  pedir explícitamente, con otra pantalla de permisos.
- **No ve tu Drive.** Solo los archivos que la propia aplicación cree.
- **No manda nada a ningún servidor nuestro.** Tu expediente vive en tu cuenta.
