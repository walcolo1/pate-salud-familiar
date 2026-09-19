# Evidencia E2 — Instalador idempotente

**Estado: LOS CUATRO CRITERIOS CERRADOS. Ejecutada el 2026-09-18.**

Las decisiones del instalador estaban probadas en frío; el 18 de septiembre se
ejecutó sobre una cuenta `@gmail.com` de pruebas. Los cuatro criterios que
E0-bis traspasó a este paso quedan cerrados con evidencia, y aparecieron dos
cosas que el guion no preveía.

Queda un cabo menor, con fecha: confirmar mañana que no llegó ningún correo de
error de Apps Script.

---

## Lo que ya está comprobado

| Qué | Dónde | Resultado |
|---|---|---|
| Qué pestañas faltan, en cualquier estado de instalación | `planInstalacion.test.ts` | ✅ 29 pruebas |
| Que reejecutar **no duplica** disparadores | `planInstalacion.test.ts` | ✅ |
| Que **no se tocan** los disparadores ajenos | `planInstalacion.test.ts` | ✅ |
| Que no se instala un disparador sobre `onOpen` | `planInstalacion.test.ts` | ✅ |
| Que cada fila de semilla encaja con su cabecera | `planInstalacion.test.ts` | ✅ |
| Que `Instalacion.gs` no se ha quedado atrás | `esquemaHoja.test.ts` | ✅ |

Esa última es la que sostiene todo lo demás: el instalador ejecuta **las mismas
funciones** que estas pruebas verifican, no una segunda versión escrita a mano
que se le parezca. `Instalacion.gs` se genera desde `src/lib/planInstalacion.ts`
y una prueba falla si divergen.

---

## Los cuatro criterios heredados de E0-bis

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `/copy` arrastra el script vinculado | ✅ **CERRADO** | `E2-01-copia-con-script.png`: la hoja titulada «**Copia de** Paté · Salud Familiar — PLANTILLA» tiene el menú **Paté** en su barra. El script viaja |
| 2 | `instalar()` completa cabe en 6 minutos | ✅ **CERRADO**, con un matiz | 23,279 s de reloj la instalación desde cero, 4,863 s la reejecución. Frente a 360 s, holgadísimo |
| 3 | Un disparador **del instalador** aparece en el registro | ✅ **CERRADO** | `E2-08`: `registrarApertura`, tipo **Activador**, 2,6 s y 1,38 s, Completada las dos veces |
| 4 | Reejecutar no duplica | ✅ **CERRADO** | Reejecución de 4,863 s sin pestañas duplicadas ni dominio resucitado, y `E2-07`: **tres** activadores después, no seis |

### El criterio 3, y lo que enseña de propina

`E2-06-ejecuciones.png` lista tres ejecuciones:

| Hora | Función | Tipo | Duración |
|---|---|---|---|
| 20:48:58 | `instalar` | Editor | 4,863 s |
| 20:45:50 | `instalar` | Editor | 23,279 s |
| 20:28:33 | `onOpen` | **Activador sencillo** | 0,502 s |

En esa primera captura el único disparador era `onOpen`, marcado **«Activador
sencillo»** —el que Apps Script ejecuta por su cuenta, que existe con o sin
instalador—. Faltaba ver correr uno **instalable**, que es lo que el criterio
pide y lo que separa «el instalador dice que los creó» de «existen y corren».

`E2-07-activadores-creados.png` enseña el panel **Activadores** con los tres,
exactamente los que declara `DISPARADORES`:

| Función | Evento |
|---|---|
| `tareaHoraria` | Basado en tiempo |
| `tareaDiaria` | Basado en tiempo |
| `registrarApertura` | De una hoja de cálculo · **Al abrirse** |

Tres, no seis, **después** de haber reejecutado `instalar()`. Eso termina de
cerrar también el criterio 4 por el lado que faltaba.

`E2-08-disparador-instalable-ejecutado.png` cierra el 3, y de paso demuestra
algo que no estaba en el guion. En cada una de las dos aperturas de la hoja
corren **dos funciones distintas**:

| Hora | Función | Tipo | Duración |
|---|---|---|---|
| 21:04:36 | `registrarApertura` | **Activador** | 1,38 s |
| 21:04:35 | `onOpen` | Activador sencillo | 0,386 s |
| 21:04:22 | `registrarApertura` | **Activador** | 2,6 s |
| 21:04:22 | `onOpen` | Activador sencillo | 0,71 s |

