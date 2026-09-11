import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Cabeceras de seguridad HTTP (A7).
 *
 * La prueba unitaria comprueba que la política está DECLARADA. Esta comprueba
 * que el servidor la EMITE y que el navegador la aplica sin romper la
 * aplicación: son dos afirmaciones distintas y una no implica la otra.
 *
 * SOBRE EL AISLAMIENTO
 * ────────────────────
 * Sigue sin salir un solo byte hacia Google. Para comprobar que la CSP permite
 * Google Identity Services, la petición a `accounts.google.com/gsi/client` se
 * responde localmente con un guion inocuo. El navegador evalúa la CSP sobre la
 * URL, no sobre quién sirve el contenido: si la directiva no lo permitiera,
 * saltaría igual la violación.
 */

const RUTAS = ['/', '/login', '/dashboard', '/settings', '/members'];

/** Recoge las violaciones de CSP que dispara el navegador. */
async function vigilarViolaciones(page: Page): Promise<string[]> {
  const violaciones: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ← ${e.blockedURI}`,
      );
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|connect|execute|apply)/i.test(t)) {
      violaciones.push(t);
    }
  });
  return violaciones;
}

const leerViolaciones = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

test.describe('A7 · cabeceras de seguridad', () => {
  test('C1 · las cinco cabeceras se sirven en la raíz y en /login', async ({ page }) => {
    await bloquearGoogle(page);

    for (const ruta of ['/', '/login']) {
      const respuesta = await page.goto(ruta);
      expect(respuesta, ruta).not.toBeNull();
      const h = respuesta!.headers();

      expect(h['content-security-policy'], ruta).toBeTruthy();
      expect(h['strict-transport-security'], ruta).toBe(
        'max-age=63072000; includeSubDomains; preload',
      );
      expect(h['x-content-type-options'], ruta).toBe('nosniff');
      expect(h['referrer-policy'], ruta).toBe('strict-origin-when-cross-origin');
      expect(h['permissions-policy'], ruta).toBe('geolocation=(), camera=(), microphone=()');
      expect(h['x-frame-options'], ruta).toBe('DENY');
    }
  });

  test('C2 · la CSP servida contiene las directivas de contención', async ({ page }) => {
    await bloquearGoogle(page);
    const csp = (await page.goto('/login'))!.headers()['content-security-policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('frame-src https://accounts.google.com');
    expect(csp).not.toContain('unsafe-eval');
    // Apps Script entra en connect-src (E0-bis), pero NUNCA como fuente de
    // código: si apareciera en script-src, el Web App de cualquier titular
    // podría ejecutar código dentro de la aplicación.
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://accounts.google.com;");
  });

  test('C2b · la CSP servida aplica el mínimo privilegio en connect-src', async ({ page }) => {
    await bloquearGoogle(page);
    const csp = (await page.goto('/login'))!.headers()['content-security-policy'];

    // Servicios que la aplicación NO usa: no se les abre paso.
    expect(csp).not.toContain('firebaseio.com');
    expect(csp).not.toContain('apis.google.com');

    expect(csp).toContain(
      "connect-src 'self' https://*.googleapis.com https://accounts.google.com https://script.google.com https://script.googleusercontent.com",
    );
  });

  test('C3 · no se anuncia el framework', async ({ page }) => {
    await bloquearGoogle(page);
    const h = (await page.goto('/login'))!.headers();
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('C4 · las cabeceras alcanzan también a los recursos estáticos', async ({ page }) => {
    await bloquearGoogle(page);
    // `/:path*` debe cubrir el manifiesto y el service worker, no solo el HTML.
    for (const recurso of ['/manifest.json', '/sw.js']) {
      const r = await page.request.get(recurso);
      expect(r.headers()['x-content-type-options'], recurso).toBe('nosniff');
      expect(r.headers()['content-security-policy'], recurso).toBeTruthy();
    }
  });

  test('C5 · ninguna ruta real dispara una violación de CSP', async ({ page }) => {
    const violaciones = await vigilarViolaciones(page);
    await bloquearGoogle(page);

    for (const ruta of RUTAS) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    expect(violaciones, violaciones.join('\n')).toEqual([]);
    expect(await leerViolaciones(page)).toEqual([]);
  });

  test('C6 · el guion de Google Identity Services NO lo bloquea la CSP', async ({ page }) => {
    const violaciones = await vigilarViolaciones(page);

    // Nada sale hacia Google: la respuesta se fabrica aquí. La CSP se evalúa
    // sobre la URL, así que la comprobación sigue siendo válida.
    await page.route('https://accounts.google.com/gsi/client', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: 'window.__gisSustituto = true;',
      }),
    );
    await page.route(/googleapis\.com|firebaseio\.com|gstatic\.com|apis\.google\.com/, (r) =>
      r.abort(),
    );

    await page.goto('/login');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__gisSustituto), {
        timeout: 20_000,
      })
      .toBe(true);

    expect(violaciones, violaciones.join('\n')).toEqual([]);
    expect(await leerViolaciones(page)).toEqual([]);
  });

  test('C7 · la aplicación sigue funcionando con la CSP activa', async ({ page }) => {
    const violaciones = await vigilarViolaciones(page);
    await bloquearGoogle(page);

    // El modo demostración ejercita hidratación, navegación de cliente,
    // localStorage y el registro del service worker: si la CSP rompiera algo
    // esencial, este recorrido no llegaría al final.
    await entrarEnModoDemo(page);
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await expect(page.getByRole('heading', { name: /Configuraci/i })).toBeVisible();

    expect(violaciones, violaciones.join('\n')).toEqual([]);
  });
});
