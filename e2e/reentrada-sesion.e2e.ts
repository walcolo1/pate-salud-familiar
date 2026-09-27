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
