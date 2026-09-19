# Evidencia E2 — Instalador idempotente

**Estado: TRES CRITERIOS DE CUATRO. Ejecutada el 2026-09-18.**

Las decisiones del instalador estaban probadas en frío; el 18 de septiembre se
ejecutó sobre una cuenta `@gmail.com` de pruebas. Tres criterios quedan
cerrados con evidencia, uno **no**, y aparecieron dos cosas que el guion no
preveía.

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
| 3 | Un disparador **del instalador** aparece en el registro | ❌ **NO DEMOSTRADO** | Ver abajo |
| 4 | Reejecutar no duplica | ✅ **CERRADO** en hoja y semillas, sin captura del recuento de disparadores | Reejecución de 4,863 s: ni pestañas duplicadas ni el dominio borrado resucitado |

**E2 no se cierra con el criterio 3 abierto.** Es el que separa «el instalador
dice que creó disparadores» de «los disparadores existen y corren».

### Por qué el criterio 3 no está cerrado

`E2-06-ejecuciones.png` lista tres ejecuciones:

| Hora | Función | Tipo | Duración |
|---|---|---|---|
| 20:48:58 | `instalar` | Editor | 4,863 s |
| 20:45:50 | `instalar` | Editor | 23,279 s |
| 20:28:33 | `onOpen` | **Activador sencillo** | 0,502 s |

El único disparador que aparece es `onOpen`, y está marcado **«Activador
sencillo»**: es el que Apps Script ejecuta por su cuenta, sin autorización y
**sin instalador**. Existe con o sin `instalar()`.

Lo que el criterio 3 pide es ver correr un disparador **instalable**, de los que
crea el instalador. Ese es `registrarApertura`, y **no aparece en la lista**.

Dos lecturas posibles, y no se pueden distinguir con esta evidencia:

- la hoja no se volvió a abrir después de instalar, así que el disparador existe
  pero no ha tenido ocasión de ejecutarse; o
- los disparadores no llegaron a crearse, y entonces fallan el 3 **y** el 4.

Se distingue en dos minutos: abrir el panel **Activadores** del editor. Si hay
tres, es lo primero. Si hay cero, es lo segundo.

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

## Lo que falta para cerrar E2

1. Abrir el panel **Activadores** del editor y contar. Deberían ser **tres**:
   `registrarApertura`, `tareaDiaria` y `tareaHoraria`. 📸 `E2-07-activadores.png`
2. Cerrar y reabrir **la copia**, y comprobar que en `Ejecuciones` aparece
   `registrarApertura` como **activador instalable**. 📸 `E2-08-disparador-instalable.png`
3. Al día siguiente, confirmar que no llegó ningún correo de error. Cuando se
   tomaron estas capturas habían pasado unos diez minutos desde la instalación:
   `tareaHoraria` no había corrido **ni una vez**, así que «sin correos de
   error» todavía no es una observación, es una expectativa.

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
