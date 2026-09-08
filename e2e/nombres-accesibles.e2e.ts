import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Nombres accesibles de los controles críticos (C1.2).
 *
 * La suite de axe cuenta violaciones; esta comprueba lo contrario, que es lo
 * que de verdad importa: que cada control **se puede encontrar por su nombre**,
 * igual que lo haría alguien navegando con un lector de pantalla.
 *
 * Se localiza por rol y nombre a propósito, nunca por clase CSS ni por
 * `id`: si un día el nombre accesible desaparece, estas pruebas fallan aunque
 * el elemento siga ahí.
 */

test.describe('C1.2 · nombres accesibles', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('N1 · los tres conmutadores de Ajustes se encuentran por su nombre', async ({ page }) => {
    await page.goto('/settings');

    for (const nombre of [
      'Solo importar citas futuras',
      'Bloqueo por inactividad',
      'Cierre lógico nocturno',
    ]) {
      const conmutador = page.getByRole('switch', { name: nombre });
      await expect(conmutador, nombre).toHaveCount(1);
      // Un conmutador tiene que decir además si está activado.
      await expect(conmutador).toHaveAttribute('aria-checked', /true|false/);
    }
  });

  test('N2 · el nombre del conmutador coincide con el texto visible', async ({ page }) => {
    await page.goto('/settings');

    // Se etiquetan con `aria-labelledby` apuntando al texto que ya está en
    // pantalla, no con un `aria-label` duplicado: así el nombre no puede
    // acabar diciendo algo distinto de lo que el usuario lee.
    const conmutador = page.getByRole('switch', { name: 'Bloqueo por inactividad' });
    await expect(conmutador).toHaveAttribute('aria-labelledby', /.+/);
    await expect(conmutador).not.toHaveAttribute('aria-label', /.+/);
  });

  test('N3 · el selector de rol de Ajustes tiene etiqueta asociada', async ({ page }) => {
    await page.goto('/settings');

    const selector = page.getByRole('combobox', { name: /Rol del portal actual/i });
    await expect(selector).toHaveCount(1);
    // La etiqueta visible apunta al campo, en vez de estar solo al lado.
    await expect(page.locator('label[for="simulador-rol"]')).toHaveCount(1);
  });

  test('N4 · en Recordatorios no queda ningún botón sin nombre', async ({ page }) => {
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    const sinNombre = await page.evaluate(() => {
      const nombreDe = (b: HTMLElement) =>
        (b.getAttribute('aria-label') ?? '') +
        (b.getAttribute('aria-labelledby') ?? '') +
        (b.textContent ?? '').trim();
      return Array.from(document.querySelectorAll('button'))
        .filter((b) => nombreDe(b as HTMLElement).length === 0)
        .map((b) => (b as HTMLElement).className.slice(0, 60));
    });

    expect(sinNombre, sinNombre.join(' | ')).toEqual([]);
  });

  test('N5 · el icono de estado de un recordatorio no se anuncia como control', async ({ page }) => {
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    // Ese círculo no tiene manejador propio: quien responde al clic es la
    // tarjeta entera. Anunciarlo como botón prometería una acción que no
    // existe, así que se deja como adorno y no recibe el foco.
    const focoAlcanzable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="rounded-full"][class*="shrink-0"]')).filter(
        (e) => e.tagName === 'BUTTON',
      ).length,
    );
    expect(focoAlcanzable).toBe(0);
  });
});
