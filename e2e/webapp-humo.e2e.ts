import { test, expect, Page } from '@playwright/test';

/**
 * E2E · Sonda del Web App de humo (Bloque E, E0-bis).
 *
 * POR QUÉ ESTO Y NO UN `curl` NI UN `Invoke-RestMethod`
 * ─────────────────────────────────────────────────────
 * La pregunta no es «¿responde el servidor?» sino «¿deja el NAVEGADOR leer la
 * respuesta?». La política de origen cruzado y la CSP solo existen dentro de un
 * navegador: `curl`, `fetch` de Node y `Invoke-RestMethod` de PowerShell dicen
 * que sí a cosas que en la PWA fallan. Un 200 en una terminal no es evidencia
 * de nada sobre el navegador.
 *
 * Y hay DOS muros distintos, que se confunden con facilidad porque el error es
 * el mismo —`TypeError: Failed to fetch`— en los dos casos:
 *
 *   · **CORS**, del lado de Google: ¿autoriza la respuesta a otro origen?
 *   · **CSP**, de nuestro lado: ¿permite `connect-src` hablar con ese host?
 *
 * Estas pruebas los separan, porque la corrección es distinta en cada caso.
 *
 * SE SALTA SOLA
 * ─────────────
 * Sin `URL_WEBAPP_HUMO` no hay nada que sondear y se marca omitida. No falla:
 * una prueba roja por falta de configuración enseña a ignorar el rojo.
 *
 *   URL_WEBAPP_HUMO="https://script.google.com/macros/s/…/exec" npx playwright test e2e/webapp-humo.e2e.ts --project=app
 *
 * NINGÚN DATO REAL viaja en estas peticiones.
 */

const URL_WEBAPP = process.env.URL_WEBAPP_HUMO ?? '';

/** Lo que devuelve el `doPost` de humo. Todo opcional: el script puede variar. */
interface RespuestaHumo {
  ok?: boolean;
  metodo?: string;
  accion?: string;
  mensaje?: string;
  usuarioActivo?: string;
  usuarioEfectivo?: string;
}

interface ResultadoSonda {
  fallo: string | null;
  estado: number | null;
  cuerpo: string | null;
}

/** Página sin CSP, servida por Playwright en el mismo origen que la aplicación. */
const RUTA_SIN_CSP = '/sonda-sin-csp';

/**
 * Deja la página en un origen real pero **sin** la CSP de la aplicación.
 *
 * La respuesta la cumplimenta Playwright, así que las cabeceras del servidor
 * —incluida `Content-Security-Policy`— no llegan. Es el aislante que permite
 * preguntar por CORS sin que la CSP conteste primero.
 */
async function abrirPaginaSinCSP(page: Page) {
  await page.route(`**${RUTA_SIN_CSP}`, (ruta) =>
    ruta.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>sonda</title><p>sonda sin CSP</p>',
    }),
  );
  await page.goto(RUTA_SIN_CSP);
}

/** Hace el `fetch` dentro de la página y recoge lo que pasó. */
function sondear(page: Page, url: string, tipoContenido: string): Promise<ResultadoSonda> {
  return page.evaluate<ResultadoSonda, { url: string; tipo: string }>(async ({ url: u, tipo }) => {
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': tipo },
        body: JSON.stringify({ accion: 'ping' }),
      });
      return { fallo: null, estado: r.status, cuerpo: await r.text() };
    } catch (e) {
      return { fallo: String(e), estado: null, cuerpo: null };
    }
  }, { url, tipo: tipoContenido });
}

