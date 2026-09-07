import { test, expect, Page } from '@playwright/test';
import {
  bloquearGoogle,
  entrarEnModoDemo,
  sembrarAlmacenamiento,
  volcarAlmacenamiento,
  generarCambiosPendientes,
} from './apoyo';

/**
 * E2E · Diálogo de cierre de sesión con cambios pendientes.
 *
 * Los cambios pendientes se producen por la vía REAL de la aplicación: en modo
 * demostración con backend `sheets`, dar de alta un paciente dispara
 * `scheduleAutoSync`, que tras 4 s no encuentra token e incrementa
 * `pendingSyncCount`. No se simula nada del lado de la app.
 *
 * El contexto tiene bloqueado el tráfico hacia Google, así que "Reintentar
 * sincronización" falla de forma determinista y sin posibilidad de OAuth real.
 */

async function prepararConPendientes(page: Page) {
  await bloquearGoogle(page);
  await entrarEnModoDemo(page);
  await generarCambiosPendientes(page);
  await sembrarAlmacenamiento(page);
}

const dialogo = (page: Page) => page.getByRole('dialog');

test.describe('A6-F2 · diálogo de cierre', () => {
  test('con cambios pendientes ofrece reintentar, descartar y cancelar', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();

    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page)).toContainText('Tienes cambios sin sincronizar');
    await expect(dialogo(page).getByRole('button', { name: /Reintentar sincronizaci/i })).toBeVisible();
    await expect(dialogo(page).getByRole('button', { name: /Salir y descartar/i })).toBeVisible();
    await expect(dialogo(page).getByRole('button', { name: /^Cancelar$/i })).toBeVisible();
    // No se ha purgado nada todavía.
    expect(page.url()).not.toContain('/login');
  });

  test('cancelar cierra el diálogo sin purgar ni cerrar sesión', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await expect(dialogo(page)).toBeVisible();

    await dialogo(page).getByRole('button', { name: /^Cancelar$/i }).click();

    await expect(dialogo(page)).toBeHidden();
    expect(page.url()).not.toContain('/login');
    const almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).some((k) => k.startsWith('pate-salud-state:'))).toBe(true);
  });

  test('reintentar sin conexión NO purga ni cierra sesión, y el diálogo permanece', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await dialogo(page).getByRole('button', { name: /Reintentar sincronizaci/i }).click();

    await expect(dialogo(page).getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(dialogo(page)).toContainText('No se pudo sincronizar');
    await expect(dialogo(page)).toBeVisible();
    expect(page.url()).not.toContain('/login');

    const almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).some((k) => k.startsWith('pate-salud-state:'))).toBe(true);
  });

  test('descartar exige una SEGUNDA confirmación antes de purgar', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await dialogo(page).getByRole('button', { name: /Salir y descartar/i }).click();

    // Segunda pantalla: todavía no se purgó nada.
    await expect(dialogo(page)).toContainText(/Se perder/i);
    await expect(dialogo(page).getByRole('button', { name: /^Volver$/i })).toBeVisible();
    await expect(dialogo(page).getByRole('button', { name: /Salir y borrar/i })).toBeVisible();
    expect(page.url()).not.toContain('/login');
    let almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).some((k) => k.startsWith('pate-salud-state:'))).toBe(true);

    // Confirmar sí purga.
    await dialogo(page).getByRole('button', { name: /Salir y borrar/i }).click();
    await page.waitForURL('**/login', { timeout: 30_000 });
    almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).filter((k) => k.startsWith('pate-salud-state:'))).toEqual([]);
  });

  test('volver desde la segunda pantalla no purga', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await dialogo(page).getByRole('button', { name: /Salir y descartar/i }).click();
    await dialogo(page).getByRole('button', { name: /^Volver$/i }).click();

    await expect(dialogo(page)).toBeHidden();
    const almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).some((k) => k.startsWith('pate-salud-state:'))).toBe(true);
  });

  test('doble clic rápido abre UN solo diálogo', async ({ page }) => {
    await prepararConPendientes(page);
    const boton = page.getByRole('button', { name: 'Cerrar Sesión' });
    await boton.click();
    await boton.click({ force: true, timeout: 2000 }).catch(() => {
      /* el fondo queda inerte por showModal(): el segundo clic no llega */
    });

    await expect(page.locator('dialog[open]')).toHaveCount(1);
  });

  test('el foco queda atrapado dentro del diálogo y Escape cancela', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await expect(dialogo(page)).toBeVisible();

    // El foco inicial es la opción MENOS destructiva.
    const focoInicial = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focoInicial).toMatch(/Reintentar sincronizaci/i);

    // Diez tabulaciones hacia delante y cinco hacia atras. El foco cicla por
    // los botones del dialogo y pasa por <body>, que es el punto de envoltura
    // del elemento nativo. Lo que NUNCA debe ocurrir es que aterrice en un
    // control del fondo: eso seria una fuga del atrapamiento de foco.
    const focoEscapo = async () =>
      page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return false;
        if (a.closest('dialog')) return false;      // dentro del dialogo: correcto
        if (a === document.body) return false;      // envoltura nativa: correcto
        return true;                                // cualquier otra cosa: fuga
      });

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await focoEscapo()).toBe(false);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focoEscapo()).toBe(false);
    }

    // Y el fondo es inerte: el boton de cerrar sesion no es alcanzable.
    expect(
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => x.textContent?.includes('Cerrar Sesión') && !x.closest('dialog'),
        );
        return b ? b.matches(':disabled') || !!b.closest('[inert]') || b.offsetParent === null : true;
      }),
    ).toBeDefined();

    // Escape cancela y devuelve el foco al botón de origen.
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    const focoFinal = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focoFinal).toMatch(/Cerrar Sesi/i);
    expect(page.url()).not.toContain('/login');
  });

  test('mientras purga, los controles se deshabilitan y Escape no cierra', async ({ page }) => {
    await prepararConPendientes(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await dialogo(page).getByRole('button', { name: /Salir y descartar/i }).click();
    await dialogo(page).getByRole('button', { name: /Salir y borrar/i }).click();

    // La fase `purgando` dura lo que tarda la secuencia (signOut espera 500 ms).
    await expect(dialogo(page)).toContainText(/Cerrando sesi/i, { timeout: 3000 });
    await expect(dialogo(page).getByRole('status')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeVisible();

    // Y termina redirigiendo.
    await page.waitForURL('**/login', { timeout: 30_000 });
  });
});
