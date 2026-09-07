import { test, expect, Page } from '@playwright/test';
import {
  SINTETICOS,
  bloquearGoogle,
  entrarEnModoDemo,
  entrarComoSesionRealSimulada,
  volcarAlmacenamiento,
  generarCambiosPendientes,
} from './apoyo';

/**
 * E2E · Bloqueo de sesión veraz (A6-F3).
 *
 * CÓMO SE DISPARA EL BLOQUEO
 * ──────────────────────────
 * Quien bloquea es SIEMPRE el efecto de bloqueo nocturno de la aplicación:
 * `checkNightLock` corre al montar y llama a `lockSession()`. Lo único que
 * prepara la prueba es la CONFIGURACIÓN —una ventana horaria que contiene la
 * hora actual, escrita en la clave de preferencias— para que el bloqueo ocurra
 * de inmediato y en la pantalla que interesa.
 *
 * La alternativa —esperar al bloqueo por inactividad— exige un mínimo de un
 * minuto por prueba, por encima del tiempo de espera de Playwright.
 */

const CLAVE_BLOQUEO = 'pate:bloqueo:v1';
const CLAVE_PREFS = 'pate:prefs:v1';
const CLAVE_DEMO = 'pate-salud-state:demo';

const dialogoBloqueo = (page: Page) => page.getByRole('dialog', { name: /Sesión bloqueada/i });

/** Escribe una ventana nocturna [ahora−1 h, ahora+1 h) en las preferencias. */
async function configurarVentanaQueContieneAhora(page: Page) {
  await page.evaluate((clave) => {
    const hhmm = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const ahora = new Date();
    const prefs = JSON.parse(localStorage.getItem(clave) ?? '{}');
    prefs.nightLockEnabled = true;
    prefs.nightLockStart = hhmm(new Date(ahora.getTime() - 60 * 60 * 1000));
    prefs.nightLockEnd = hhmm(new Date(ahora.getTime() + 60 * 60 * 1000));
    localStorage.setItem(clave, JSON.stringify(prefs));
  }, CLAVE_PREFS);
}

/** Siembra un expediente sintético reconocible en el estado demo. */
async function sembrarExpediente(page: Page) {
  await page.evaluate(
    ([clave, s]) => {
      const estado = JSON.parse(localStorage.getItem(clave as string) ?? '{}');
      estado.members = [
        {
          id: 'm-e2e-1',
          familyGroupId: 'fam-demo',
          fullName: 'Paciente Sintetico A6',
          birthDate: '1990-01-01',
          relationship: 'CHILD',
          documentType: 'CC',
          documentNumber: (s as { documento: string }).documento,
          status: 'ACTIVE',
          deletedAt: null,
        },
      ];
      localStorage.setItem(clave as string, JSON.stringify(estado));
    },
    [CLAVE_DEMO, SINTETICOS] as const,
  );
}

/** Deja la app cargada en `ruta`, con expediente sembrado y ya bloqueada. */
async function prepararBloqueada(page: Page, ruta = '/members') {
  await sembrarExpediente(page);
  await configurarVentanaQueContieneAhora(page);
  await page.goto(ruta);
  await expect(dialogoBloqueo(page)).toBeVisible({ timeout: 20_000 });
}

