import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Pautas de medicación recurrentes (C3.4).
 *
 * Un tratamiento genera una toma por cada momento de su pauta, y cada toma es
 * un registro del expediente. Tres cosas tenían que quedar fijadas:
 *
 *   1. Que las tomas se generan de verdad a partir de la pauta.
 *   2. Que hay un **tope** y se avisa ANTES de guardar, no después de haber
 *      creado cuatrocientos registros.
 *   3. Que cambiar la pauta **no borra lo ya ocurrido**. Regenerar sin más
 *      habría borrado las tomas marcadas, y eso falsifica el historial.
 */

const dd = (n: number) => String(n).padStart(2, '0');
const comoFecha = (d: Date) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;

/** Siembra un tratamiento con tomas: unas ya tomadas y otras por venir. */
async function sembrarTratamiento(page: Page) {
  return page.evaluate(() => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
    const ahora = new Date();
    const dd2 = (n: number) => String(n).padStart(2, '0');
    const fecha = (dias: number) => {
      const d = new Date(ahora.getTime() + dias * 86_400_000);
      return `${d.getFullYear()}-${dd2(d.getMonth() + 1)}-${dd2(d.getDate())}`;
    };

    e.medicationPrescriptions = [
      {
        id: 'presc-c34',
        memberId: uno.id,
        name: 'MEDICAMENTO-PAUTA-E2E',
        dose: '1 tableta',
        quantity: 1,
        quantityUnit: 'tablets',
        durationDays: 6,
        frequencyType: 'ONCE_DAILY',
        startDate: fecha(-3),
        endDate: fecha(3),
        status: 'ACTIVE',
        createdAt: ahora.toISOString(),
        updatedAt: ahora.toISOString(),
      },
    ];

    e.medicationDoseReminders = [
      // Ya ocurridas: son el historial y no pueden desaparecer.
      {
        id: 'dose-presc-c34-0000',
        prescriptionId: 'presc-c34',
        memberId: uno.id,
        medicationName: 'MEDICAMENTO-PAUTA-E2E',
        dose: '1 tableta',
        scheduledAt: `${fecha(-3)}T08:00`,
        status: 'TAKEN',
        createdAt: ahora.toISOString(),
        updatedAt: ahora.toISOString(),
      },
      {
        id: 'dose-presc-c34-0001',
        prescriptionId: 'presc-c34',
        memberId: uno.id,
        medicationName: 'MEDICAMENTO-PAUTA-E2E',
        dose: '1 tableta',
        scheduledAt: `${fecha(-2)}T08:00`,
        status: 'MISSED',
        createdAt: ahora.toISOString(),
        updatedAt: ahora.toISOString(),
      },
      // Futura: esta sí puede reemplazarse.
      {
        id: 'dose-presc-c34-0002',
        prescriptionId: 'presc-c34',
        memberId: uno.id,
        medicationName: 'MEDICAMENTO-PAUTA-E2E',
        dose: '1 tableta',
        scheduledAt: `${fecha(2)}T08:00`,
        status: 'PENDING',
        createdAt: ahora.toISOString(),
        updatedAt: ahora.toISOString(),
      },
    ];

    localStorage.setItem(clave, JSON.stringify(e));
    return { id: uno.id as string };
  });
}

/** Estado de las tomas del tratamiento sembrado. */
const leerTomas = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const tomas = (e.medicationDoseReminders ?? []).filter(
      (d: { prescriptionId: string; deletedAt?: unknown }) =>
        d.prescriptionId === 'presc-c34' && !d.deletedAt,
    );
    return {
      total: tomas.length,
      porEstado: tomas.reduce((acc: Record<string, number>, d: { status: string }) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      }, {}),
      ids: tomas.map((d: { id: string }) => d.id) as string[],
      momentos: (tomas.map((d: { scheduledAt: string }) => d.scheduledAt) as string[]).sort(),
    };
  });