Es la comprobación en vivo de la decisión que `planInstalacion.ts` protege con
una prueba: **el disparador instalable NO va sobre `onOpen`**. Si fuera al
revés, aquí se vería `onOpen` dos veces por apertura y el menú se construiría
por duplicado. Se ven dos funciones, cada una con su disparador, sin pisarse.

### Sobre el número de milisegundos

`msTotal` en `AUDITORIA` marcó **3.890 ms**, y corresponde a la **reejecución**
—la de 4,863 s de reloj—, no a la instalación desde cero. La primera pasada
tardó 23,279 s de reloj, y de esa no tenemos su `msTotal`: la diferencia entre
reloj y código es la pantalla de autorización, que no es tiempo de ejecución.

Para el criterio 2 da igual —23 s contra un límite de 360 s es holgura de
sobra—, pero el número que quedó registrado no es el que mide lo que importa:
crear 21 pestañas, sembrar dos catálogos y montar el árbol de Drive.

---

## Guion de validación real

Con una cuenta `@gmail.com` de pruebas, sobre la plantilla de E1.

**Paso 1 · Armar la plantilla.** ✅ **Hecho el 2026-09-18.** Hoja de cálculo
nueva → `Extensiones ▸ Apps Script` → manifiesto y código pegados. Al recargar,
**apareció el menú Paté**, que confirma tres cosas: el script quedó vinculado a
la hoja, `onOpen` se ejecuta como disparador simple sin autorización previa, y
los ocho ficheros concatenados cargan sin error de sintaxis.

No confirma todavía el criterio 1 —eso es el Paso 2—, pero sí descarta el
escenario que lo haría imposible: un proyecto autónomo.

> **El identificador de la plantilla no se versiona.** Vive en
> `docs/evidencia/plantilla-local.md`, que está en `.gitignore`. El motivo está
> ahí explicado: `evidencia/README.md` exige tapar los identificadores de hoja
> en las capturas, y escribirlos en texto plano al lado sería incoherente. El
> enlace `/copy` de la plantilla de **producción** sí será público, pero esa
> será otra hoja.

**Paso 2 · Copiar.** Abrir el enlace `/copy` de la plantilla —está en
`docs/evidencia/plantilla-local.md`— o, equivalente, `Archivo ▸ Hacer una
copia` desde la propia hoja. Abrir la copia.
- *Criterio 1:* aparece el menú **Paté** y en `Extensiones ▸ Apps Script` está
  todo el código. 📸 `E2-01-copia-con-script.png`
- Mirar **Activadores**: debe haber **cero**. No se copian, y por eso el
  instalador tiene que crearlos.

**Paso 3 · Instalar.** `Paté ▸ Instalar o actualizar`. Autorizar.
- 📸 `E2-02-pantalla-no-verificada.png` — con los **ámbitos reales de la
  plantilla**, que es la captura que E8 necesita y que E0-bis dejó pendiente.
- 📸 `E2-03-ambitos-solicitados.png`

**Paso 4 · Comprobar lo que se creó.**
- 21 pestañas, cada una con su fila de encabezados en negrita y congelada.
- `CONFIG` con una fila: identificador de familia, nombre, **tu correo**,
  fecha y versión de esquema.
- `ACCESO` con una fila `TITULAR` / `*` / `ACTIVO`.
- `DOMINIOS_AUTORIZADOS` con 10 filas y `CATALOGO_VACUNAS` con 11.
- En Drive: `Paté · Salud Familiar` con `Documentos`, `Respaldos` y `Temporal`.
- El aviso con el tiempo, y la fila `INSTALAR` en `AUDITORIA` con el resumen.
- *Criterio 2:* `msTotal` **muy por debajo de 360 000**. El propio resumen trae
  el veredicto: `HOLGADO`, `ACEPTABLE` o `PARTIR`. 📸 `E2-04-auditoria.png`
- `Paté ▸ Diagnóstico` debe decir «Identificador de hoja guardado: sí».

**Paso 5 · Reejecutar.** `Paté ▸ Instalar o actualizar` otra vez.
- *Criterio 4:* siguen siendo **3 disparadores**, no 6. 📸 `E2-05-triggers.png`
- `DOMINIOS_AUTORIZADOS` sigue con 10 filas: las semillas no se duplican.
- Si habías borrado un dominio a mano, **sigue borrado**: sembrar solo ocurre
  con la pestaña vacía.
- `CONFIG` conserva el mismo `familia_id`: reinstalar no cambia la identidad de
  la familia.

**Paso 6 · Ver un disparador ejecutarse.** Cerrar la hoja y volver a abrirla.
- *Criterio 3:* en `Ejecuciones` del editor aparece `registrarApertura`, y en
  `AUDITORIA` una fila `APERTURA`. 📸 `E2-06-ejecuciones.png`
