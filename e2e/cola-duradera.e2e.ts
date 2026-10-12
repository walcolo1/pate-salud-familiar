import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarComoSesionRealSimulada, generarCambiosPendientes, volcarAlmacenamiento } from './apoyo';

/**
 * Bloque H · la cola de cambios sin enviar, en el navegador de verdad.
 *
 * Hasta G4 la cola vivía en memoria. Un F5 la vaciaba y, con ella, el aviso
 * del diálogo de cierre: se podía salir y purgar sin que nada advirtiera de
 * que había cambios que nunca llegaron a la hoja.
 *
 * Aquí: un cambio sin credencial → está en el disco → F5 → sigue ahí y cuenta
 * → cerrar sesión AVISA → cancelar lo conserva → descartar, con su segunda
 * confirmación, lo borra; la dirección de la hoja se queda.
 *
 * Sin OAuth real y con el tráfico a Google bloqueado. La credencial nunca
 * llega, así que el despacho real no se ejerce aquí: eso lo cubre
 * `cicloColaDuradera.test.ts` con las piezas de verdad.
 */

const BACKEND = 'https://script.google.com/macros/s/AKfycbSINTETICO0123456789abcd/exec';

async function prepararConCola(page: Page) {
  await bloquearGoogle(page);
  await entrarComoSesionRealSimulada(page);
  // Con la hoja registrada, lo que falta es la credencial: el caso tras un F5.
  await page.evaluate((url) => localStorage.setItem('pate:familia:v1', url), BACKEND);
  await generarCambiosPendientes(page);
}

const lotesEnDisco = (page: Page) =>
  page.evaluate(() => {
    const crudo = localStorage.getItem('pate:cola:v1');
    return crudo ? (JSON.parse(crudo).lotes as { mutaciones: { tabla: string; accion: string }[] }[]) : [];
  });

test.describe('Bloque H · cola duradera', () => {
  test('el cambio queda en el disco como JSON: entidad, acción, carga y hora', async ({ page }) => {
    await prepararConCola(page);
    const lotes = await lotesEnDisco(page);
    expect(lotes).toHaveLength(1);
    const tablas = lotes[0].mutaciones.map((m) => m.tabla);
    expect(tablas).toContain('PACIENTES');
    expect(lotes[0].mutaciones.every((m) => m.accion === 'ESCRIBIR')).toBe(true);
  });

  test('sobrevive a un F5 y el panel lo sigue contando', async ({ page }) => {
    await prepararConCola(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toBeVisible({ timeout: 30_000 });

    expect(await lotesEnDisco(page)).toHaveLength(1);
    await page.goto('/dashboard');
    await expect(page.getByText(/1 cambio\(s\) que todavía no han llegado/)).toBeVisible({ timeout: 15_000 });
  });

  test('tras un F5, cerrar sesión AVISA de lo pendiente, y cancelar no borra nada', async ({ page }) => {
    await prepararConCola(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Tienes cambios sin sincronizar');

    await dialogo.getByRole('button', { name: /^Cancelar$/i }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await lotesEnDisco(page)).toHaveLength(1);
  });

  test('descartar, con su segunda confirmación, borra la cola pero no la hoja', async ({ page }) => {
    await prepararConCola(page);
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: /Salir y descartar/i }).click();
    await dialogo.getByRole('button', { name: /Salir y borrar/i }).click();
    await page.waitForURL('**/login', { timeout: 30_000 });

    const almacen = await volcarAlmacenamiento(page);
    expect(almacen['pate:cola:v1']).toBeUndefined();
    expect(almacen['pate:familia:v1']).toBe(BACKEND);
  });

  test('el botón de cierre de Ajustes también pasa por el aviso', async ({ page }) => {
    await prepararConCola(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: /Cerrar sesión y borrar datos de este dispositivo/i }).click();
    await expect(page.getByRole('dialog')).toContainText('Tienes cambios sin sincronizar');
    expect(await lotesEnDisco(page)).toHaveLength(1);
  });
});

test.describe('Bloque I · de qué cuenta es cada lote', () => {
  test('el lote lleva la huella de la cuenta, y en el disco no está su identificador', async ({ page }) => {
    await prepararConCola(page);
    const crudo = await page.evaluate(() => localStorage.getItem('pate:cola:v1'));
    const cola = JSON.parse(crudo!);
    expect(cola.version).toBe(2);
    expect(cola.sal).toMatch(/^[0-9a-f]{32}$/);
    expect(cola.lotes[0].cuenta).toMatch(/^[0-9a-f]{64}$/);
    // Ni el `sub` ni el correo de la sesión simulada.
    expect(crudo).not.toContain('e2e-google-id');
    expect(crudo).not.toContain('sesion-e2e@example.invalid');
  });

  test('una cola v1 sin dueño se migra a v2 y se atribuye a quien estaba dentro', async ({ page }) => {
    await bloquearGoogle(page);
    await entrarComoSesionRealSimulada(page);
    await page.evaluate(() =>
      localStorage.setItem(
        'pate:cola:v1',
        JSON.stringify({
          version: 1,
          lotes: [
            {
              id: 'lote-v1',
              creadoEn: '2026-09-25T10:00:00.000Z',
              mutaciones: [{ tabla: 'CITAS', accion: 'ESCRIBIR', fila: { id: 'c1' } }],
            },
          ],
        }),
      ),
    );
    await page.reload();
    await expect
      .poll(async () => JSON.parse((await page.evaluate(() => localStorage.getItem('pate:cola:v1')))!).version, {
        timeout: 15_000,
      })
      .toBe(2);
    const cola = JSON.parse((await page.evaluate(() => localStorage.getItem('pate:cola:v1')))!);
    expect(cola.lotes).toHaveLength(1);
    expect(cola.lotes[0].id).toBe('lote-v1');
    expect(cola.lotes[0].cuenta).toMatch(/^[0-9a-f]{64}$/);
  });
});
