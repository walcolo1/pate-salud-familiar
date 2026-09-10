import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Mascotas (Bloque D, D1).
 *
 * Ningún nombre ni raza de aquí corresponde a un animal real.
 *
 * Lo que se fija en este paso: que una mascota se crea y aparece, que la
 * validación impide guardar datos imposibles, que **inactivar no borra**, y
 * que la pantalla nace con los tres estados del Bloque C en lugar de
 * añadírselos después.
 */

/** Identificador del primer familiar vivo de la demostración. */
async function primerFamiliar(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const vivos = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
    return vivos[0]?.id ?? null;
  });
  expect(id, 'la base de demostración debe traer al menos un familiar').toBeTruthy();
  return id as string;
}

/** Las mascotas guardadas en el expediente. */
const leerMascotas = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.pets ?? []) as Array<{
      id: string;
      nombre: string;
      especie: string;
      activo: boolean;
      memberId: string;
      deletedAt?: string | null;
    }>;
  });

async function abrirFormulario(page: Page) {
  await page.getByRole('button', { name: 'Registrar mascota', exact: true }).first().click();
  const dialogo = page.getByRole('dialog', { name: 'Registrar mascota' });
  await expect(dialogo).toBeVisible({ timeout: 10_000 });
  return dialogo;
}

test.describe('D1 · mascotas', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('M1 · sin mascotas, la pantalla dice qué hacer', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('Sin mascotas registradas').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar mascota', exact: true }).last(),
      'un estado vacío sin salida deja a la persona parada',
    ).toBeVisible();
  });

  test('M2 · se crea una mascota y aparece en la lista', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const dialogo = await abrirFormulario(page);
    await dialogo.getByLabel('Nombre').fill('MASCOTA-E2E');
    await dialogo.getByLabel('Especie').selectOption('GATO');
    await dialogo.getByLabel('Sexo').selectOption('HEMBRA');
    await dialogo.getByLabel('Raza (opcional)').fill('RAZA-E2E');
    await dialogo.getByLabel('Peso actual (kg)').fill('4.3');
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();

    await expect(dialogo).toBeHidden();
    await expect(page.getByText('MASCOTA-E2E')).toBeVisible();
    await expect(page.getByText('RAZA-E2E')).toBeVisible();

    const guardadas = await leerMascotas(page);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].especie).toBe('GATO');
    expect(guardadas[0].memberId, 'la mascota debe colgar de su familiar').toBe(id);
    expect(guardadas[0].activo).toBe(true);
  });

  test('M3 · la validación impide guardar datos imposibles', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const dialogo = await abrirFormulario(page);

    // Sin nombre no se guarda, y el diálogo se queda abierto.
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('alert')).toContainText('nombre');
    expect(await leerMascotas(page)).toHaveLength(0);

    // 4500 kg es un error de unidades, y el mensaje lo dice.
    await dialogo.getByLabel('Nombre').fill('MASCOTA-E2E-PESO');
    await dialogo.getByLabel('Peso actual (kg)').fill('4500');
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(dialogo.getByRole('alert')).toContainText('gramos');
    expect(await leerMascotas(page)).toHaveLength(0);

    // Corregido, sí entra.
    await dialogo.getByLabel('Peso actual (kg)').fill('4.5');
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(dialogo).toBeHidden();
    expect(await leerMascotas(page)).toHaveLength(1);
  });

  test('M4 · una fecha de nacimiento futura se rechaza', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const dialogo = await abrirFormulario(page);
    await dialogo.getByLabel('Nombre').fill('MASCOTA-E2E-FECHA');
    await dialogo.getByLabel('Fecha de nacimiento (opcional)').fill('2099-01-01');
    await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();

    await expect(dialogo.getByRole('alert')).toContainText('futuro');
    expect(await leerMascotas(page)).toHaveLength(0);
  });

  test('M5 · editar cambia los datos sin crear otra', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const alta = await abrirFormulario(page);
    await alta.getByLabel('Nombre').fill('MASCOTA-E2E-ORIGINAL');
    await alta.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(alta).toBeHidden();

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const edicion = page.getByRole('dialog', { name: 'Editar mascota' });
    await expect(edicion).toBeVisible();
    await expect(edicion.getByLabel('Nombre'), 'el formulario debe venir relleno').toHaveValue(
      'MASCOTA-E2E-ORIGINAL',
    );

    await edicion.getByLabel('Nombre').fill('MASCOTA-E2E-EDITADA');
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(edicion).toBeHidden();

    await expect(page.getByText('MASCOTA-E2E-EDITADA')).toBeVisible();
    const guardadas = await leerMascotas(page);
    expect(guardadas, 'editar no puede crear una segunda mascota').toHaveLength(1);
    expect(guardadas[0].nombre).toBe('MASCOTA-E2E-EDITADA');
  });

  test('M6 · marcar inactiva NO borra, y se puede reactivar', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const alta = await abrirFormulario(page);
    await alta.getByLabel('Nombre').fill('MASCOTA-E2E-INACTIVA');
    await alta.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(alta).toBeHidden();

    await page.getByRole('button', { name: 'Marcar inactiva', exact: true }).first().click();
    const confirmacion = page.getByRole('dialog', { name: 'Marcar mascota como inactiva' });
    await expect(confirmacion).toBeVisible();
    await confirmacion.getByRole('button', { name: 'Marcar inactiva', exact: true }).click();

    await expect(page.getByText('Inactiva', { exact: true })).toBeVisible();

    const tras = await leerMascotas(page);
    expect(tras, 'inactivar no puede borrar el registro').toHaveLength(1);
    expect(tras[0].activo).toBe(false);
    expect(tras[0].deletedAt ?? null, 'no es un borrado suave, es un cambio de estado').toBeNull();

    // Y sigue visible, porque su historial se conserva.
    await expect(page.getByText('MASCOTA-E2E-INACTIVA')).toBeVisible();

    await page.getByRole('button', { name: 'Reactivar' }).first().click();
    await expect(page.getByText('Inactiva', { exact: true })).toBeHidden();
  });

  test('M7 · «Mascotas» es una sección más de la ficha', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/appts`);

    const navegacion = page.getByRole('navigation', { name: 'Secciones del expediente' });
    await navegacion.getByRole('link', { name: 'Mascotas' }).click();

    await expect(page).toHaveURL(new RegExp(`/members/${id}/pets`));
    await expect(navegacion.getByRole('link', { name: 'Mascotas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Y el armazón sigue diciendo de quién es el expediente.
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  });

  test('M8 · las mascotas entran en el respaldo', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/pets`);

    const alta = await abrirFormulario(page);
    await alta.getByLabel('Nombre').fill('MASCOTA-E2E-RESPALDO');
    await alta.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
    await expect(alta).toBeHidden();

    // Un respaldo que no las incluye es una trampa: se descubre cuando ya no
    // están. Se comprueba sobre el expediente que el exportador serializa.
    const guardado = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}'),
    );
    expect(Array.isArray(guardado.pets)).toBe(true);
    expect(guardado.pets).toHaveLength(1);
  });
});
