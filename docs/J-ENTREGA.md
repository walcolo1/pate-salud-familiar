# Bloque J — Cierre para entrega (v1.0.0)

Lo que se hizo en el bloque, y las dos listas que hacen falta para entregar:
actualizar la hoja oficial y desplegar la web.

---

## Lo que se hizo

**Tareas de seguimiento con pestaña (esquema v5).** Hasta aquí estaban en
`SIN_PESTANA`: solo vivían en el navegador y se perdían al cerrar sesión. Ahora
tienen la pestaña `TAREAS` (`id`, `paciente_id`, `titulo`, `descripcion`,
`fecha_limite`, `estado`, `prioridad` y las columnas de cierre). No es
`SEGUIMIENTOS`: aquella habla de los envíos que genera una orden. El verbo es
el de los recordatorios (`ESCRIBIR_CITA`). La v4 quedó congelada en
`scripts/esquema-v4.json`, y una prueba comprueba que a una hoja en v4 —como la
oficial— `instalar()` solo le añade `TAREAS`.

> Hoy ninguna pantalla **crea** tareas en modo real: la pestaña «Tareas» de
> Alertas lista y marca como hechas las que existen (de la demo o de una copia
> importada). La persistencia está lista para cuando se añada el alta.

**Borradores de citas importadas, locales y dicho.** Siguen sin pestaña, y la
pantalla de importar lo avisa donde se crean.

**Limpieza:** los 10 `alert()` pasan al sistema de avisos (`sinAlert.test.ts`
impide que vuelvan); `/login` y `/members/:id/edit` entran en la red de axe;
sale el campo `documentoId` del historial veterinario, que nada rellenaba ni
tenía columna; la tabla de deuda de `ESTADO_PROYECTO.md` queda solo con lo
abierto.

**Documentación:** `manual-usuario.md` reescrito (alta de una familia, guardado
automático, avisos, actualización de la hoja); `INSTALACION.md` al día (22
pestañas, enlace en Ajustes, actualizar sin cambiar la URL); notas de versión en
`release-v1.0.0.md`.

---

## 1 · Actualizar la hoja oficial a v5

La hoja **«Paté · Salud Familiar — Oficial»** está en v4. Hasta hacer esto, la
web sigue funcionando, pero marcar una tarea como hecha lo rechaza la hoja
(no conoce `TAREAS`) y se deshace en pantalla.

1. Abre la hoja oficial ▸ **Extensiones ▸ Apps Script**.
2. Borra los ficheros `.gs` que haya, crea uno llamado **`Pate`** y pega el
   contenido de `apps-script/dist/Pate.gs`. Guarda. (El manifiesto
   `appsscript.json` no cambia.)
3. En la hoja, **Paté ▸ Instalar o actualizar**. Debe crear la pestaña
   `TAREAS` y dejar `version_esquema` = **5** en `CONFIG`. No toca nada más.
4. En Apps Script, **Implementar ▸ Administrar implementaciones ▸ ✏ Editar** la
   implementación actual ▸ **Versión: Nueva versión** ▸ **Implementar**. La URL
   `/exec` **no cambia**: ningún navegador tiene que volver a enlazarla.

> No uses «Nueva implementación»: daría otra URL, y todos los navegadores
> seguirían hablando con el programa anterior.

**Comprobación:** en la PWA, marca una tarea como hecha y mira la pestaña
`TAREAS`: tiene que aparecer una fila nueva al final.

## 2 · Desplegar la web en Vercel (Google OAuth en modo Testing)

### Proyecto en Vercel

| Ajuste | Valor |
|---|---|
| Root Directory | *(vacío: la raíz del repo; `package.json` está en la raíz de GitHub)* |
| Framework | Next.js |
| Build Command | `npm run build` (el del proyecto: `next build --webpack`) |
| Output | por defecto |

### Variables de entorno

| Variable | Valor | Entornos |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | el ID de cliente OAuth «Aplicación web» (`…apps.googleusercontent.com`) | Production (y Preview si quieres probar ahí) |

**Ninguna más.** No hay `NEXT_PUBLIC_FIREBASE_*` (retiradas en G5) ni secretos:
todo `NEXT_PUBLIC_*` queda visible en el navegador, y el client ID es público
por diseño. La URL `/exec` de cada familia **no** va en variables: se registra
en Ajustes de cada navegador.

### Cliente OAuth en Google Cloud (Google Auth Platform ▸ Clientes)

- **Orígenes de JavaScript autorizados:** añade el dominio de producción
  exacto, p. ej. `https://pate-salud-familiar.vercel.app`, y conserva
  `http://localhost:3000` para desarrollo. Sin barra final ni ruta.
- **URI de redirección:** no hace falta ninguno. GIS usa ventana emergente y
  FedCM, no redirecciones.
- Los despliegues de **Preview** de Vercel tienen URLs que cambian: no pueden
  iniciar sesión salvo que añadas cada una. Lo práctico es validar en
  Production o en un dominio de Preview fijo.

### Público de la app OAuth (Google Auth Platform ▸ Público)

- **Estado de publicación: Testing.** Se mantiene a propósito.
  `calendar.events` es un permiso sensible: pasar a «In production» exigiría la
  verificación de Google, desproporcionada para una app familiar.
- **Usuarios de prueba:** añade el Gmail de **cada** familiar que vaya a entrar
  (titular incluido). Máximo 100. Quien no esté en la lista no puede entrar.
- **Permisos declarados:** `openid`, `.../auth/userinfo.email`,
  `.../auth/userinfo.profile`, `.../auth/drive.file`,
  `.../auth/calendar.events`. Ni `spreadsheets` ni `drive.appdata` (retirados
  en G5).

### El Web App no cambia con el dominio

El Web App de Apps Script verifica el `aud` del `id_token` contra el client ID,
no contra el dominio. Mientras el client ID sea el mismo, desplegar en Vercel no
obliga a tocar la hoja.

### Comprobación tras desplegar

1. Abre el dominio de producción y entra con tu cuenta.
2. **Ajustes ▸ Hoja de la familia**: enlaza la URL `/exec` (en ese navegador es
   un origen nuevo, así que no la tiene guardada).
3. Tiene que salir «Trayendo el expediente…» y después tu familia.
4. En DevTools ▸ Console no debe haber violaciones de CSP.
