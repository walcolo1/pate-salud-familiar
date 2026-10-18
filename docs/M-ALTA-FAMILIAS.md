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