- Es la vía rápida. El diario y el horario tardan más en demostrarse; si se
  quiere confirmar también, basta con volver al día siguiente y mirar
  `AUDITORIA`.

**Paso 7 · Que ningún disparador falle.** Al día siguiente, revisar el correo de
la cuenta de pruebas.
- *Criterio implícito, y el más importante para la confianza del titular:* **no
  debe haber llegado ningún aviso de error de Apps Script**. Un disparador
  horario que falla son 24 correos al día. Por eso los tres manejadores están
  envueltos en `try/catch` y lo que aún no existe no se intenta.

**Cierre.** `Paté ▸ Quitar disparadores`, archivar cualquier implementación de
prueba y tirar la hoja.

---

## Dos cosas que el guion no preveía

### La plantilla quedó instalada, y eso la inutiliza como plantilla

Las tres ejecuciones de `instalar` llevan el título **«Paté · Salud Familiar —
PLANT…»** y el tipo **Editor**: se ejecutaron sobre la plantilla, no sobre la
copia. Funcionalmente daba igual para medir, pero tiene una consecuencia:

La plantilla ya no está limpia. Tiene sus 21 pestañas creadas, `CONFIG` con el
correo de la cuenta de pruebas, una fila `TITULAR` en `ACCESO` y, si se
crearon, sus disparadores. **Cualquier `/copy` de esa hoja arrastraría todo
eso**, y el titular que la copiara empezaría con el correo de otra persona como
dueño de su expediente.

Para **E8**, la plantilla de producción tiene que armarse limpia: pegar el
código y **no** ejecutar `Instalar`. El menú tiene que aparecer, y ahí parar.

### La captura de «app no verificada» sigue sin tomarse

`E2-02` no es esa pantalla: es el diálogo previo, **«Se requiere
autorización»**. La pantalla de «Google no ha verificado esta aplicación» —la
que E0-bis dejó pendiente para E8 y que es donde un titular abandona— no está
entre las seis.

A cambio, `E2-03-ambitos-solicitados.png` **sí** es la captura buena, y vale
más de lo que pedía el guion: enseña los permisos en las palabras de Google, y
confirman el diseño de ámbitos de E1 casi línea por línea.

| Lo que lee el titular | Ámbito |
|---|---|
| «solo los archivos de Google Drive que **utilices en esta aplicación**» | `drive.file` — la versión estrecha, no todo el Drive |
| «**todas** tus hojas de cálculo» | `spreadsheets` — el único amplio, el que no se pudo estrechar |
| «Ver y editar eventos de todos tus calendarios» | `calendar.events` |
| «Conectarse a un servicio externo» | `script.external_request` |
| «**Enviar** correo electrónico en tu nombre» | `script.send_mail` — dice *enviar*, no leer |
| «Permitir que esta aplicación se ejecute cuando no estás presente» | `script.scriptapp` |

Esa quinta línea es la que justifica haber elegido `MailApp` sobre `GmailApp`:
con el segundo, el titular leería «leer, redactar, enviar y borrar
**permanentemente todo** tu correo».

---

## El cabo que queda

Confirmar que **no llegó ningún correo de error de Apps Script**. Cuando se
tomaron estas capturas habían pasado unos diez minutos desde la instalación y
`tareaHoraria` no había corrido ni una vez, así que «sin correos de error»
todavía no era una observación: era una expectativa.

Es el criterio que más pesa para la confianza del titular —un disparador
horario que falla son 24 correos al día— y por eso los tres manejadores están
envueltos en `try/catch` y lo que aún no existe no se intenta.

Se confirma mirando la bandeja al día siguiente. Si llega alguno, hay que
volver a abrir E2.

---

## Lo que este paso deja escrito para los siguientes

**El escaneo de correo no puede funcionar todavía, y es deliberado.**
`tareaHoraria` existe y se ejecuta cada hora, pero no hace nada: el manifiesto
**no declara ámbito de Gmail**, porque `gmail.readonly` es restringido. Cuando
E11 lo añada, cada titular tendrá que volver a autorizar con una pantalla más
seria. Es una decisión de producto con coste, no un detalle técnico.

**La carpeta `Temporal` nace con fecha de caducidad.** `DIAS_RETENCION_TEMPORAL`
son 7 días y el aseo lo hace la tarea diaria, que se implementa en E11. Hasta
entonces la carpeta existe y **nadie la vacía**: conviene no empezar a usarla
antes de esa fecha, o será el sitio donde se queden documentos de pacientes para
siempre.
