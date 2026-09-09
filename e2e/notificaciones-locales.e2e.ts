import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Avisos locales (C3.2).
 *
 * QUÉ SE COMPRUEBA Y CÓMO
 * ───────────────────────
 * Una notificación de verdad la dibuja el sistema operativo, fuera del alcance
 * de Playwright. Lo que sí está a nuestro alcance —y es lo que importa— es la
 * frontera de la aplicación: qué se le pide al navegador y con qué texto. Así
 * que se intercepta `showNotification` y se mira exactamente eso.
 *
 * El temporizador se dispara a mano en vez de esperarlo. `scheduledAt` tiene
 * granularidad de minuto, así que esperar de verdad costaría hasta un minuto
 * por prueba sin comprobar nada más de lo que ya se comprueba.
 */

/**
 * Doble del permiso de notificaciones.
 *
 * Chromium sin cabeza arranca con las notificaciones DENEGADAS, y
 * `context.grantPermissions(['notifications'])` no cambia lo que devuelve
 * `Notification.permission` —se comprobó: sigue diciendo «denied»—. Sin este
 * doble no hay forma de ejercitar ni la pantalla de la primera vez ni el
 * camino del aviso ya concedido.
 *
 * **Evidencia SIMULADA en este punto y solo en este punto**: lo que se finge
 * es la respuesta del navegador al permiso. Todo lo que viene después —armar
 * el temporizador, componer el texto, pedir la notificación al Service
 * Worker— es el código de producción sin tocar. El cuadro real del navegador
 * queda como validación manual en `TESTING.md`.
 */
async function fingirPermiso(
  page: Page,
  inicial: 'default' | 'granted',
  respuesta: NotificationPermission = 'granted',
) {
  await page.addInitScript(({ i, r }: { i: string; r: NotificationPermission }) => {
    (window as unknown as { __inicial: string }).__inicial = i;
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => (window as unknown as { __permiso: string }).__permiso ?? 'default',
    });
    (window as unknown as { __permiso: string }).__permiso = (window as unknown as { __inicial: string }).__inicial;
    (window as unknown as { __pedidos: number }).__pedidos = 0;
    Notification.requestPermission = (() => {
      (window as unknown as { __pedidos: number }).__pedidos++;
      (window as unknown as { __permiso: string }).__permiso = r;
      return Promise.resolve(r);
    }) as typeof Notification.requestPermission;
  }, { i: inicial, r: respuesta });
}

/** Recoge lo que la aplicación pide mostrar, y los temporizadores que arma. */
async function espiarAvisos(page: Page) {
  await page.addInitScript(() => {
    interface Espia {
      mostrados: Array<{ titulo: string; cuerpo: string; url: string; tag: string }>;
      temporizadores: Array<{ ms: number; disparar: () => void }>;
    }
    const espia: Espia = { mostrados: [], temporizadores: [] };
    (window as unknown as { __espiaAvisos: Espia }).__espiaAvisos = espia;

    // 1 · Lo que se pide mostrar.
    const proto = ServiceWorkerRegistration.prototype as unknown as {
      showNotification: (t: string, o?: NotificationOptions) => Promise<void>;
    };
    proto.showNotification = function (titulo: string, opciones?: NotificationOptions) {
      espia.mostrados.push({
        titulo,
        cuerpo: opciones?.body ?? '',
        url: (opciones?.data as { url?: string })?.url ?? '',
        tag: opciones?.tag ?? '',
      });
      return Promise.resolve();
    };

    // 2 · Los temporizadores armados, para poder adelantarlos.
    const original = window.setTimeout;
    (window as unknown as { setTimeout: typeof window.setTimeout }).setTimeout = function (
      fn: TimerHandler,
      ms?: number,
      ...resto: unknown[]
    ) {
      // Solo interesan las esperas largas: las de React y Next son de
      // milisegundos y llenarían la lista de ruido.
      if (typeof fn === 'function' && typeof ms === 'number' && ms > 1000) {
        espia.temporizadores.push({ ms, disparar: () => (fn as () => void)() });
      }
      return original(fn, ms, ...(resto as []));
    } as typeof window.setTimeout;
  });
}

