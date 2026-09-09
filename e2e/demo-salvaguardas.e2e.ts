import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo, volcarAlmacenamiento } from './apoyo';

/**
 * E2E · Salvaguardas del modo DEMO (A6-F3).
 *
 * Hasta ahora, que el modo demostración no sincronizara con Google era una
 * casualidad: no había token. Estas pruebas verifican que la protección pasó a
 * ser estructural y que los datos ficticios quedan marcados de forma
 * inconfundible.
 */

test.describe('A6-F3 · salvaguardas DEMO', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('D0 · el estado guardado en demo queda marcado como DEMO', async ({ page }) => {
    await page.waitForTimeout(800);
    const almacen = await volcarAlmacenamiento(page);
    const clave = Object.keys(almacen).find((k) => k.startsWith('pate-salud-state:'));
    expect(clave).toBeTruthy();
    expect(JSON.parse(almacen[clave!]).origen).toBe('DEMO');
  });

  test('D1 · la exportación DEMO lleva prefijo en el nombre del archivo', async ({ page }) => {
    await page.goto('/settings');
    const descarga = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: /Exportar|Descargar respaldo|respaldo/i }).first().click();
    const d = await descarga;
    expect(d.suggestedFilename()).toMatch(/^DEMO_pate_salud_expediente_familiar_\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('D2 · la exportación DEMO lleva aviso y origen dentro del JSON', async ({ page }) => {
    await page.goto('/settings');
    const descarga = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: /Exportar|Descargar respaldo|respaldo/i }).first().click();
    const d = await descarga;

    const flujo = await d.createReadStream();
    const trozos: Buffer[] = [];
    for await (const t of flujo) trozos.push(t as Buffer);
    const json = JSON.parse(Buffer.concat(trozos).toString('utf8'));

    expect(json.origen).toBe('DEMO');
    expect(String(json._aviso)).toContain('DEMOSTRACIÓN');
  });

  test('D3 · un respaldo REAL es rechazado dentro del modo DEMO', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /Configuraci/i })).toBeVisible();
    await page.waitForTimeout(500);

    const respaldoReal = JSON.stringify({
      schemaVersion: 1,
      origen: 'REAL',
      user: { email: 'persona@example.invalid', provider: 'google' },
      members: [{ id: 'm9', fullName: 'NO DEBE IMPORTARSE', documentNumber: 'REAL-TEST-A6' }],
      appointments: [],
    });

    const antes = JSON.stringify(await volcarAlmacenamiento(page));

    await page.locator('input[type="file"]').last().setInputFiles({
      name: 'respaldo-real.json',
      mimeType: 'application/json',
      buffer: Buffer.from(respaldoReal, 'utf8'),
    });

    // C1.3b · El resumen previo era un `window.confirm` que la prueba aceptaba
    // desde fuera. Ahora es un diálogo de la propia aplicación, así que se
    // confirma como lo haría una persona. De paso queda comprobado que el
    // resumen dice CUÁNTO se restaura y nunca QUÉ.
    const resumen = page.getByRole('dialog', { name: 'Restaurar copia de seguridad' });
    await expect(resumen).toBeVisible({ timeout: 20_000 });
    await expect(resumen).not.toContainText('NO DEBE IMPORTARSE');
    await expect(resumen).not.toContainText('REAL-TEST-A6');
    await resumen.getByRole('button', { name: 'Restaurar copia' }).click();

    // Rechazo accesible, con el motivo y sin exponer contenido del respaldo.
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible({ timeout: 20_000 });
    await expect(dialogo).toContainText('Este respaldo contiene datos reales');
    await expect(dialogo).not.toContainText('NO DEBE IMPORTARSE');
    await expect(dialogo).not.toContainText('REAL-TEST-A6');

    await dialogo.getByRole('button', { name: /Entendido/i }).click();

    // Y ningún dato cambió.
    expect(JSON.stringify(await volcarAlmacenamiento(page))).toBe(antes);
  });

  test('D4 · ninguna ruta DEMO alcanza Google, Firebase ni Drive', async ({ page }) => {
    // Se vigilan las rutas de DATOS. El script de identidad
    // (accounts.google.com/gsi/client) lo carga layout.tsx en toda visita,
    // tenga o no sesión, y no transporta ningún dato del expediente.
    const intentos: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith('https://accounts.google.com/gsi/')) return;
      if (/googleapis\.com|firebaseio\.com|firestore\.|sheets\.google|drive\.google|script\.google/.test(u)) {
        intentos.push(u);
      }
    });

    // Recorrido por las pantallas que disparan sincronización en sesión real.
    await page.goto('/dashboard');
    await page.goto('/members');
    await page.goto('/settings');
    await page.waitForTimeout(6000); // supera el debounce de 4 s de scheduleAutoSync

    expect(intentos).toEqual([]);
  });
});
