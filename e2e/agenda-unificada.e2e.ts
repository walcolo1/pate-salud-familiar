import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Agenda unificada (C3.1).
 *
 * Las citas, las tomas y los controles viven en tres estructuras que no se
 * parecen: tres nombres de campo temporal, dos granularidades y dos catálogos
 * de estado incompatibles. Para saber qué le tocaba hoy a la familia había que
 * abrir tres pantallas.
 *
 * Estas pruebas siembran un evento de CADA origen el mismo día y exigen que
 * los tres aparezcan juntos, que el filtro por familiar funcione y que la
 * navegación por mes y semana lleve de verdad a otro periodo.
 *
 * Ninguno de los datos sembrados corresponde a una persona ni a un
 * tratamiento real.
 */

const HOY = new Date();
const dd = (n: number) => String(n).padStart(2, '0');
const FECHA_HOY = `${HOY.getFullYear()}-${dd(HOY.getMonth() + 1)}-${dd(HOY.getDate())}`;

/** Siembra una cita, una toma y un control para dos familiares distintos. */
async function sembrarAgenda(page: Page) {
  return page.evaluate((fecha) => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const vivos = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
    const uno = vivos[0];
    const dos = vivos[1] ?? vivos[0];
    const ahora = new Date().toISOString();

    e.appointments = [
      ...(e.appointments ?? []),
      {
        id: 'cita-agenda-e2e',
        memberId: uno.id,
        doctorName: 'Profesional Sintetico',
        specialty: 'ESPECIALIDAD-E2E',
        scheduledAt: `${fecha}T08:30`,
        reason: 'Control sintetico',
        status: 'SCHEDULED',
        documentIds: [],
        createdAt: ahora,
        updatedAt: ahora,
      },
    ];

    e.medicationDoseReminders = [
      ...(e.medicationDoseReminders ?? []),
      {
        id: 'dosis-agenda-e2e',
        prescriptionId: 'presc-agenda-e2e',
        memberId: uno.id,
        medicationName: 'MEDICAMENTO-E2E',
        dose: '1 tableta',
        scheduledAt: `${fecha}T20:00`,
        status: 'PENDING',
        createdAt: ahora,
        updatedAt: ahora,
      },
    ];

    e.checkups = [
      ...(e.checkups ?? []),
      {
        id: 'control-agenda-e2e',
        memberId: dos.id,
        checkupType: 'CONTROL-E2E',
        scheduledDate: fecha,
        status: 'SCHEDULED',
        createdAt: ahora,
        updatedAt: ahora,
      },
    ];

    localStorage.setItem(clave, JSON.stringify(e));
    return { uno: uno.fullName, dos: dos.fullName, mismoFamiliar: uno.id === dos.id };
  }, FECHA_HOY);
}

test.describe('C3.1 · agenda unificada', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('G1 · los tres orígenes aparecen en la misma pantalla', async ({ page }) => {
    await sembrarAgenda(page);
    await page.goto('/agenda');
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();
    await expect(page.getByText('MEDICAMENTO-E2E')).toBeVisible();
    await expect(page.getByText('CONTROL-E2E')).toBeVisible();

    // Y cada uno dice de qué origen viene, que es lo que los distingue.
    await expect(page.getByText('Cita', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Toma', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Control', { exact: true }).first()).toBeVisible();
  });

  test('G2 · dentro del día, la cita de la mañana va antes que la toma de la noche', async ({ page }) => {
    await sembrarAgenda(page);
    await page.goto('/agenda');
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();

    const textos = await page.locator('main article li').allInnerTexts();
    const iCita = textos.findIndex((t) => t.includes('ESPECIALIDAD-E2E'));
    const iDosis = textos.findIndex((t) => t.includes('MEDICAMENTO-E2E'));
    expect(iCita).toBeGreaterThanOrEqual(0);
    expect(iDosis).toBeGreaterThan(iCita);
  });

  test('G3 · el filtro por familiar deja fuera lo que no es suyo', async ({ page }) => {
    const sembrado = await sembrarAgenda(page);
    test.skip(sembrado.mismoFamiliar, 'la base de demostración necesita dos familiares');

    await page.goto('/agenda');
    await expect(page.getByText('CONTROL-E2E')).toBeVisible();

    await page.getByLabel('Familiar').selectOption({ label: sembrado.uno });

    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();
    await expect(page.getByText('CONTROL-E2E'), 'el control es de otro familiar').toBeHidden();

    // Volver a toda la familia lo devuelve.
    await page.getByLabel('Familiar').selectOption({ label: 'Toda la familia' });
    await expect(page.getByText('CONTROL-E2E')).toBeVisible();
  });

  test('G4 · la navegación por mes y semana cambia de periodo, y «Hoy» vuelve', async ({ page }) => {
    await sembrarAgenda(page);
    await page.goto('/agenda');
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();

    // Un mes adelante: lo sembrado hoy ya no está.
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeHidden();

    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();

    // En vista de semana sigue estando, y una semana atrás ya no.
    await page.getByRole('button', { name: 'Semana' }).click();
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeHidden();
  });

  test('G5 · el periodo vacío explica qué hacer y el filtro tiene salida', async ({ page }) => {
    await sembrarAgenda(page);
    await page.goto('/agenda');

    // Un año por delante: no hay nada sembrado ahí.
    for (let i = 0; i < 12; i++) {
      await page.getByRole('button', { name: 'Mes siguiente' }).click();
    }

    await expect(page.getByText('Sin eventos en este periodo')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ir a familiares' }),
      'un estado vacío sin salida deja a la persona parada',
    ).toBeVisible();
  });

  test('G6 · la agenda no habla con Google', async ({ page }) => {
    const intentos: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/googleapis\.com|calendar\.google|accounts\.google\.com\/o\//.test(u)) intentos.push(u);
    });

    await sembrarAgenda(page);
    await page.goto('/agenda');
    await expect(page.getByText('ESPECIALIDAD-E2E')).toBeVisible();
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await page.getByRole('button', { name: 'Semana' }).click();

    expect(intentos, `la agenda contactó a Google: ${intentos.join(', ')}`).toEqual([]);
  });
});