/** Siembra una toma pendiente para dentro de un minuto. */
async function sembrarTomaProxima(page: Page) {
  return page.evaluate(() => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];

    const t = new Date(Date.now() + 60_000);
    const dd = (n: number) => String(n).padStart(2, '0');
    const cuando = `${t.getFullYear()}-${dd(t.getMonth() + 1)}-${dd(t.getDate())}T${dd(t.getHours())}:${dd(t.getMinutes())}`;
    const ahora = new Date().toISOString();

    e.medicationDoseReminders = [
      {
        id: 'dosis-aviso-e2e',
        prescriptionId: 'presc-aviso-e2e',
        memberId: uno.id,
        medicationName: 'MEDICAMENTO-SECRETO-E2E',
        dose: '500 mg',
        scheduledAt: cuando,
        status: 'PENDING',
        createdAt: ahora,
        updatedAt: ahora,
      },
    ];
    localStorage.setItem(clave, JSON.stringify(e));
    return cuando;
  });
}

const leerEspia = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __espiaAvisos?: { mostrados: unknown[]; temporizadores: { ms: number }[] } })
      .__espiaAvisos;
    return { mostrados: e?.mostrados ?? [], temporizadores: e?.temporizadores?.length ?? 0 };
  });

test.describe('C3.2 · avisos locales', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
  });

  test('N0 · el Service Worker llega a registrarse', async ({ page }) => {
    // No es una comprobación de adorno. El registro colgaba de un
    // `addEventListener('load')` que se instalaba DESPUÉS de que ese evento ya
    // hubiera ocurrido, así que el Service Worker no se registraba nunca: ni
    // caché de PWA, ni avisos, sin un solo error en consola que lo delatara.
    await entrarEnModoDemo(page);
    await page.goto('/reminders');

    const estado = await page.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      return { activo: !!registro.active, controla: !!navigator.serviceWorker.controller };
    });

    expect(estado.activo, 'el Service Worker no llegó a activarse').toBe(true);
    expect(estado.controla).toBe(true);
  });

  test('N1 · sin permiso, se explica antes de pedir nada', async ({ page }) => {
    await fingirPermiso(page, 'default');
    await entrarEnModoDemo(page);
    await page.goto('/reminders');

    const tarjeta = page.getByRole('region', { name: /Avisar cuando toque|Avisos/ });
    await expect(tarjeta).toBeVisible();

    // Dice qué NO va a hacer, que es lo que permite decidir con criterio.
    await expect(tarjeta).toContainText('nunca de quién ni de qué');
    await expect(tarjeta).toContainText('no hay servidor');
    await expect(tarjeta).toContainText('solo con la aplicación abierta');

    await expect(tarjeta.getByRole('button', { name: 'Activar avisos' })).toBeVisible();
  });

  test('N2 · el permiso se pide solo al pulsar, no al abrir', async ({ page }) => {
    // El doble cuenta las llamadas: lo que se comprueba es CUÁNDO ocurren.
    await fingirPermiso(page, 'default', 'granted');
    await entrarEnModoDemo(page);
    await page.goto('/reminders');
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeVisible();

    expect(
      await page.evaluate(() => (window as unknown as { __pedidos: number }).__pedidos),
      'la aplicación pidió el permiso sin que nadie lo pulsara',
    ).toBe(0);

    await page.getByRole('button', { name: 'Activar avisos' }).click();

    expect(await page.evaluate(() => (window as unknown as { __pedidos: number }).__pedidos)).toBe(1);
    await expect(page.getByText('Avisos activados')).toBeVisible();
  });

  test('N3 · el aviso se programa y su texto no lleva ni un dato clínico', async ({ page }) => {
    await fingirPermiso(page, 'granted');
    await espiarAvisos(page);
    await entrarEnModoDemo(page);
    await sembrarTomaProxima(page);
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    await expect
      .poll(async () => (await leerEspia(page)).temporizadores, {
        message: 'no se armó ningún temporizador para la toma sembrada',
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // El aviso se muestra a través del Service Worker: hay que esperar a que
    // esté activo o `showNotification` no llega a existir.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    // Se adelanta el temporizador en vez de esperar el minuto.
    await page.evaluate(() => {
      const e = (window as unknown as { __espiaAvisos: { temporizadores: { ms: number; disparar: () => void }[] } })
        .__espiaAvisos;
      for (const t of e.temporizadores) if (t.ms <= 61_000) t.disparar();
    });

    await expect
      .poll(async () => (await leerEspia(page)).mostrados.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const [aviso] = (await leerEspia(page)).mostrados as Array<{
      titulo: string;
      cuerpo: string;
      url: string;
    }>;

    expect(aviso.titulo).toBe('Paté · Salud Familiar');
    expect(aviso.cuerpo).toBe('Es hora de una toma de medicamento.');
    // Lo que se sembró: ni el medicamento, ni la dosis, ni el familiar.
    expect(aviso.cuerpo).not.toContain('MEDICAMENTO-SECRETO-E2E');
    expect(aviso.cuerpo).not.toContain('500');
    expect(aviso.url).toBe('/reminders');
    expect(aviso.url, 'el clic no puede llevar a la ficha de nadie').not.toMatch(/\/members\//);
  });

  test('N4 · marcar la toma como hecha cancela su aviso', async ({ page }) => {
    await fingirPermiso(page, 'granted');
    await espiarAvisos(page);
    await entrarEnModoDemo(page);
    await sembrarTomaProxima(page);
    await page.goto('/reminders');

    await expect
      .poll(async () => (await leerEspia(page)).temporizadores, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    // Se resuelve la toma por la vía real: cambia el estado del expediente.
    await page.evaluate(() => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      e.medicationDoseReminders = (e.medicationDoseReminders ?? []).map(
        (d: { id: string; status: string }) =>
          d.id === 'dosis-aviso-e2e' ? { ...d, status: 'TAKEN' } : d,
      );
      localStorage.setItem(clave, JSON.stringify(e));
    });
    await page.reload();
    await expect(page.locator('main').first()).toBeVisible();

    // Se adelantan TODOS los temporizadores largos: si el aviso siguiera
    // armado, aparecería aquí.
    await page.evaluate(() => {
      const e = (window as unknown as { __espiaAvisos: { temporizadores: { ms: number; disparar: () => void }[] } })
        .__espiaAvisos;
      for (const t of e.temporizadores) if (t.ms <= 61_000) t.disparar();
    });
    await page.waitForTimeout(500);

    const { mostrados } = await leerEspia(page);
    expect(mostrados, 'una toma ya tomada no puede seguir avisando').toEqual([]);
  });

  test('N5 · el Service Worker atiende el clic y reutiliza la ventana abierta', async () => {
    // El clic en una notificación llega al Service Worker, que puede estar vivo
    // sin ninguna pestaña. Playwright no puede pulsar una notificación del
    // sistema, así que se comprueba el contrato del propio guion.
    const sw = readFileSync('public/sw.js', 'utf8');

    expect(sw, 'sin manejador, el clic no hace nada').toContain("addEventListener('notificationclick'");
    expect(sw, 'la notificación debe cerrarse al pulsarla').toContain('event.notification.close()');
    expect(sw, 'debe reutilizar una ventana ya abierta antes de abrir otra').toContain('matchAll');
    expect(sw).toContain('focus');
    expect(sw, 'el destino por defecto es la lista de recordatorios').toContain('/reminders');
    // Y nada de leer el expediente desde el Service Worker.
    expect(sw).not.toContain('pate-salud-state');
  });
});
