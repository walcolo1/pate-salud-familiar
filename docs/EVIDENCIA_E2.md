# Evidencia E2 — Instalador idempotente

**Estado: PARTE AUTOMÁTICA VERDE, VALIDACIÓN REAL PENDIENTE.**

Las decisiones del instalador están probadas. Lo que no se puede saber sin
ejecutarlo sobre una cuenta de verdad son las llamadas a Google, y ahí están los
cuatro criterios que E0-bis traspasó a este paso.

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

| # | Criterio | Estado | Cómo se cierra |
|---|---|---|---|
| 1 | `/copy` arrastra el script vinculado | ⏳ **PENDIENTE** | Pasos 1–2 del guion de abajo |
| 2 | `instalar()` completa cabe en 6 minutos | ⏳ **PENDIENTE** | Paso 4; el propio instalador lo mide |
| 3 | Un disparador del instalador aparece en el registro | ⏳ **PENDIENTE** | Paso 6 |
| 4 | Reejecutar no duplica disparadores | 🟡 **PROBADO EN FRÍO** | El plan está probado; falta verlo sobre la API real (paso 5) |

Mientras esta tabla tenga pendientes, **E2 no está cerrado**, por muy verdes que
estén las unitarias. Una prueba de un plan no es una prueba de su ejecución.

---

## Guion de validación real

Con una cuenta `@gmail.com` de pruebas, sobre la plantilla de E1.

**Paso 1 · Armar la plantilla.** Seguir
`apps-script/plantilla/README.md` → «Cómo se arma la plantilla». La hoja
primero, el script después: un proyecto autónomo no viaja con `/copy`.

**Paso 2 · Copiar.** `Archivo ▸ Hacer una copia`. Abrir la copia.
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