test.describe('E0-bis · Web App de humo', () => {
  test.skip(
    URL_WEBAPP === '',
    'Falta URL_WEBAPP_HUMO: la implementación de humo aún no existe o no se ha pegado su URL.',
  );

  test('E0b-1 · Google sí autoriza el origen cruzado con text/plain', async ({ page }) => {
    // Sin la CSP de la aplicación por delante, lo único que puede bloquear es
    // CORS. Si esto pasa, el lado de Google está bien.
    await abrirPaginaSinCSP(page);
    const resultado = await sondear(page, URL_WEBAPP, 'text/plain;charset=utf-8');

    expect(resultado.fallo, `CORS bloqueó la petición: ${resultado.fallo}`).toBeNull();
    expect(resultado.estado).toBe(200);

    const cuerpo = JSON.parse(resultado.cuerpo ?? '{}') as RespuestaHumo;
    expect(cuerpo.ok, 'el Web App no devolvió ok').toBe(true);
    expect(cuerpo.accion, 'el cuerpo JSON no llegó entero').toBe('ping');
  });

  test('E0b-2 · application/json TAMBIÉN cruza: el preflight ya no es el muro de 2025', async ({
    page,
  }) => {
    // Esta prueba nació al revés. La especificación (§7, punto 22)
    // da por hecho que `application/json` dispara un preflight `OPTIONS`, que un
    // Web App de Apps Script no sabe responder, y que la petición muere ahí.
    //
    // Medido el 2026-09-11 contra una implementación real: **no muere**. Google
    // responde al preflight. La regla del `text/plain` sigue siendo prudente
    // —es lo que funciona con seguridad y no cuesta nada— pero ha dejado de ser
    // obligatoria, y conviene saberlo antes de construir E7 sobre una creencia
    // caducada.
    //
    // Se deja como cable trampa: si Google revierte, esta prueba se pone roja y
    // avisa antes que un usuario.
    await abrirPaginaSinCSP(page);
    const resultado = await sondear(page, URL_WEBAPP, 'application/json');

    expect(
      resultado.fallo,
      'application/json volvió a fallar: Google revirtió el preflight y hay que atarse a text/plain como manda el punto 22',
    ).toBeNull();
    expect(resultado.estado).toBe(200);
  });

  test('E0b-3 · desde la aplicación real, con su CSP puesta, el fetch llega', async ({ page }) => {
    // Esta es la prueba que de verdad importa: las dos anteriores miden el lado
    // de Google desde una página sin CSP, y esta mide la aplicación entera tal
    // y como se sirve.
    //
    // Nació roja. Antes de E0-bis, `connect-src` no incluía `script.google.com`
    // y el navegador cortaba la conexión con el mismo `TypeError: Failed to
    // fetch` que produce un fallo de CORS, que es lo que hacía falta distinguir.
    // Si alguien vuelve a cerrar el host, esta prueba lo dice, y el mensaje
    // señala el sitio exacto.
    const consola: string[] = [];
    page.on('console', (m) => consola.push(m.text()));

    await page.goto('/login');
    const resultado = await sondear(page, URL_WEBAPP, 'text/plain;charset=utf-8');

    const violacionCSP = consola.filter(
      (t) => /Content Security Policy/i.test(t) && /connect-src/i.test(t),
    );
    expect(
      violacionCSP.length,
      `la CSP bloqueó la conexión: falta https://script.google.com en connect-src (next.config.ts). Consola: ${violacionCSP.join(' | ')}`,
    ).toBe(0);

    expect(resultado.fallo, `el navegador bloqueó la petición: ${resultado.fallo}`).toBeNull();
    expect(resultado.estado).toBe(200);

    const cuerpo = JSON.parse(resultado.cuerpo ?? '{}') as RespuestaHumo;
    expect(cuerpo.ok).toBe(true);
  });

  test('E0b-4 · el usuario activo viene vacío y el efectivo es un correo', async ({ page }) => {
    // Sostiene toda la autenticación del Bloque E: si `Session` sirviera para
    // saber quién llama, no haría falta verificar el `id_token`.
    //
    // Solo se puede comprobar si el script desplegado es el de este repositorio
    // (`apps-script/humo/Codigo.gs`), que devuelve las dos identidades. Con otro
    // script, se omite en vez de inventar un resultado.
    await abrirPaginaSinCSP(page);
    const resultado = await sondear(page, URL_WEBAPP, 'text/plain;charset=utf-8');
    expect(resultado.fallo).toBeNull();

    const cuerpo = JSON.parse(resultado.cuerpo ?? '{}') as RespuestaHumo;
    test.skip(
      cuerpo.usuarioActivo === undefined,
      'El Web App desplegado no devuelve identidades: no es el Codigo.gs de este repositorio.',
    );

    expect(
      cuerpo.usuarioActivo,
      'getActiveUser() devolvió algo: contradice la documentación y habría que rehacer el análisis de identidad',
    ).toBe('');

    // El correo del titular NO se afirma tal cual: si la prueba falla,
    // Playwright imprime el valor recibido y acabaría pegado en un informe. Se
    // comprueba su forma, no su contenido.
    const efectivoEsUnCorreo = /^[^@\s]+@[^@\s]+$/.test(cuerpo.usuarioEfectivo ?? '');
    expect(efectivoEsUnCorreo, 'getEffectiveUser() debería devolver un correo').toBe(true);
  });
});
