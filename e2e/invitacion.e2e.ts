import { test, expect, type Page } from '@playwright/test';
import { bloquearGoogle } from './apoyo';

/**
 * E2E · `/invitacion` (Bloque E, E9).
 *
 * Es la única ruta pública que recibe una URL de un desconocido y luego le
 * habla, así que la mitad de estas pruebas son sobre lo que **no** hace.
 *
 * Ningún token, correo ni identificador de aquí corresponde a nada real, y
 * ninguna prueba sale a la red: el backend está interceptado.
 */

/** Un token con la forma exacta que exige el backend. Inventado. */
const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);

/** Un `/exec` con la forma correcta, apuntando a ninguna parte. */
const BACKEND = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

const enlace = (t = TOKEN, backend = BACKEND) =>
  `/invitacion?t=${t}&backend=${encodeURIComponent(backend)}`;

/**
 * Un Google Identity Services de mentira.
 *
 * Pinta un botón de verdad para que se pueda pulsar y, al pulsarlo, entrega la
 * credencial igual que haría Google. Lo que se prueba es lo que la aplicación
 * hace con ella, no el inicio de sesión de Google.
 */
async function googleDeMentira(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize(opciones: { callback: (r: { credential: string }) => void }) {
            (window as unknown as { __alGoogle: unknown }).__alGoogle = opciones.callback;
          },
          disableAutoSelect() {},
          renderButton(destino: HTMLElement) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.textContent = 'Acceder con Google';
            boton.onclick = () => {
              const cb = (window as unknown as { __alGoogle?: (r: { credential: string }) => void })
                .__alGoogle;
              if (cb) cb({ credential: 'token.de.mentira' });
            };
            destino.appendChild(boton);
          },
        },
      },
    };
  });
}

/** Contesta al backend con lo que se le diga, sin salir a la red. */
async function backendResponde(page: Page, cuerpo: unknown, tipo = 'application/json') {
  await page.route(BACKEND, (ruta) =>
    ruta.fulfill({
      status: 200,
      contentType: tipo,
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    }),
  );
}

test.describe('E9 · aceptar una invitación', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await googleDeMentira(page);
  });

  test('I1 · un enlace sin parámetros no llega a pedir nada', async ({ page }) => {
    await page.goto('/invitacion');
    await expect(page.getByRole('heading', { name: 'Este enlace está incompleto' })).toBeVisible();
    // Ofrecer «volver a intentar» sobre un enlace roto es una promesa falsa.
    await expect(page.getByRole('button', { name: 'Probar con otra cuenta' })).toHaveCount(0);
  });

  test('I2 · un backend que no es de Apps Script NO recibe ninguna petición', async ({ page }) => {
    // El ataque que esta ruta tiene que parar: con un backend arbitrario, la
    // aplicación mandaría el id_token del usuario a donde diga quien escribió
    // el enlace, con nuestra marca en la barra y la pantalla de Google de
    // verdad. Un phishing que no necesita imitar nada.
    const intentos: string[] = [];
    await page.route('**/*', (ruta) => {
      // Por el HOST de destino, no por «contiene». La propia navegación lleva
      // `malo.example` dentro de la cadena de consulta, y contarla sería dar
      // por bueno un fallo que no existe... o al revés, esconder uno que sí.
      const destino = new URL(ruta.request().url());
      if (destino.hostname === 'malo.example') intentos.push(destino.href);
      return ruta.continue();
    });

    await page.goto(`/invitacion?t=${TOKEN}&backend=${encodeURIComponent('https://malo.example/robar')}`);

    await expect(page.getByRole('heading', { name: 'Este enlace no es de fiar' })).toBeVisible();
    expect(intentos, 'se contactó con el sitio del enlace').toEqual([]);
    // Y tampoco se pinta el botón de Google: no hay nada que firmar.
    await expect(page.getByRole('button', { name: 'Acceder con Google' })).toHaveCount(0);
  });

  test('I3 · con el enlace bueno, invita a identificarse y avisa de la cuenta', async ({ page }) => {
    await page.goto(enlace());
    await expect(page.getByRole('heading', { name: 'Te han dado acceso' })).toBeVisible();
    // La causa número uno de fallo es entrar con la cuenta que hubiera abierta.
    await expect(page.getByText('la cuenta en la que recibiste')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acceder con Google' })).toBeVisible();
  });

  test('I4 · aceptada: entra y guarda SOLO la dirección del backend', async ({ page }) => {
    await backendResponde(page, { ok: true, data: { aceptada: true } });

    await page.goto(enlace());
    await page.getByRole('button', { name: 'Acceder con Google' }).click();

    await expect(page.getByRole('heading', { name: 'Ya estás dentro' })).toBeVisible();

    const guardado = await page.evaluate(() => ({ ...localStorage }));
    expect(guardado['pate:familia:v1']).toBe(BACKEND);

    // Lo que NO puede quedar: la regla de A6-F3 sigue en pie y la dirección
    // del backend es la única excepción.
    const todo = JSON.stringify(guardado);
    expect(todo, 'se guardó el id_token').not.toContain('token.de.mentira');
    expect(todo, 'se guardó el token de la invitación').not.toContain(TOKEN);
    expect(todo).not.toMatch(/[^@\s"]+@[^@\s"]+\.[a-z]{2,}/i);
  });

  test('I5 · cuenta equivocada: lo dice sin decir de quién es la invitación', async ({ page }) => {
    await backendResponde(page, { ok: false, error: 'INVITACION_DESTINATARIO_INVALIDO' });

    await page.goto(enlace());
    await page.getByRole('button', { name: 'Acceder con Google' }).click();

    await expect(page.getByRole('heading', { name: 'Estás en la cuenta equivocada' })).toBeVisible();
    // Reintentar aquí sí sirve: se cambia de cuenta y se vuelve a probar.
    await expect(page.getByRole('button', { name: 'Probar con otra cuenta' })).toBeVisible();

    const texto = (await page.locator('main').innerText()).toLowerCase();
    expect(texto, 'la pantalla dice para quién era la invitación').not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/);
  });

  test('I6 · caducada: no ofrece reintentar', async ({ page }) => {
    await backendResponde(page, { ok: false, error: 'INVITACION_EXPIRADA' });

    await page.goto(enlace());
    await page.getByRole('button', { name: 'Acceder con Google' }).click();

    await expect(page.getByRole('heading', { name: 'El enlace caducó' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Probar con otra cuenta' })).toHaveCount(0);
  });

  test('I7 · una respuesta que no se entiende NO es una bienvenida', async ({ page }) => {
    // El fallo clásico de estas pantallas: dar por buena cualquier respuesta
    // que no traiga un error. Un HTML de sesión caducada de Google entraría
    // como un éxito y la persona se quedaría creyendo que tiene acceso.
    await backendResponde(page, '<html><body>Iniciar sesión</body></html>', 'text/html');

    await page.goto(enlace());
    await page.getByRole('button', { name: 'Acceder con Google' }).click();

    await expect(page.getByRole('heading', { name: 'Ya estás dentro' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No se pudo aceptar la invitación' })).toBeVisible();
  });

  test('I8 · un token con forma equivocada se para antes de llamar a nadie', async ({ page }) => {
    let llamadas = 0;
    await page.route(BACKEND, (ruta) => {
      llamadas++;
      return ruta.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await page.goto(enlace('demasiado-corto'));

    await expect(page.getByRole('heading', { name: 'Este enlace está incompleto' })).toBeVisible();
    expect(llamadas).toBe(0);
  });
});
