import { test, expect, type Page } from '@playwright/test';
import { bloquearGoogle, entrarComoSesionRealSimulada } from './apoyo';

/**
 * Bloque L · las invitaciones salen de verdad y su lista es la de la hoja.
 *
 * El backend se simula: aquí se mira el cliente. Que `invitar` llegue al
 * /exec con el origen de la PWA (de ahí sale el enlace del correo), que la
 * lista de Ajustes sea la de `listarAccesos` y que un error se diga en
 * castellano, no como un código.
 */

const BACKEND = 'https://script.google.com/macros/s/AKfycbSINTETICO0123456789abcd/exec';

async function simularHoja(page: Page, opciones: { falloInvitar?: string } = {}) {
  const enviados: { accion: string; payload: Record<string, unknown> }[] = [];
  const accesos = [{ email: 'eva@example.com', rol: 'CUIDADOR', pacientes: '*', estado: 'ACEPTADA' }];
  await page.route(/script\.google\.com\/macros\//, async (ruta) => {
    let cuerpo: { accion?: string; payload?: Record<string, unknown> } = {};
    try {
      cuerpo = JSON.parse(ruta.request().postData() || '{}');
    } catch {
      /* sin cuerpo */
    }
    const accion = String(cuerpo.accion);
    enviados.push({ accion, payload: cuerpo.payload ?? {} });
    if (accion === 'invitar' && opciones.falloInvitar) {
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: opciones.falloInvitar }) });
      return;
    }
    if (accion === 'invitar') {
      accesos.push({ email: String(cuerpo.payload?.email), rol: String(cuerpo.payload?.rol), pacientes: String(cuerpo.payload?.pacientes), estado: 'PENDIENTE' });
    }
    const datos: Record<string, unknown> = {
      exportar: {
        esquema: 6,
        revision: 1,
        tablas: { PACIENTES: [['m-ana', 'HUMANO', 'Ana Prueba', 'CHILD', 'ACTIVE', '', '', '', '', '']] },
      },
      obtenerRevision: { revision: 1 },
      listarPacientes: { filas: [], revision: 1 },
      invitar: { invitada: true, expiraEn: 7 },
      listarAccesos: { accesos },
    };
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: datos[accion] ?? {} }),
    });
  });
  return enviados;
}

async function entrarConHoja(page: Page) {
  await entrarComoSesionRealSimulada(page);
  await page.evaluate((url) => {
    const b64 = (t: string) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const ahora = Date.now();
    const carga = { v: 1, h: 'huella-sintetica-de-pruebas-0123456789', iat: ahora, exp: ahora + 29 * 24 * 3600 * 1000 };
    localStorage.setItem('pate:familia:v1', url);
    localStorage.setItem('pate:sesion:v1', JSON.stringify({ v: 1, t: 'pt1.' + b64(JSON.stringify(carga)) + '.firma' }));
  }, BACKEND);
}

test.describe('Invitaciones reales', () => {
  test('I1 · la lista de Ajustes es la de la hoja, e invitar llega al /exec con el origen', async ({ page }) => {
    await bloquearGoogle(page);
    const enviados = await simularHoja(page);
    await entrarConHoja(page);
    await page.goto('/settings#invitaciones');

    const tarjeta = page.locator('#invitaciones');
    await expect(tarjeta.getByText('eva@example.com')).toBeVisible({ timeout: 25_000 });

    await tarjeta.getByLabel('Correo Electrónico').fill('nueva@example.com');
    await tarjeta.getByLabel('Asociar a Familiar').selectOption({ label: 'Ana Prueba' });
    await tarjeta.getByRole('button', { name: 'Enviar Invitación' }).click();

    await expect(tarjeta.getByText('nueva@example.com')).toBeVisible({ timeout: 15_000 });
    const invitar = enviados.find((e) => e.accion === 'invitar');
    expect(invitar?.payload.email).toBe('nueva@example.com');
    expect(invitar?.payload.rol).toBe('MIEMBRO');
    expect(invitar?.payload.pacientes).toBe('m-ana');
    expect(String(invitar?.payload.origen)).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  });

  test('I2 · si la hoja la rechaza, se dice en castellano y no como un código', async ({ page }) => {
    await bloquearGoogle(page);
    await simularHoja(page, { falloInvitar: 'ERROR_DESPACHO' });
    await entrarConHoja(page);
    await page.goto('/settings#invitaciones');

    const tarjeta = page.locator('#invitaciones');
    await expect(tarjeta.getByLabel('Asociar a Familiar')).toBeVisible({ timeout: 25_000 });
    await tarjeta.getByLabel('Correo Electrónico').fill('nueva@example.com');
    await tarjeta.getByLabel('Asociar a Familiar').selectOption({ label: 'Ana Prueba' });
    await tarjeta.getByRole('button', { name: 'Enviar Invitación' }).click();

    await expect(tarjeta.getByText(/el correo no salió/)).toBeVisible({ timeout: 15_000 });
    await expect(tarjeta).not.toContainText('ERROR_DESPACHO');
  });

  test('I3 · Ajustes ofrece copiar el enlace directo de la hoja', async ({ page }) => {
    await bloquearGoogle(page);
    await simularHoja(page);
    await entrarConHoja(page);
    await page.goto('/settings');
    await expect(
      page.locator('#hoja-familiar').getByRole('button', { name: 'Copiar enlace para otro dispositivo' }),
    ).toBeVisible({ timeout: 25_000 });
  });
});
