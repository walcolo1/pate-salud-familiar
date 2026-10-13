# Manual de usuario — Paté · Salud Familiar (v1.0.0)

Paté guarda el expediente de salud de tu familia —personas y mascotas— en una
hoja de cálculo **de tu propia cuenta de Google**. No hay un servidor nuestro en
medio: la aplicación habla con tu hoja a través de un pequeño programa (el «Web
App») que vive dentro de esa misma hoja.

> **Solo hace falta una cuenta `@gmail.com` normal.** Nadie de la familia
> necesita Google Workspace ni una cuenta de empresa, en ningún paso.

## Índice

1. [Dar de alta a una familia nueva](#1-dar-de-alta-a-una-familia-nueva)
2. [Entrar](#2-entrar)
3. [Familiares y mascotas](#3-familiares-y-mascotas)
4. [Citas, vacunas, exámenes, órdenes y medicamentos](#4-citas-vacunas-exámenes-órdenes-y-medicamentos)
5. [Importar una cita desde un correo](#5-importar-una-cita-desde-un-correo)
6. [Recordatorios y tareas](#6-recordatorios-y-tareas)
7. [Invitar a la familia](#7-invitar-a-la-familia)
8. [Cómo se guardan tus datos](#8-cómo-se-guardan-tus-datos)
9. [Los avisos y qué hacer con cada uno](#9-los-avisos-y-qué-hacer-con-cada-uno)
10. [Seguridad en este dispositivo](#10-seguridad-en-este-dispositivo)
11. [Actualizar la hoja a una versión nueva](#11-actualizar-la-hoja-a-una-versión-nueva)

---

## 1. Dar de alta a una familia nueva

Lo hace **una sola persona por familia** —el titular—, una sola vez, en unos
cinco minutos. El detalle con capturas de cada pantalla de permisos está en
[INSTALACION.md](INSTALACION.md).

1. **Copia la plantilla.** Abre el enlace de la plantilla y elige
   **Archivo ▸ Hacer una copia**. La copia es tuya y vive en tu Drive.
2. **Instala.** En la copia aparece el menú **Paté**. Elige
   **Paté ▸ Instalar o actualizar** y acepta los permisos (la pantalla de
   «Google no ha verificado esta aplicación» es normal: **Configuración
   avanzada ▸ Ir a …**). Se crean las 22 pestañas del expediente, la carpeta
   de Drive y las tareas programadas.
3. **Publica el Web App.** **Extensiones ▸ Apps Script ▸ Implementar ▸ Nueva
   implementación ▸ Aplicación web**, con **Ejecutar como: Yo** y **Quién tiene
   acceso: Cualquier usuario**. Copia la URL que termina en `/exec`.
   Esa URL es la llave de tu expediente: no la publiques.
4. **Enlaza la URL en la aplicación.** Entra en Paté con tu cuenta de Google,
   ve a **Ajustes ▸ Hoja de la familia**, pega la URL y pulsa
   **Comprobar y guardar**. La aplicación comprueba que responde y que es una
   versión compatible antes de guardarla.
5. **Invita a tu familia** desde **Ajustes ▸ Invitaciones Familiares**
   ([sección 7](#7-invitar-a-la-familia)).

La URL queda guardada en ese navegador, también después de cerrar sesión. En
cada navegador nuevo desde el que entres como titular hay que enlazarla una vez.
Los familiares invitados no tienen que hacerlo: su invitación ya la lleva.

## 2. Entrar

Pulsa el botón de **Google** en la pantalla de inicio y elige tu cuenta. Al
entrar verás «Trayendo el expediente de la hoja de tu familia…» y después tu
panel con los datos de la hoja.

Si recargas la página, Google suele devolver la sesión solo en unos segundos.
Si no lo hace, aparece arriba el aviso **«Tu sesión de Google no está activa»**
con el botón de Google: púlsalo y sigues donde estabas, sin cerrar sesión.

Para probar la aplicación sin tocar datos reales existe la **Sesión Demo**, con
una familia de ejemplo. Lo que hagas en la demo no se guarda en ninguna hoja.

## 3. Familiares y mascotas

- **Añadir:** **Familia ▸ Agregar familiar**. El número de documento es
  obligatorio y no se puede repetir.
- **Editar:** desde la ficha del familiar.
- **Dar de baja:** nada se borra de la hoja. Una baja añade una fila con fecha
  de baja (`borrado_en`) y el familiar deja de verse; su historial sigue en la
  hoja.
- **Mascotas:** en la ficha de un familiar, **Registrar mascota**. Tienen su
  propio control de peso, vacunas e historial veterinario.

## 4. Citas, vacunas, exámenes, órdenes y medicamentos

Todo cuelga de la ficha de cada familiar, en sus pestañas: **Programar cita**,
**Registrar vacuna**, **Registrar control**, **Registrar examen**, **Nueva
Orden**, **Registrar Medicamento** y **Subir documento**.

- Las citas pueden crear un evento en tu **Google Calendar**; la primera vez,
  Google te pide permiso para ello.
- Los documentos se guardan en la carpeta **Paté · Salud Familiar** de tu
  Drive. La aplicación solo ve los archivos que ella misma crea.
- Los medicamentos generan sus tomas, y el panel avisa de las que vencen.

## 5. Importar una cita desde un correo

**Importar una cita** te deja pegar el texto del correo de tu EPS o adjuntar el
documento. La aplicación **no lee tu correo**: tú decides qué pegar, y el
análisis ocurre en tu dispositivo.

Lo que se crea es un **borrador**. Revísalo, corrige lo que haga falta y
confírmalo: solo entonces la cita se guarda en la hoja.

> **Los borradores solo viven en este navegador.** No se guardan en la hoja, no
> se ven en otros dispositivos y se borran al cerrar sesión. Confírmalos antes.

## 6. Recordatorios y tareas

**Alertas** reúne los recordatorios de tomas, vacunas y citas, y en su segunda
pestaña las **tareas de seguimiento**. Marca una tarea como hecha y queda
guardada en la pestaña `TAREAS` de la hoja.

## 7. Invitar a la familia

Solo el titular. **Ajustes ▸ Invitaciones Familiares**: elige el familiar,
escribe su correo de Gmail, elige un **Rol de Acceso** y pulsa
**Enviar Invitación**.

| Rol | Qué puede hacer |
|---|---|
| **Cuidador** | Todo lo clínico de los pacientes que tenga asignados |
| **Miembro** | Ver y gestionar su propia ficha |
| **Visualizador** | Leer, sin escribir nada |

El familiar recibe un correo con un enlace. Al abrirlo, entra con **la misma
cuenta a la que se envió**; con otra cuenta, la invitación no se acepta. No
tiene que copiar ninguna hoja ni dar permisos a Google.

Desde la misma sección puedes revocar una invitación o un acceso.

## 8. Cómo se guardan tus datos

**Solo.** Cada cambio se envía a la hoja en el momento en que lo haces. No hay
botón de sincronizar ni hace falta.

**Sin conexión, también.** Si no hay red, o la sesión de Google no está activa,
el cambio se guarda en este dispositivo y el panel dice
**«Cambios sin guardar en la hoja»**. Se envía solo, y en el orden en que los
hiciste, en cuanto vuelvan la red y la sesión, **aunque recargues o cierres el
navegador**.

**Con otra cuenta en el mismo navegador.** Los cambios pendientes recuerdan qué
cuenta los hizo (sin guardar tu correo: guardan una huella anónima). Si entra
otra persona con su cuenta, tus cambios no se envían con la suya: esperan a que
vuelvas a entrar tú. El panel indica cuántos son «de otra cuenta».

**Lo que hizo otra persona.** Si alguien de la familia cambia algo mientras
tienes la aplicación abierta, aparece **«Hay datos nuevos»** con un botón para
actualizar.

**Abrir la hoja.** **Ajustes ▸ Hoja de la familia ▸ Abrir la hoja** abre tu
hoja en otra pestaña (solo el titular).

**Copia de seguridad.** **Ajustes ▸ Exportar Copia (.json)** descarga una copia
del expediente; **Importar Copia (.json)** la restaura en este navegador.

## 9. Los avisos y qué hacer con cada uno

| Aviso | Qué significa | Qué hacer |
|---|---|---|
| **Este navegador no sabe dónde está la hoja de tu familia** | No hay una URL `/exec` enlazada en este navegador | **Registrar la hoja** y pega la URL |
| **Tu sesión de Google no está activa** | Estás dentro, pero sin credencial con la que firmar | Pulsa el botón de Google del aviso |
| **Cambios sin guardar en la hoja** | Hay cambios esperando red o sesión | Nada: salen solos |
| **Hay datos nuevos** | Alguien cambió la hoja desde otro sitio | Pulsa **Actualizar** |
| **La hoja rechazó el cambio: tu rol no permite hacerlo** | Tu rol no incluye esa acción | Pídeselo al titular; el cambio se deshizo |
| **El Web App de tu familia es anterior a esta versión** | La hoja tiene un programa más antiguo que la aplicación | El titular sigue la [sección 11](#11-actualizar-la-hoja-a-una-versión-nueva) |
| **Tienes cambios sin sincronizar** (al cerrar sesión) | Hay cambios que aún no llegaron a la hoja | **Reintentar**, **Cancelar** o, si de verdad quieres perderlos, **Salir y descartar** |

## 10. Seguridad en este dispositivo

- **Bloqueo por inactividad** y **Cierre lógico nocturno**, en Ajustes,
  bloquean la pantalla y piden volver a entrar. Tras 8 horas bloqueada, la
  sesión se cierra sola y se borran los datos del dispositivo; los cambios que no
  llegaron a enviarse se conservan para no perderlos.
- **Cerrar sesión** borra de este navegador el expediente y la sesión. Se
  quedan solo tus preferencias y la dirección de la hoja de la familia, para no
  tener que enlazarla otra vez.
- La sesión de Google vive **solo en memoria**: no se guarda en el navegador.

## 11. Actualizar la hoja a una versión nueva

Cuando haya una versión nueva del programa de la hoja, el titular:

1. Abre la hoja ▸ **Extensiones ▸ Apps Script**, borra los ficheros `.gs` que
   haya, crea uno llamado `Pate` y pega el contenido nuevo de `Pate.gs`.
   Guarda.
2. Vuelve a la hoja y ejecuta **Paté ▸ Instalar o actualizar**. Añade lo que
   falte (pestañas o columnas nuevas) sin tocar lo que ya hay escrito.
3. **Implementar ▸ Administrar implementaciones ▸ ✏ Editar** la implementación
   que ya tienes, elige **Versión: Nueva versión** y **Implementar**.
   Así **la URL `/exec` no cambia** y nadie tiene que volver a enlazarla.

> No uses «Nueva implementación» para actualizar: crearía otra URL distinta, y
> todos los navegadores seguirían hablando con la anterior.
