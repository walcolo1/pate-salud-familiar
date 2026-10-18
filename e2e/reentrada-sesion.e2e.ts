import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarComoSesionRealSimulada, entrarEnModoDemo } from './apoyo';

/**
 * Cierre del Bloque H · una sesión sin credencial lo dice.
 *
 * El usuario está en el almacenamiento, pero el `id_token` no —vive en
 * memoria y una recarga lo tira— y GIS no está (tráfico a Google bloqueado),
 * así que no puede devolverlo. Antes: silencio, «Mi familia (0)» y «La sesión
 * caducó» al pulsar cualquier cosa. Ahora: el aviso de volver a entrar.
 *
 * Sin OAuth real: que el botón de Google entregue la credencial y el
 * expediente cargue lo cubre `cicloEntrada.test.ts` con las piezas de verdad.
 */

const BACKEND = 'https://script.google.com/macros/s/AKfycbSINTETICO0123456789abcd/exec';

test('sin credencial, aparece el aviso de volver a entrar', async ({ page }) => {
  await bloquearGoogle(page);
  await entrarComoSesionRealSimulada(page);
  await page.evaluate((url) => localStorage.setItem('pate:familia:v1', url), BACKEND);
  await page.reload();

  await expect(page.getByText('Tu sesión de Google no está activa')).toBeVisible({ timeout: 20_000 });
  // No es el aviso de la hoja: la hoja está registrada.
  await expect(page.getByText('Este navegador no sabe dónde está la hoja')).toHaveCount(0);
});

test('en modo demostración no se pide entrar con Google', async ({ page }) => {
  await bloquearGoogle(page);
  await entrarEnModoDemo(page);
  await page.waitForTimeout(12_000);
  await expect(page.getByText('Tu sesión de Google no está activa')).toHaveCount(0);
});

/**
 * Sesión persistente · con un ticket guardado, un F5 no pide volver a entrar.
 *
 * GIS sigue bloqueado: no hay `id_token` posible. Lo único que hay es el
 * ticket de la visita anterior. El backend se simula (la firma la comprueba el
 * de verdad; aquí se mira el cliente): que no salga el aviso, y que las
 * peticiones vayan firmadas con el ticket.
 */
test('con sesión persistente, un F5 no pide volver a entrar', async ({ page }) => {
  const firmas: string[] = [];
  await bloquearGoogle(page);
  await page.route(/script\.google\.com\/macros\//, async (ruta) => {
    let cuerpo: { idToken?: string; accion?: string } = {};
    try {
      cuerpo = JSON.parse(ruta.request().postData() || '{}');
    } catch {
      /* sin cuerpo */
    }
    firmas.push(String(cuerpo.idToken || ''));
    const datos: Record<string, unknown> = {
      exportar: { esquema: 5, revision: 1, tablas: {} },
      obtenerRevision: { revision: 1 },
      listarPacientes: { filas: [], revision: 1 },
    };
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: datos[String(cuerpo.accion)] ?? {} }),
    });
  });

  await entrarComoSesionRealSimulada(page);
  await page.evaluate((url) => {
    const b64 = (t: string) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const ahora = Date.now();
    const carga = { v: 1, h: 'huella-sintetica-de-pruebas-0123456789', iat: ahora, exp: ahora + 29 * 24 * 3600 * 1000 };
    const ticket = 'pt1.' + b64(JSON.stringify(carga)) + '.firma-sintetica';
    localStorage.setItem('pate:familia:v1', url);
    localStorage.setItem('pate:sesion:v1', JSON.stringify({ v: 1, t: ticket }));
  }, BACKEND);

  await page.reload();
  await page.waitForTimeout(12_000);
  await expect(page.getByText('Tu sesión de Google no está activa')).toHaveCount(0);
  expect(firmas.length, 'la aplicación no habló con la hoja').toBeGreaterThan(0);
  for (const f of firmas) expect(f.startsWith('pt1.')).toBe(true);

  // Y otra vez: cerrar y abrir la PWA es lo mismo que esto.
  await page.reload();
  await page.waitForTimeout(12_000);
  await expect(page.getByText('Tu sesión de Google no está activa')).toHaveCount(0);
});
