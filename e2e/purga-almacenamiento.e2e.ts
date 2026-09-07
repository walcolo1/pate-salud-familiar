import { test, expect } from '@playwright/test';
import {
  SINTETICOS,
  CLAVES_PRESERVADAS,
  bloquearGoogle,
  entrarEnModoDemo,
  sembrarAlmacenamiento,
  volcarAlmacenamiento,
} from './apoyo';

/**
 * E2E · Purga de localStorage al cerrar sesión.
 *
 * Navegador real (Chromium), servidor local, sesión obtenida por el modo
 * demostración de la app. Sin OAuth, sin credenciales, sin Firebase real.
 */
test.describe('A6-F2 · purga de localStorage', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
  });

  test('el cierre sin cambios pendientes purga y navega a /login', async ({ page }) => {
    await entrarEnModoDemo(page);
    await sembrarAlmacenamiento(page);

    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();

    // Sin pendientes no debe aparecer ningún diálogo.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForURL('**/login', { timeout: 30_000 });

    const almacen = await volcarAlmacenamiento(page);
    const claves = Object.keys(almacen);

    // 1 · No queda ninguna clave de estado.
    expect(claves.filter((k) => k.startsWith('pate-salud-state:'))).toEqual([]);
    // 2 · No queda la sesión activa.
    expect(claves).not.toContain('pate_salud_active_user');
    // 3 · Ningún valor sintético sobrevive en NINGUNA clave.
    const todo = JSON.stringify(almacen);
    expect(todo).not.toContain(SINTETICOS.documento);
    expect(todo).not.toContain(SINTETICOS.medicamento);
    expect(todo).not.toContain(SINTETICOS.hoja);
    // 4 · De las claves propias, solo sobreviven las tres permitidas.
    const propias = claves.filter((k) => k.startsWith('pate')).sort();
    expect(propias).toEqual([...CLAVES_PRESERVADAS].sort());
    // 5 · Una clave futura desconocida también se elimina.
    expect(claves).not.toContain('pate-futuro-test');
    // 6 · La clave DEMO heredada se elimina.
    expect(claves).not.toContain('pate_salud_familiar_app_state_demo');
    // 7 · Lo ajeno a Paté queda intacto.
    expect(almacen['otra-app:sesion']).toBe('no tocar');
  });

  test('las preferencias no clínicas y el deviceId sobreviven con su valor', async ({ page }) => {
    await entrarEnModoDemo(page);
    await sembrarAlmacenamiento(page);

    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await page.waitForURL('**/login', { timeout: 30_000 });

    const almacen = await volcarAlmacenamiento(page);
    expect(almacen['pate_salud_device_id']).toBe('dispositivo-e2e');
    expect(almacen['pate:prefs:migrado']).toBe('1');
    expect(almacen['pate:prefs:v1']).toBeTruthy();
    // Las preferencias se reescriben en el paso (e) con la forma completa.
    const prefs = JSON.parse(almacen['pate:prefs:v1']);
    expect(Object.keys(prefs)).toContain('autoLockMinutes');
    // Y jamás contienen identificadores ni PHI.
    const serializado = almacen['pate:prefs:v1'];
    expect(serializado).not.toContain('@');
    expect(serializado).not.toContain(SINTETICOS.documento);
  });

  test('el estado del expediente no queda en memoria tras la purga', async ({ page }) => {
    await entrarEnModoDemo(page);
    await sembrarAlmacenamiento(page);

    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await page.waitForURL('**/login', { timeout: 30_000 });

    // Tras replace('/login') hay una carga completa: nada del árbol anterior
    // sobrevive. Se comprueba que la pantalla de login no muestra datos.
    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain(SINTETICOS.documento);
    expect(texto).not.toContain(SINTETICOS.medicamento);
  });
});
