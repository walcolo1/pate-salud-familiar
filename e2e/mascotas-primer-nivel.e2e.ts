import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * Mascotas en primer nivel.
 *
 * Antes solo se llegaba a ellas desde la ficha de un familiar, y había que
 * saber que estaban allí. Ahora: entrada propia en la navegación, bloque en el
 * panel principal, acceso desde Familia, y alta directa eligiendo quién está a
 * cargo. Ningún nombre de aquí es de un animal real.
 */

test.describe('Mascotas en primer nivel', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('P1 · hay entrada a Mascotas en la navegación, el panel y Familia', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Mascotas' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Mis mascotas/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Añadir mascota/i }).first()).toBeVisible();

    await page.goto('/members');
    await page.getByRole('link', { name: /Mascotas/ }).filter({ hasText: /activa|Registra/ }).click();
    await page.waitForURL('**/mascotas');
    await expect(page.getByRole('heading', { name: 'Mascotas', level: 1 })).toBeVisible();
  });

  test('P2 · se registra una mascota desde el panel principal, con su responsable', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /Añadir mascota/i }).first().click();
    await page.waitForURL('**/mascotas**');

    const dialogo = page.getByRole('dialog', { name: 'Registrar mascota' });
    await expect(dialogo).toBeVisible({ timeout: 15_000 });
    const responsable = dialogo.getByLabel('A cargo de');
    await expect(responsable).toBeVisible();
    // El titular va primero y es el valor por omisión.
    await expect(responsable.locator('option').first()).toContainText('(titular)');

    await dialogo.getByLabel('Nombre').fill('MASCOTA-PRIMER-NIVEL');
    await dialogo.getByLabel('Especie').selectOption('PERRO');
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(dialogo).toBeHidden();

    // Un clic a peso, vacunas e historial.
    await expect(page.getByText('MASCOTA-PRIMER-NIVEL')).toBeVisible();
    await expect(page.getByText(/A cargo de /).first()).toBeVisible();
    await page.getByRole('link', { name: 'Ver el peso de MASCOTA-PRIMER-NIVEL' }).click();
    await page.waitForURL(/\/members\/[^/]+\/pets\/[^/]+\/peso$/);

    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /MASCOTA-PRIMER-NIVEL/ })).toBeVisible();
  });

  test('P3 · el alta directa no se reabre con un F5', async ({ page }) => {
    await page.goto('/mascotas?nueva=1');
    await expect(page.getByRole('dialog', { name: 'Registrar mascota' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/mascotas$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mascotas', level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Registrar mascota' })).toHaveCount(0);
  });
});
