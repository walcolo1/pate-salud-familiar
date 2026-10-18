# Bloque M — Alta de familias nuevas (v1.3.0)

Cómo empieza a usar Paté una familia que no es la del titular original, en
tres pasos y sin copiar ni pegar URLs. Cada familia sigue teniendo **su propia
hoja en su propio Drive**: no hay servidor común ni datos de una familia en la
cuenta de otra.

## Lo que se encontró

| # | Bloqueo | Arreglo |
|---|---|---|
| 1 | La plantilla maestra era del 19-sep: esquema 1 y el menú con la codificación rota («PatÃ©»). La app la rechazaría. | Regenerarla con el `Pate.gs` vigente en cada versión (ver `PLANTILLA_PRODUCCION.md`). |
| 2 | Nada escribía `OAUTH_CLIENT_ID`: todo inicio de sesión contra una copia nueva fallaba. | `instalar()` lo lee de la PWA (`GET /api/configuracion`, solo lo público) si falta. |
| 3 | Con la dirección por defecto (Bloque L), un externo llegaba a la hoja de otra familia y veía «No se pudo descargar el expediente». | `ACCESO_DENEGADO` ⇒ pantalla «Esta cuenta todavía no tiene un expediente aquí» con los dos caminos. |

## El recorrido

1. **Entrada** («¿Tu familia todavía no usa Paté? Crea su expediente») o la
   pantalla de cuenta sin acceso ⇒ **`/crear-expediente`**: autorización de
   tratamiento de datos de salud (Ley 1581 de 2012) y, solo entonces, el enlace
   `/copy` de la plantilla (`NEXT_PUBLIC_PLANTILLA_URL` o la oficial).
2. En la copia, **Paté ▸ Instalar o actualizar**. Además de lo de siempre,
   escribe `URL_PWA` y `OAUTH_CLIENT_ID` si faltan (una configuración a mano
   manda).
3. **Paté ▸ Conectar con la aplicación**: sin implementación, los cuatro clics
   de «Implementar» (y un campo para pegar la `/exec` si Google no se la dice
   al menú); con ella, **«Abrir Paté ya conectado»** (`/?hoja=<exec>`, Bloque L)
   y **«Enviarme el enlace por correo»** para el celular.

Los familiares de esa familia no hacen nada de esto: reciben la invitación.

## Piezas

- `src/lib/altaFamilia.ts` — plantilla y rutas abiertas sin acceso.
- `src/app/crear-expediente/page.tsx`, `src/components/layout/BienvenidaSinAcceso.tsx`.
- `src/app/api/configuracion/route.ts` — `{ app: 'pate', clientId }`, nada más.
- `src/lib/planInstalacion.ts` (→ `Instalacion.gs`): `clienteDeConfiguracion`,
  `htmlConexion`, `enlaceDeConexion`, `cuerpoConexion`.
- `apps-script/plantilla/Instalador.gs`: `configurarAplicacion_`,
  `conectarConLaAplicacion`, `enviarmeEnlaceDeConexion`, menú nuevo.
- Pruebas: `altaFamilia.test.ts`, `e2e/alta-familia.e2e.ts` (M1–M4) y axe de
  `/crear-expediente`.

## Pendiente a mediano plazo

Actualizar las copias ya instaladas sigue siendo pegar el `Pate.gs` nuevo. Si
el número de familias crece, convertir el núcleo en una **biblioteca de Apps
Script** versionada y dejar en la plantilla solo una capa mínima.

---

## Bloque M2 · lo que enseñó la primera alta real (`wcoloradog@gmail.com`)

| Síntoma | Causa | Arreglo |
|---|---|---|
| «Paté ▸ Conectar con la aplicación» falló con «permisos no suficientes para `Ui.showModalDialog`» | Con `oauthScopes` explícitos hace falta `script.container.ui` | Ámbito añadido (ocho en total) |
| El diálogo ofrecía «Abrir Paté ya conectado» **sin haber publicado nada** | `ScriptApp.getService().getUrl()` da una dirección aunque no haya implementación | `verificarDespliegue_`: GET real a `doGet`; el botón solo aparece si responde como Paté (`esRespuestaDePate`). El diálogo **siempre** trae los pasos y el campo «Comprobar y conectar», que verifica en el servidor y guarda `URL_BACKEND` |
| Tras el enlace, la app decía «Esta cuenta todavía no tiene un expediente aquí» | El enlace llevaba a una /exec muerta: el registro falló y quedó la hoja por defecto (la de otra familia) | Lo anterior, y además… |
| La hoja de una cuenta se pisaba con la de otra en el mismo navegador | Una sola `pate:familia:v1` para todo el navegador | `hojaPorCuenta.ts`: la hoja de cada cuenta bajo una huella (nunca el correo); un `?hoja=` sin sesión lo adopta la cuenta que entra; el defecto solo vale para una cuenta sin hoja propia |
| Ajustes decía «Registrada» y «Abrir la hoja» fallaba con «Inténtalo en un momento» | La tarjeta miraba solo si había dirección; los códigos de error no tenían mensaje | Con `ACCESO_DENEGADO`: «Sin acceso», campo abierto e indicador lateral «Sin acceso»; «Abrir la hoja» dice la causa (`ACCESO_DENEGADO`, `TOKEN_INVALIDO`, `ERROR_DESPACHO`, `FALLO_TRANSPORTE`) |

Pruebas: `hojaPorCuenta.test.ts` (el caso real paso a paso), `altaFamilia.test.ts`
(diálogo con y sin dirección verificada), `estadoHoja.test.ts`, `abrirHoja.test.ts`
y `e2e/alta-familia.e2e.ts` M5 (`?hoja=` antes de entrar) y M6 (Ajustes sin acceso).
