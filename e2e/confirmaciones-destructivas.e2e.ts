import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Confirmación de acciones irreversibles (C1.3b).
 *
 * Las cuatro acciones que destruyen datos clínicos sin vuelta atrás —borrar un
 * medicamento con sus recordatorios, borrar un registro del historial,
 * inactivar a un familiar y eliminarlo para siempre— se preguntaban con
 * `window.confirm`. Ese cuadro lo pinta el navegador, no la aplicación: no
 * tiene nombre accesible, no se puede estilar, no se puede probar por rol, y en
 * un PWA instalado aparece como un aviso del sistema ajeno a la pantalla.
 *
 * Estas pruebas fijan el contrato que sustituye a `confirm`:
 *
 *   1. La acción NO ocurre hasta que alguien la confirma explícitamente.
 *   2. Escape cancela. Nunca confirma.
 *   3. El diálogo se localiza por rol y por nombre accesible, que es como lo
 *      encuentra un lector de pantalla.
 *   4. El foco inicial NO está en el botón destructivo, para que un Intro
 *      reflejo no borre nada.
 *
 * Se escribieron ANTES de la migración: con `window.confirm` fallan, porque
 * Playwright descarta los cuadros nativos y no existe ningún `role=dialog`.
 */

/** Identificador del primer familiar vivo de la base de demostración. */
async function primerFamiliar(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const vivos = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
    return vivos[0]?.id ?? null;
  });
  expect(id, 'la base de demostración debe traer al menos un familiar').toBeTruthy();
  return id as string;
}

/**
 * Siembra una prescripción sintética en el expediente de demostración.
 *
 * La base de demostración no trae medicamentos, y crearlos por la interfaz
 * gastaría medio minuto por prueba rellenando un formulario que no es lo que
 * se está midiendo aquí.
 */
async function sembrarMedicamento(
  page: Page,
  memberId: string,
  nombre: string,
  estado: 'ACTIVE' | 'COMPLETED',
) {
  await page.evaluate(
    (datos) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      e.medicationPrescriptions = [
        ...(e.medicationPrescriptions ?? []),
        {
          id: 'presc-e2e-' + datos.estado.toLowerCase(),
          memberId: datos.memberId,
          name: datos.nombre,
          dose: '1 tableta',
          quantity: 1,
          quantityUnit: 'TABLETA',
          durationDays: 5,
          frequencyType: 'INTERVAL_HOURS',
          frequencyIntervalHours: 8,
          startDate: ahora.slice(0, 10),
          endDate: ahora.slice(0, 10),
          status: datos.estado,
          createdAt: ahora,
          updatedAt: ahora,
        },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    },
    { memberId, nombre, estado },
  );
}

/** Cuenta las prescripciones vivas del expediente de demostración. */
async function prescripcionesVivas(page: Page): Promise<number> {
  return page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const vivas = (e.medicationPrescriptions ?? []).filter(
      (p: { deletedAt?: unknown }) => !p.deletedAt,
    );
    return vivas.length;
  });
}

/**
 * Comprueba el contrato completo sobre un diálogo ya abierto: nombre
 * accesible, foco fuera del botón destructivo y Escape que cancela.
 */
async function verificarContrato(page: Page, titulo: string, botonDestructivo: string) {
  const dialogo = page.getByRole('dialog', { name: titulo });
  await expect(dialogo, 'no apareció el diálogo ' + titulo).toBeVisible();

  // El foco inicial no puede estar en el botón que destruye.
  const destructivoEnfocado = await dialogo
    .getByRole('button', { name: botonDestructivo })
    .evaluate((b) => b === document.activeElement);
  expect(destructivoEnfocado, 'el botón destructivo no debe tener el foco inicial').toBe(false);

  // Escape cancela.
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
}

test.describe('C1.3b · acciones irreversibles', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('eliminar un medicamento exige confirmación explícita', async ({ page }) => {
    const id = await primerFamiliar(page);
    await sembrarMedicamento(page, id, 'MEDICAMENTO-E2E-ACTIVO', 'ACTIVE');
    await page.goto('/members/' + id + '/medications');
    await expect(page.getByText('MEDICAMENTO-E2E-ACTIVO')).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    await verificarContrato(page, 'Eliminar medicamento', 'Eliminar definitivamente');

    // Tras cancelar con Escape el medicamento sigue ahí.
    expect(await prescripcionesVivas(page)).toBe(1);
    await expect(page.getByText('MEDICAMENTO-E2E-ACTIVO')).toBeVisible();

    // Solo al confirmar desaparece.
    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    await page
      .getByRole('dialog', { name: 'Eliminar medicamento' })
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click();
    await expect(page.getByText('MEDICAMENTO-E2E-ACTIVO')).toBeHidden();
    expect(await prescripcionesVivas(page)).toBe(0);
  });

  test('eliminar un registro del historial exige confirmación explícita', async ({ page }) => {
    const id = await primerFamiliar(page);
    await sembrarMedicamento(page, id, 'MEDICAMENTO-E2E-HISTORIAL', 'COMPLETED');
    await page.goto('/members/' + id + '/medications');
    await page.getByRole('button', { name: /Historial \/ Inactivos/ }).click();
    await expect(page.getByText('MEDICAMENTO-E2E-HISTORIAL')).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    await verificarContrato(page, 'Eliminar registro del historial', 'Eliminar definitivamente');

    expect(await prescripcionesVivas(page)).toBe(1);

    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    await page
      .getByRole('dialog', { name: 'Eliminar registro del historial' })
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click();
    expect(await prescripcionesVivas(page)).toBe(0);
  });

  test('inactivar y eliminar un familiar exigen confirmación explícita', async ({ page }) => {
    // Se crea uno nuevo: eliminar de verdad exige que no tenga historial.
    await page.goto('/members/new');
    await page.getByPlaceholder('Ej. Juan Pérez').fill('Familiar E2E Confirmacion');
    await page.getByPlaceholder(/Ej\. 10203/).fill(String(Date.now()).slice(-9));
    await page.getByRole('button', { name: 'Guardar Familiar' }).click();
    await page.waitForURL(/\/members/, { timeout: 20_000 });

    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const m = (e.members ?? []).find(
        (x: { fullName: string; deletedAt?: unknown }) =>
          x.fullName === 'Familiar E2E Confirmacion' && !x.deletedAt,
      );
      return m?.id ?? null;
    });
    expect(id, 'el familiar sintético debe haberse creado').toBeTruthy();

    await page.goto('/members/' + id);

    // 1 · Inactivar.
    await page.getByRole('button', { name: 'Inactivar Familiar' }).click();
    await verificarContrato(page, 'Inactivar familiar', 'Inactivar familiar');
    await expect(page.getByRole('button', { name: 'Inactivar Familiar' })).toBeVisible();

    // 2 · Eliminar permanentemente.
    await page.getByRole('button', { name: 'Eliminar Familiar' }).click();
    await verificarContrato(page, 'Eliminar familiar permanentemente', 'Eliminar definitivamente');
    await expect(page).toHaveURL(new RegExp('/members/' + id));

    await page.getByRole('button', { name: 'Eliminar Familiar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar familiar permanentemente' })
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click();
    await page.waitForURL('**/members', { timeout: 20_000 });

    const sigueVivo = await page.evaluate((memberId) => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      return (e.members ?? []).some(
        (m: { id: string; deletedAt?: unknown }) => m.id === memberId && !m.deletedAt,
      );
    }, id);
    expect(sigueVivo, 'el familiar debe haberse eliminado tras confirmar').toBe(false);
  });
});