test.describe('C3.4 · pautas recurrentes', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('R1 · el editor de pauta dice cuántas tomas saldrán antes de guardar', async ({ page }) => {
    const { id } = await sembrarTratamiento(page);
    await page.goto(`/members/${id}/medications`);
    await expect(page.getByText('MEDICAMENTO-PAUTA-E2E')).toBeVisible();

    await page.getByRole('button', { name: 'Editar pauta' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Editar pauta del tratamiento' });
    await expect(dialogo).toBeVisible();

    // Sin tocar nada ya dice lo que va a pasar.
    await expect(dialogo).toContainText(/Se generarán \d+ tomas/);
    await expect(dialogo).toContainText(/se conservarán \d+ ya registradas/);
  });

  test('R2 · una pauta desmedida avisa del tope ANTES de crear nada', async ({ page }) => {
    const { id } = await sembrarTratamiento(page);
    await page.goto(`/members/${id}/medications`);
    await page.getByRole('button', { name: 'Editar pauta' }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Editar pauta del tratamiento' });
    const hoy = new Date();

    await dialogo.getByLabel('Inicio').fill(comoFecha(hoy));
    await dialogo.getByLabel('Fin').fill(comoFecha(new Date(hoy.getTime() + 730 * 86_400_000)));
    await dialogo.getByLabel('Frecuencia').selectOption('EVERY_X_HOURS');
    await dialogo.getByLabel('Cada cuántas horas').fill('2');

    const aviso = dialogo.getByRole('alert');
    await expect(aviso, 'una pauta de dos años cada dos horas debe avisar').toBeVisible();
    await expect(aviso).toContainText('Se crearán solo las 400 primeras');

    // Y no se ha creado nada todavía: el aviso llega antes de guardar.
    expect((await leerTomas(page)).total).toBe(3);
  });

  test('R3 · cambiar la pauta conserva lo ya tomado y lo ya fallado', async ({ page }) => {
    const { id } = await sembrarTratamiento(page);
    const antes = await leerTomas(page);
    expect(antes.porEstado.TAKEN).toBe(1);
    expect(antes.porEstado.MISSED).toBe(1);

    await page.goto(`/members/${id}/medications`);
    await page.getByRole('button', { name: 'Editar pauta' }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Editar pauta del tratamiento' });
    // Dos veces al día en vez de una: cambia lo que viene, no lo que pasó.
    await dialogo.getByLabel('Frecuencia').selectOption('TWICE_DAILY');
    await dialogo.getByRole('button', { name: 'Guardar pauta' }).click();
    await expect(dialogo).toBeHidden();

    await expect
      .poll(async () => (await leerTomas(page)).porEstado.TAKEN, { timeout: 10_000 })
      .toBe(1);

    const despues = await leerTomas(page);
    expect(despues.porEstado.MISSED, 'una toma fallada no puede desaparecer').toBe(1);
    expect(
      despues.ids,
      'los identificadores del historial deben seguir siendo los mismos',
    ).toContain('dose-presc-c34-0000');
    expect(despues.ids).toContain('dose-presc-c34-0001');

    // Y hay tomas nuevas por delante.
    expect(despues.total).toBeGreaterThan(2);
  });

  test('R4 · no quedan tomas con el identificador repetido', async ({ page }) => {
    const { id } = await sembrarTratamiento(page);
    await page.goto(`/members/${id}/medications`);
    await page.getByRole('button', { name: 'Editar pauta' }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Editar pauta del tratamiento' });
    await dialogo.getByLabel('Frecuencia').selectOption('THREE_TIMES_DAILY');
    await dialogo.getByRole('button', { name: 'Guardar pauta' }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(async () => (await leerTomas(page)).total, { timeout: 10_000 }).toBeGreaterThan(3);

    const { ids } = await leerTomas(page);
    expect(
      new Set(ids).size,
      'dos tomas con el mismo id: marcar una marcaría la otra',
    ).toBe(ids.length);
  });

  test('R5 · la pauta nueva no reescribe el pasado', async ({ page }) => {
    const { id } = await sembrarTratamiento(page);
    await page.goto(`/members/${id}/medications`);
    await page.getByRole('button', { name: 'Editar pauta' }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Editar pauta del tratamiento' });
    // Se adelanta el inicio a hoy: lo anterior a hoy ya no está en la pauta.
    await dialogo.getByLabel('Inicio').fill(comoFecha(new Date()));
    await dialogo.getByRole('button', { name: 'Guardar pauta' }).click();
    await expect(dialogo).toBeHidden();

    await expect
      .poll(async () => (await leerTomas(page)).porEstado.TAKEN, { timeout: 10_000 })
      .toBe(1);

    const { momentos } = await leerTomas(page);
    const ahora = new Date();
    const marcaHoy = `${comoFecha(ahora)}T${dd(ahora.getHours())}:${dd(ahora.getMinutes())}`;

    // Las tomas del pasado siguen ahí aunque la pauta nueva ya no las cubra.
    expect(momentos.some((m) => m < marcaHoy)).toBe(true);
  });
});