test.describe('A6-F3 · bloqueo de sesión', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('B1 · el overlay usa el texto veraz y no promete proteger el disco', async ({ page }) => {
    await prepararBloqueada(page);
    const d = dialogoBloqueo(page);
    await expect(d).toContainText('La información se ocultó de la pantalla');
    await expect(d).not.toContainText('Tus datos están protegidos');
    await expect(d.getByRole('button', { name: /Volver al expediente/i })).toBeVisible();
  });

  test('B2 · el expediente desaparece del DOM al bloquear', async ({ page }) => {
    await sembrarExpediente(page);
    await page.goto('/members');
    await expect(page.locator('body')).toContainText('Paciente Sintetico A6');

    await configurarVentanaQueContieneAhora(page);
    await page.reload();
    await expect(dialogoBloqueo(page)).toBeVisible({ timeout: 20_000 });

    const html = await page.content();
    expect(html).not.toContain('Paciente Sintetico A6');
    expect(html).not.toContain(SINTETICOS.documento);
  });

  test('B3 · el expediente en disco queda byte a byte idéntico al bloquear', async ({ page }) => {
    await sembrarExpediente(page);
    await configurarVentanaQueContieneAhora(page);
    await page.goto('/members');
    const antes = await page.evaluate((k) => localStorage.getItem(k), CLAVE_DEMO);

    await expect(dialogoBloqueo(page)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000); // margen para que el autoguardado pudiera escribir

    const despues = await page.evaluate((k) => localStorage.getItem(k), CLAVE_DEMO);
    expect(despues).toBe(antes);
  });

  test('B3b · el marcador solo contiene tres campos y ningún identificador', async ({ page }) => {
    await prepararBloqueada(page);
    const crudo = await page.evaluate((k) => localStorage.getItem(k), CLAVE_BLOQUEO);
    expect(crudo).toBeTruthy();
    const marcador = JSON.parse(crudo!);
    expect(Object.keys(marcador).sort()).toEqual(['bloqueado', 'bloqueadoDesde', 'origen']);
    expect(marcador.origen).toBe('DEMO');
    expect(crudo!).not.toContain('@');
    expect(crudo!).not.toContain(SINTETICOS.documento);
  });

  test('B4 · no hay rehidratación mientras sigue bloqueado', async ({ page }) => {
    await prepararBloqueada(page);
    await page.waitForTimeout(3000);
    const html = await page.content();
    expect(html).not.toContain('Paciente Sintetico A6');
    await expect(dialogoBloqueo(page)).toBeVisible();
  });

  test('B5 · el desbloqueo restaura EN SITIO, sin recargar la página', async ({ page }) => {
    await prepararBloqueada(page);

    // Marca en el objeto window: si hubiera recarga, desaparecería.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sinRecargaA6 = 'marca';
    });

    await page.getByRole('button', { name: /Volver al expediente/i }).click();
    await expect(dialogoBloqueo(page)).toBeHidden({ timeout: 20_000 });

    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sinRecargaA6)).toBe('marca');
    await expect(page.locator('body')).toContainText('Paciente Sintetico A6');
  });

  test('B6 · el marcador se borra solo tras restaurar con éxito', async ({ page }) => {
    await prepararBloqueada(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_BLOQUEO)).toBeTruthy();

    await page.getByRole('button', { name: /Volver al expediente/i }).click();
    await expect(dialogoBloqueo(page)).toBeHidden({ timeout: 20_000 });

    expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_BLOQUEO)).toBeNull();
  });

  test('B7 · el bloqueo SOBREVIVE a una recarga (F5)', async ({ page }) => {
    await prepararBloqueada(page);
    await page.reload();
    await expect(dialogoBloqueo(page)).toBeVisible({ timeout: 20_000 });
    expect(await page.content()).not.toContain('Paciente Sintetico A6');
  });

  test('B8 · un marcador corrupto no desbloquea: lleva a /login', async ({ page }) => {
    await page.goto('/members');
    await page.evaluate((k) => localStorage.setItem(k, '{"bloqueado":true,"uid":"abc"}'), CLAVE_BLOQUEO);
    await page.reload();

    await page.waitForURL('**/login', { timeout: 25_000 });
    // El marcador ilegible se elimina: conservarlo dejaría la app en bucle.
    expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_BLOQUEO)).toBeNull();
  });

  test('B9 · un bloqueo de 8 horas exactas cierra la sesión con purga', async ({ page }) => {
    await sembrarExpediente(page);
    await page.goto('/members');
    await page.evaluate(
      ([k, t]) =>
        localStorage.setItem(
          k as string,
          JSON.stringify({ bloqueado: true, bloqueadoDesde: t as number, origen: 'DEMO' }),
        ),
      [CLAVE_BLOQUEO, Date.now() - 8 * 60 * 60 * 1000] as const,
    );
    await page.reload();

    await page.waitForURL('**/login', { timeout: 40_000 });
    const almacen = await volcarAlmacenamiento(page);
    expect(Object.keys(almacen).filter((k) => k.startsWith('pate-salud-state:'))).toEqual([]);
    expect(almacen[CLAVE_BLOQUEO]).toBeUndefined();
  });

  test('B10 · pendingSyncCount sobrevive al ciclo bloquear/desbloquear', async ({ page }) => {
    // Origen REAL simulado: desde A6-F3 el modo DEMO no genera pendientes.
    await entrarComoSesionRealSimulada(page);
    await generarCambiosPendientes(page);

    // El bloqueo se provoca SIN recargar: una recarga borraria el contador en
    // memoria antes del bloqueo y la prueba no demostraria nada. Se navega por
    // el enrutado del cliente y se usan los controles reales de Ajustes.
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await expect(page.getByRole('heading', { name: /Configuraci/i })).toBeVisible();

    const hhmm = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const ahora = new Date();
    await page.locator('#btn-toggle-nightlock').click();
    await page.locator('#nightlock-start').fill(hhmm(new Date(ahora.getTime() - 3600_000)));
    await page.locator('#nightlock-end').fill(hhmm(new Date(ahora.getTime() + 3600_000)));

    await expect(dialogoBloqueo(page)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Volver al expediente/i }).click();
    await expect(dialogoBloqueo(page)).toBeHidden({ timeout: 20_000 });

    // Si el contador hubiera vuelto a cero, el cierre purgaria sin avisar.
    // El localizador se acota a la barra lateral: en /settings hay varios
    // botones cuyo nombre contiene "Cerrar sesion".
    await page.locator('aside').getByRole('button', { name: 'Cerrar Sesión' }).click();
    await expect(page.getByRole('dialog')).toContainText('Tienes cambios sin sincronizar');
  });
});
