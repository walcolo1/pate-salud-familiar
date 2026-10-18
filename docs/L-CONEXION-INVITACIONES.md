# Bloque L — Conexión automática, invitaciones reales e integridad (v1.2.0)

## 1 · Un dispositivo nuevo se conecta solo

**Antes:** la `/exec` vivía solo en `localStorage`. En el celular (o en otro
navegador) la app decía «Sesión activa» y a la vez «Este navegador no sabe
dónde está la hoja», y pedía pegar la URL.

**Ahora** (`src/lib/invitacionEntrante.ts`):

- `resolverBackend()` = la `/exec` registrada en el navegador **o**, si no hay,
  `urlBackendPorDefecto()`: `NEXT_PUBLIC_WEBAPP_URL` si está definida, y si no,
  `URL_BACKEND_OFICIAL` (el despliegue de la familia). Con `off`, ninguna (las
  E2E lo usan para no hablar con la hoja real).
- La usan la sesión (`identidad.ts`) y el canje del ticket (`ticketSesion.ts`):
  entrar con Google en un navegador limpio emite el ticket y carga el
  expediente sin pedir nada.
- La URL no es una credencial: el endpoint es público (`ping` es anónimo) y sin
  una cuenta en `ACCESO` no devuelve nada.
- **Enlace directo** `/?hoja=<url /exec>`: lo genera Ajustes ▸ Hoja de la
  familia ▸ «Copiar enlace para otro dispositivo». Al abrirlo se comprueba con
  `ping` como si se hubiera pegado, se guarda y se quita de la barra de
  direcciones. Sirve para otra familia con su propia hoja.

## 2 · Invitaciones de punta a punta

Lo que fallaba, en orden:

1. `invitar` exigía las propiedades `URL_PWA` y `URL_BACKEND`, que **nada
   escribía**: fallaba cerrado siempre, antes de escribir o enviar nada.
   Ahora: `URL_PWA` o el origen https (sin ruta) del titular que invita
   (`resolverUrlPwa`), y `URL_BACKEND` o la `/exec` de este despliegue
   (`ScriptApp.getService().getUrl()`). Ámbitos: los mismos 7 de siempre.
2. La lista «Invitaciones enviadas» dependía de un observador que en el backend
   de la hoja no hacía nada. Nueva acción **`listarAccesos`** (verbo
   `ADMINISTRAR_ACCESOS`): `ACCESO` resumido por `resumenAccesos`, sin hashes
   de token y sin la fila del titular. Ajustes y la ficha del familiar la leen.
3. Los errores se mostraban como código (`ERROR_PAYLOAD`) o no se mostraban.
   `mensajesInvitacion.ts` los traduce; `avisar()` confirma el envío.
4. La ficha del familiar «invitaba» en simulación (cambiaba campos locales que
   nunca llegaban a la hoja) y el formulario de edición ofrecía un estado de
   invitación y permisos granulares que no se guardaban. Ahora la ficha enseña
   el estado real de `ACCESO` y enlaza a Ajustes con el familiar preseleccionado
   (`/settings?invitar=<id>#invitaciones`); «Retirar acceso» llama a `revocar`.
5. Cuidador y Lector se invitan con alcance `*` (toda la familia), como dice la
   etiqueta; Miembro, solo con su ficha.

Las invitaciones viven en **`ACCESO`** (estado `INVITADO` → `ACTIVO`), que es
la única fuente de autorización. La pestaña `INVITACIONES` de la hoja oficial
no es del esquema v6: es un resto vacío y se puede borrar a mano.

## 3 · Integridad

- **Vacunas:** `VACUNAS` no guarda el estado; ahora se calcula al leer
  (`estadoDeVacuna`: aplicada si la fecha ya llegó, en hora local).
- **Lotes y colecciones sin pestaña:** importar una cita metía en el mismo lote
  su «candidato» (`SIN_PESTANA`). Su `NO_HAY_DONDE_ESCRIBIRLO` se callaba… y
  con él la cita y su evento, que se quedaban solo en el dispositivo. Van en
  lotes separados, y `lotesSinPestana.test.ts` impide volver a mezclarlos.
- **Documentos sin Drive:** si la subida falla ya no se inventa un
  `mock-drive-…`: se guarda la ficha sin archivo y se avisa.
- **Textos falsos:** el login ya no dice que los datos «no se sincronizan en la
  nube».

## Publicar

1. Backend: `apps-script/dist/Pate.gs` (versión 14 del despliegue, misma `/exec`).
2. Web: `main` → Vercel. Opcional: `NEXT_PUBLIC_WEBAPP_URL` en Vercel si la
   `/exec` cambia algún día (sin ella vale la oficial incrustada).
