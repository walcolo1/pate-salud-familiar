import { test, expect, type Page } from '@playwright/test';
import { bloquearGoogle, entrarComoSesionRealSimulada } from './apoyo';

/**
 * Bloque M · alguien que no pertenece a la familia de la hoja.
 *
 * Ve qué hacer —me invitaron / crear el de mi familia— en lugar de un error
 * técnico, y la guía de alta no enseña la plantilla hasta que autoriza el
 * tratamiento de datos de salud.
 */

const BACKEND = 'https://script.google.com/macros/s/AKfycbSINTETICO0123456789abcd/exec';

async function hojaQueNoLeConoce(page: Page) {
  await page.route(/script\.google\.com\/macros\//, async (ruta) => {
    let accion = '';
    try {
      accion = String(JSON.parse(ruta.request().postData() || '{}').accion);
    } catch {
      /* sin cuerpo */
    }
    const cuerpo = accion === 'ping' ? { ok: true, data: { version: 'e7', esquema: 6 } } : { ok: false, error: 'ACCESO_DENEGADO' };
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
}

test.describe('Alta de una familia nueva', () => {
  test('M1 · una cuenta sin acceso ve los dos caminos, no un error', async ({ page }) => {
    await bloquearGoogle(page);
    await hojaQueNoLeConoce(page);
    await entrarComoSesionRealSimulada(page);
    // Con credencial (un ticket sintético): sin ella la app ni pregunta a la
    // hoja, y la hoja nunca llega a decir que esta cuenta no está en ACCESO.
    await page.evaluate((url) => {
      const b64 = (t: string) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const ahora = Date.now();
      const carga = { v: 1, h: 'huella-sintetica-de-pruebas-0123456789', iat: ahora, exp: ahora + 29 * 24 * 3600 * 1000 };
      localStorage.setItem('pate:familia:v1', url);
      localStorage.setItem('pate:sesion:v1', JSON.stringify({ v: 1, t: 'pt1.' + b64(JSON.stringify(carga)) + '.firma' }));
    }, BACKEND);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Esta cuenta todavía no tiene un expediente aquí' })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole('heading', { name: 'Me invitaron' })).toBeVisible();
    await expect(page.getByText('No se pudo descargar el expediente')).toHaveCount(0);

    await page.getByRole('link', { name: 'Crear el expediente de mi familia' }).click();
    await expect(page).toHaveURL(/\/crear-expediente$/);
    await expect(page.getByRole('heading', { name: 'Crea el expediente de tu familia' })).toBeVisible();
  });

  test('M2 · la plantilla solo aparece tras autorizar el tratamiento de datos de salud', async ({ page }) => {
    await bloquearGoogle(page);
    await page.goto('/crear-expediente');

    const enlace = page.getByRole('link', { name: /Hacer mi copia de la plantilla/ });
    await expect(enlace).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Autorizo el tratamiento/ }).check();
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/copy$/);
    await expect(enlace).toHaveAttribute('target', '_blank');
  });

  test('M3 · la entrada lleva a la guía de alta', async ({ page }) => {
    await bloquearGoogle(page);
    await page.goto('/login');
    await page.getByRole('button', { name: /Crea su expediente/ }).click();
    await expect(page).toHaveURL(/\/crear-expediente$/);
  });

  test('M4 · la configuración pública solo dice lo público', async ({ request }) => {
    const r = await request.get('/api/configuracion');
    expect(r.ok()).toBe(true);
    const cuerpo = await r.json();
    expect(cuerpo.app).toBe('pate');
    expect(Object.keys(cuerpo).sort()).toEqual(['app', 'clientId']);
  });
});

test.describe('Bloque M2 · la hoja de cada cuenta', () => {
  const PROPIA = 'https://script.google.com/macros/s/AKfycbPROPIA_familia_nueva_0123456/exec';

  test('M5 · un ?hoja= abierto antes de entrar es la hoja de la cuenta que entra', async ({ page }) => {
    await bloquearGoogle(page);
    const destinos: string[] = [];
    await page.route(/script\.google\.com\/macros\//, async (ruta) => {
      const url = ruta.request().url();
      let accion = '';
      try {
        accion = String(JSON.parse(ruta.request().postData() || '{}').accion);
      } catch {
        /* sin cuerpo */
      }
      destinos.push(url);
      const datos: Record<string, unknown> = {
        ping: { version: 'e7', esquema: 6 },
        exportar: { esquema: 6, revision: 1, tablas: {} },
        obtenerRevision: { revision: 1 },
      };
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: datos[accion] ?? {} }),
      });
    });

    await page.goto(`/login?hoja=${encodeURIComponent(PROPIA)}`);
    await expect(page.getByText('Hoja de la familia conectada desde el enlace.')).toBeVisible({ timeout: 25_000 });

    await entrarComoSesionRealSimulada(page);
    await page.evaluate(() => {
      const b64 = (t: string) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const ahora = Date.now();
      const carga = { v: 1, h: 'huella-sintetica-de-pruebas-0123456789', iat: ahora, exp: ahora + 29 * 24 * 3600 * 1000 };
      localStorage.setItem('pate:sesion:v1', JSON.stringify({ v: 1, t: 'pt1.' + b64(JSON.stringify(carga)) + '.firma' }));
    });
    destinos.length = 0;
    await page.goto('/dashboard');
    await expect.poll(() => destinos.length, { timeout: 25_000 }).toBeGreaterThan(0);
    expect(destinos.every((d) => d.startsWith(PROPIA)), destinos.join('\n')).toBe(true);
  });

  test('M6 · sin acceso, Ajustes no dice «Registrada» y abre el campo', async ({ page }) => {
    await bloquearGoogle(page);
    await hojaQueNoLeConoce(page);
    await entrarComoSesionRealSimulada(page);
    await page.evaluate((url) => {
      const b64 = (t: string) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const ahora = Date.now();
      const carga = { v: 1, h: 'huella-sintetica-de-pruebas-0123456789', iat: ahora, exp: ahora + 29 * 24 * 3600 * 1000 };
      localStorage.setItem('pate:familia:v1', url);
      localStorage.setItem('pate:sesion:v1', JSON.stringify({ v: 1, t: 'pt1.' + b64(JSON.stringify(carga)) + '.firma' }));
    }, BACKEND);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Esta cuenta todavía no tiene un expediente aquí' })).toBeVisible({
      timeout: 25_000,
    });

    await page.goto('/settings');
    const tarjeta = page.locator('#hoja-familiar');
    await expect(tarjeta.getByText('Sin acceso')).toBeVisible({ timeout: 25_000 });
    await expect(tarjeta.getByText('Registrada')).toHaveCount(0);
    await expect(tarjeta.getByRole('textbox')).toBeVisible();
  });
});
