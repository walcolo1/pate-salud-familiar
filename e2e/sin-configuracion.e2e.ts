import { test, expect } from '@playwright/test';
import { bloquearGoogle } from './apoyo';

/**
 * E2E · La aplicación sin `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Bloque B).
 *
 * Corre contra una compilación DISTINTA, en el puerto 3101, hecha sin esa
 * variable. Hace falta una segunda compilación de verdad porque Next incrusta
 * las variables `NEXT_PUBLIC_*` en el paquete: no basta con vaciarlas al
 * arrancar el servidor.
 *
 * Antes había un Client ID incrustado como valor por defecto, así que este
 * escenario era invisible: la aplicación intentaba autenticar contra un
 * proyecto de Google Cloud ajeno en lugar de avisar de que le falta
 * configuración.
 */

test.describe('Bloque B · configuración ausente', () => {
  test('G12 · sin NEXT_PUBLIC_GOOGLE_CLIENT_ID se explica el problema y no se inicia GIS', async ({ page }) => {
    // El servidor de pruebas no define la variable, que es exactamente el
    // escenario a cubrir. Antes había un Client ID incrustado que ocultaba
    // este caso autenticando contra un proyecto ajeno.
    await bloquearGoogle(page);
    await page.goto('/login');

    const aviso = page.locator('#error-config-client-id');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    await expect(aviso).toHaveAttribute('role', 'alert');

    // No se dibuja el botón de Google: no se intenta autenticar con un valor falso.
    await expect(page.locator('#googleBtnParent')).toHaveCount(0);

    // Y el mensaje no filtra ningún identificador.
    await expect(aviso).not.toContainText('apps.googleusercontent.com');
  });
});
