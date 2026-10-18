import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarComoSesionRealSimulada, entrarEnModoDemo, SINTETICOS } from './apoyo';

/**
 * Ajustes depurado: lo de todos los días a la vista, lo técnico plegado y
 * nada que hable de una arquitectura que ya no existe.
 */

test.describe('Ajustes depurado', () => {
  test('S1 · con la hoja registrada, la dirección queda plegada detrás de un botón', async ({ page }) => {
    await bloquearGoogle(page);
    await entrarComoSesionRealSimulada(page);
    await page.evaluate((url) => localStorage.setItem('pate:familia:v1', url), SINTETICOS.backend);
    await page.goto('/settings');

    const tarjeta = page.locator('#hoja-familiar');
    await expect(tarjeta.getByText('Registrada')).toBeVisible({ timeout: 20_000 });
    await expect(tarjeta.getByRole('button', { name: /Abrir la hoja/ })).toBeVisible();
    await expect(tarjeta.getByRole('button', { name: 'Comprobar y guardar' })).toHaveCount(0);
    await expect(tarjeta.getByRole('textbox')).toHaveCount(0);

    await tarjeta.getByRole('button', { name: 'Cambiar dirección de la hoja' }).click();
    await expect(tarjeta.getByRole('textbox')).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Cancelar' }).click();
    await expect(tarjeta.getByRole('textbox')).toHaveCount(0);
  });

  test('S2 · sin restos de la arquitectura anterior', async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Ajustes', level: 2 })).toBeVisible();

    const cuerpo = page.locator('body');
    await expect(cuerpo).not.toContainText('Copia en Drive');
    await expect(cuerpo).not.toContainText('Drive Synced');
    await expect(cuerpo).not.toContainText('Conectado:');
    await expect(cuerpo).not.toContainText('Compartición de Archivos');
    await expect(cuerpo).not.toContainText('SaludFamiliar_OperationalDB');
    await expect(cuerpo).not.toContainText('se guardan localmente en este navegador');
    // Una sola forma de cerrar sesión en Ajustes.
    await expect(page.locator('main').getByRole('button', { name: /Cerrar sesión/i })).toHaveCount(1);
  });

  test('S3 · lo técnico está plegado y se abre', async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
    await page.goto('/settings');

    await expect(page.getByRole('button', { name: /Exportar Copia/i })).toBeHidden();
    await page.locator('#herramientas-avanzadas summary').click();
    await expect(page.getByRole('button', { name: /Exportar Copia/i })).toBeVisible();
  });

  test('S4 · la barra lateral habla de la hoja, no de Drive', async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
    await page.goto('/dashboard');
    const lateral = page.locator('aside');
    await expect(lateral).toContainText('Hoja familiar');
    await expect(lateral).toContainText('Demostración');
    await expect(lateral).not.toContainText('Copia en Drive');
  });
});
