# Instalar Paté · Salud Familiar en tu cuenta

Esto lo hace **una sola persona por familia**, una sola vez, y tarda unos cinco
minutos. Los demás familiares no tienen que hacer nada de esto: recibirán un
correo con un enlace y ya está.

Lo que vas a montar es **tu propio expediente, en tu propia cuenta de Google**.
No hay un servidor nuestro en medio. Tus datos no salen de tu Drive.

> **Necesitas una cuenta `@gmail.com` normal.** No hace falta Google Workspace
> ni ninguna cuenta de empresa, en ningún paso.

---

## 1 · Copia la plantilla

Abre el enlace de la plantilla que te pasamos y elige **Archivo ▸ Hacer una
copia**.

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

- las **21 pestañas** del expediente, con sus encabezados;
- una carpeta **Paté · Salud Familiar** en tu Drive, con `Documentos`,
  `Respaldos` y `Temporal` dentro;
- los catálogos de arranque: vacunas de perro y gato, y los dominios de las EPS
  y laboratorios más comunes, que podrás ajustar desde la aplicación;
- **tres tareas programadas**, que son las que después mandan los avisos.

## 5 · Publica tu expediente para la aplicación

Este es el único paso incómodo, y también es el último.

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
5. **Implementar** y copia la **URL** que aparece.

> **Esa URL es la llave de tu expediente.** No la publiques ni la pegues en un
> grupo de WhatsApp. Compártela solo a través de la aplicación.

## 6 · Pégala en la aplicación

Vuelve a Paté, al asistente de creación de grupo, y pega ahí la URL. La
aplicación hará una comprobación y te dirá si todo está bien.

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
