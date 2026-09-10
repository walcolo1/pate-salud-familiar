import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Vacunación de mascotas (Bloque D, D3).
 *
 * Ningún dato de aquí corresponde a un animal real.
 *
 * Lo que se fija: que una vacuna se registra, que su estado —al día, próxima,
 * vencida— se **calcula** y no se guarda, que el refuerzo aparece en la agenda
 * unificada, que se programa un aviso local, y que **ese aviso no lleva el
 * nombre del animal**.
 *
 * Todo se localiza por rol y nombre accesible, nunca por clase ni por id.
 */

const dd = (n: number) => String(n).padStart(2, '0');
const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};
const hoy = () => enDias(0);

/** Siembra una mascota y, si se piden, sus vacunas. */
async function sembrar(
  page: Page,
  vacunas: Array<{ vacuna: string; fecha: string; proximaDosis?: string | null }> = [],
) {
  return page.evaluate((lista) => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
    const ahora = new Date().toISOString();

    e.pets = [
      {
        id: 'pet-e2e-vac',
        familyId: 'local',
        memberId: uno.id,
        nombre: 'MASCOTA-E2E-VAC',
        especie: 'PERRO',
        sexo: 'MACHO',
        activo: true,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
      },
    ];

    e.petVaccines = lista.map((v, i) => ({
      id: `vacpet-e2e-${i}`,
      petId: 'pet-e2e-vac',
      memberId: uno.id,
      vacuna: v.vacuna,
      fecha: v.fecha,
      proximaDosis: v.proximaDosis ?? null,
      laboratorio: null,
      lote: null,
      veterinario: null,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }));

    localStorage.setItem(clave, JSON.stringify(e));
    return { memberId: uno.id as string, petId: 'pet-e2e-vac' };
  }, vacunas);
}

const leerVacunas = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.petVaccines ?? []) as Array<{
      id: string;
      vacuna: string;
      fecha: string;
      proximaDosis: string | null;
      laboratorio: string | null;
      lote: string | null;
    }>;
  });

test.describe('D3 · vacunas de mascotas', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('V1 · sin vacunas, la pantalla dice qué hacer', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/vacunas`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('Aún no hay vacunas registradas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar vacuna' }).last()).toBeVisible();
  });

  test('V2 · se registra una vacuna con refuerzo y aparece en la lista', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/vacunas`);

    await page.getByRole('button', { name: 'Registrar vacuna' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar vacuna' });
    await expect(dialogo).toBeVisible();

    await dialogo.getByLabel('Vacuna', { exact: true }).fill('VACUNA-E2E');
    await dialogo.getByLabel('Próximo refuerzo').fill(enDias(10));
    await dialogo.getByLabel('Laboratorio (opcional)').fill('LAB-E2E');
    await dialogo.getByLabel('Lote (opcional)').fill('LOTE-E2E');
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole('heading', { name: 'VACUNA-E2E' })).toBeVisible();
    await expect(page.getByText('LAB-E2E')).toBeVisible();

    const guardadas = await leerVacunas(page);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].fecha).toBe(hoy());
    expect(guardadas[0].proximaDosis).toBe(enDias(10));
    expect(guardadas[0].lote).toBe('LOTE-E2E');
  });

  test('V3 · la validación rechaza lo imposible', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/vacunas`);
    await page.getByRole('button', { name: 'Registrar vacuna' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar vacuna' });

    // Sin nombre de vacuna.
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo.getByRole('alert')).toBeVisible();
    expect(await leerVacunas(page)).toHaveLength(0);

    // Fecha de aplicación en el futuro: eso es un plan, no un registro.
    await dialogo.getByLabel('Vacuna', { exact: true }).fill('VACUNA-E2E');
    await dialogo.getByLabel('Fecha de aplicación').fill(enDias(5));
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('futuro');
    expect(await leerVacunas(page)).toHaveLength(0);

    // Refuerzo el mismo día que la dosis.
    await dialogo.getByLabel('Fecha de aplicación').fill(hoy());
    await dialogo.getByLabel('Próximo refuerzo').fill(hoy());
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('posterior');
    expect(await leerVacunas(page)).toHaveLength(0);

    // Corregido, entra.
    await dialogo.getByLabel('Próximo refuerzo').fill(enDias(365));
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo).toBeHidden();
    expect(await leerVacunas(page)).toHaveLength(1);
  });

  test('V4 · el estado se calcula: al día, próxima y vencida a la vez', async ({ page }) => {
    const { memberId, petId } = await sembrar(page, [
      { vacuna: 'VACUNA-AL-DIA', fecha: enDias(-40), proximaDosis: enDias(200) },
      { vacuna: 'VACUNA-PROXIMA', fecha: enDias(-300), proximaDosis: enDias(10) },
      { vacuna: 'VACUNA-VENCIDA', fecha: enDias(-400), proximaDosis: enDias(-15) },
      { vacuna: 'VACUNA-SIN-REFUERZO', fecha: enDias(-10), proximaDosis: null },
    ]);
    await page.goto(`/members/${memberId}/pets/${petId}/vacunas`);
    await expect(page.locator('main').first()).toBeVisible();

    const tarjeta = (nombre: string) =>
      page.locator('article').filter({ has: page.getByRole('heading', { name: nombre }) });

    await expect(tarjeta('VACUNA-AL-DIA')).toContainText('Al día');
    await expect(tarjeta('VACUNA-PROXIMA')).toContainText('Próxima');
    await expect(tarjeta('VACUNA-PROXIMA'), 'debe decir cuántos días faltan').toContainText('10 días');
    await expect(tarjeta('VACUNA-VENCIDA')).toContainText('Vencida');
    await expect(tarjeta('VACUNA-VENCIDA')).toContainText('15 días');
    await expect(tarjeta('VACUNA-SIN-REFUERZO')).toContainText('Sin refuerzo');
  });

  test('V5 · el refuerzo aparece en la agenda unificada', async ({ page }) => {
    const { memberId, petId } = await sembrar(page, [
      { vacuna: 'VACUNA-AGENDA-E2E', fecha: enDias(-30), proximaDosis: enDias(3) },
    ]);
    await page.goto('/agenda');
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('VACUNA-AGENDA-E2E')).toBeVisible();
    await expect(page.getByText('Vacuna mascota').first()).toBeVisible();

    // Y lleva a la cartilla de esa mascota, no a la ficha del familiar.
    await page.getByText('VACUNA-AGENDA-E2E').click();
    await expect(page).toHaveURL(new RegExp(`/members/${memberId}/pets/${petId}/vacunas`));
  });

  test('V6 · un refuerzo vencido aparece en la agenda como vencido', async ({ page }) => {
    await sembrar(page, [
      { vacuna: 'VACUNA-VENCIDA-AGENDA', fecha: enDias(-400), proximaDosis: enDias(-3) },
    ]);
    await page.goto('/agenda');
    await expect(page.locator('main').first()).toBeVisible();

    const fila = page.locator('li').filter({ hasText: 'VACUNA-VENCIDA-AGENDA' });
    await expect(fila).toContainText('Vencido');
  });

  test('V7 · se programa un aviso, y NO lleva el nombre del animal', async ({ page }) => {
    // El permiso de notificaciones lo finge el mismo doble que en C3.2: el
    // navegador sin cabeza arranca con las notificaciones denegadas.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => 'granted',
      });
      interface Espia {
        mostrados: Array<{ titulo: string; cuerpo: string; url: string }>;
        temporizadores: Array<{ ms: number; disparar: () => void }>;
      }
      const espia: Espia = { mostrados: [], temporizadores: [] };
      (window as unknown as { __espia: Espia }).__espia = espia;

      const proto = ServiceWorkerRegistration.prototype as unknown as {
        showNotification: (t: string, o?: NotificationOptions) => Promise<void>;
      };
      proto.showNotification = function (titulo: string, opciones?: NotificationOptions) {
        espia.mostrados.push({
          titulo,
          cuerpo: opciones?.body ?? '',
          url: (opciones?.data as { url?: string })?.url ?? '',
        });
        return Promise.resolve();
      };

      const original = window.setTimeout;
      (window as unknown as { setTimeout: typeof window.setTimeout }).setTimeout = function (
        fn: TimerHandler,
        ms?: number,
        ...resto: unknown[]
      ) {
        if (typeof fn === 'function' && typeof ms === 'number' && ms > 1000) {
          espia.temporizadores.push({ ms, disparar: () => (fn as () => void)() });
        }
        return original(fn, ms, ...(resto as []));
      } as typeof window.setTimeout;
    });

    // Un refuerzo dentro de las próximas horas: entra en el horizonte de un día.
    const dentroDeUnRato = new Date(Date.now() + 3 * 3600_000);
    const fecha = `${dentroDeUnRato.getFullYear()}-${dd(dentroDeUnRato.getMonth() + 1)}-${dd(dentroDeUnRato.getDate())}`;

    const { memberId, petId } = await sembrar(page, [
      { vacuna: 'VACUNA-AVISO-E2E', fecha: enDias(-365), proximaDosis: fecha },
    ]);
    await page.goto(`/members/${memberId}/pets/${petId}/vacunas`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (window as unknown as { __espia: { temporizadores: unknown[] } }).__espia
                .temporizadores.length,
          ),
        { message: 'no se armó ningún aviso para el refuerzo', timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.evaluate(() => {
      const e = (window as unknown as {
        __espia: { temporizadores: { ms: number; disparar: () => void }[] };
      }).__espia;
      for (const t of e.temporizadores) t.disparar();
    });

    const mostrados = await page.evaluate(
      () =>
        (window as unknown as { __espia: { mostrados: Array<{ cuerpo: string; url: string }> } })
          .__espia.mostrados,
    );

    expect(mostrados.length).toBeGreaterThan(0);
    const cuerpos = mostrados.map((m) => m.cuerpo).join(' | ');
    expect(cuerpos).toContain('Toca revacunar a una mascota.');
    expect(cuerpos, 'el nombre del animal identifica un hogar').not.toContain('MASCOTA-E2E-VAC');
    expect(cuerpos, 'ni la vacuna concreta').not.toContain('VACUNA-AVISO-E2E');
    expect(mostrados.every((m) => !m.url.includes('/members/'))).toBe(true);
  });

  test('V8 · la tarjeta de la mascota avisa de lo pendiente, también por texto', async ({ page }) => {
    const { memberId } = await sembrar(page, [
      { vacuna: 'VACUNA-VENCIDA-1', fecha: enDias(-400), proximaDosis: enDias(-20) },
      { vacuna: 'VACUNA-PROXIMA-1', fecha: enDias(-300), proximaDosis: enDias(5) },
    ]);
    await page.goto(`/members/${memberId}/pets`);
    await expect(page.locator('main').first()).toBeVisible();

    // El número no se anuncia solo con un punto de color: está en el nombre.
    await expect(
      page.getByRole('link', { name: /Ver las vacunas de MASCOTA-E2E-VAC: 2 por revisar/ }),
    ).toBeVisible();
  });
});
