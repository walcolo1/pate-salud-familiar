import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Controles de peso de mascotas (Bloque D, D2).
 *
 * Ningún dato de aquí corresponde a un animal real.
 *
 * Lo que se fija: que un pesaje se registra y aparece, que la gráfica se
 * puede **leer sin verla** —cada punto tiene nombre y hay una tabla con la
 * misma serie—, que la alerta de desviación no depende solo del color, y que
 * la validación impide guardar un peso imposible.
 */

const dd = (n: number) => String(n).padStart(2, '0');
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};
const haceDias = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};

/** Siembra una mascota con peso ideal y, si se pide, algunos pesajes. */
async function sembrarMascota(
  page: Page,
  opciones: { pesoIdealKg?: number | null; pesajes?: Array<{ fecha: string; pesoKg: number; nota?: string }> } = {},
) {
  return page.evaluate((op) => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
    const ahora = new Date().toISOString();

    e.pets = [
      {
        id: 'pet-e2e-peso',
        familyId: 'local',
        memberId: uno.id,
        nombre: 'MASCOTA-E2E-PESO',
        especie: 'GATO',
        sexo: 'HEMBRA',
        activo: true,
        pesoIdealKg: op.pesoIdealKg ?? null,
        pesoActualKg: op.pesajes?.length ? op.pesajes[op.pesajes.length - 1].pesoKg : null,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
      },
    ];

    e.petWeights = (op.pesajes ?? []).map((p, i) => ({
      id: `peso-e2e-${i}`,
      petId: 'pet-e2e-peso',
      memberId: uno.id,
      fecha: p.fecha,
      pesoKg: p.pesoKg,
      nota: p.nota ?? null,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }));

    localStorage.setItem(clave, JSON.stringify(e));
    return { memberId: uno.id as string, petId: 'pet-e2e-peso' };
  }, opciones);
}

/**
 * Un punto de la gráfica.
 *
 * Se localiza por la forma exacta de su nombre —«8 sep: 4.4 kg»— porque el
 * resumen del SVG completo también menciona los pesos («de 3.8 kg a 4.4 kg»)
 * y un patrón suelto encontraría los dos.
 */
const punto = (page: Page, kg: string) =>
  // Subcadena con los dos puntos delante: el resumen del SVG dice «de 3.8 kg
  // a 4.4 kg», y ese no contiene «: 4.4 kg».
  page.getByRole('img', { name: `: ${kg} kg` });

/** El aviso de la aplicación, no el anunciador de rutas de Next. */
const avisoDeError = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'Mascota no encontrada' });

/** Los pesajes guardados. */
const leerPesajes = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.petWeights ?? []) as Array<{ id: string; fecha: string; pesoKg: number; nota: string | null }>;
  });

const leerPesoActual = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.pets ?? [])[0]?.pesoActualKg ?? null;
  });

test.describe('D2 · peso de mascotas', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('P1 · sin pesajes, la pantalla dice qué hacer', async ({ page }) => {
    const { memberId, petId } = await sembrarMascota(page);
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('Aún no hay registros de peso')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar peso' }).last()).toBeVisible();
  });

  test('P2 · se registra un pesaje y actualiza el peso actual de la mascota', async ({ page }) => {
    const { memberId, petId } = await sembrarMascota(page, { pesoIdealKg: 4 });
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);

    await page.getByRole('button', { name: 'Registrar peso' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar peso' });
    await expect(dialogo).toBeVisible();

    await dialogo.getByLabel('Peso (kg)').fill('4.2');
    await dialogo.getByLabel('Nota (opcional)').fill('NOTA-E2E');
    await dialogo.getByRole('button', { name: 'Guardar pesaje' }).click();
    await expect(dialogo).toBeHidden();

    const pesajes = await leerPesajes(page);
    expect(pesajes).toHaveLength(1);
    expect(pesajes[0].pesoKg).toBe(4.2);
    expect(pesajes[0].fecha).toBe(hoy());
    expect(pesajes[0].nota).toBe('NOTA-E2E');

    // `pesoActualKg` es un reflejo del pesaje más reciente.
    expect(await leerPesoActual(page)).toBe(4.2);
  });

  test('P3 · la validación impide guardar un peso imposible', async ({ page }) => {
    const { memberId, petId } = await sembrarMascota(page);
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);
    await page.getByRole('button', { name: 'Registrar peso' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar peso' });

    // Vacío: `Number('')` es 0, y un cero no es un peso.
    await dialogo.getByRole('button', { name: 'Guardar pesaje' }).click();
    await expect(dialogo.getByRole('alert')).toBeVisible();
    expect(await leerPesajes(page)).toHaveLength(0);

    // Gramos escritos como kilos.
    await dialogo.getByLabel('Peso (kg)').fill('4500');
    await dialogo.getByRole('button', { name: 'Guardar pesaje' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('120');
    expect(await leerPesajes(page)).toHaveLength(0);

    // Fecha futura.
    await dialogo.getByLabel('Peso (kg)').fill('4.2');
    await dialogo.getByLabel('Fecha del pesaje').fill('2099-01-01');
    await dialogo.getByRole('button', { name: 'Guardar pesaje' }).click();
    await expect(dialogo.getByRole('alert')).toBeVisible();
    expect(await leerPesajes(page)).toHaveLength(0);

    // Corregido, entra.
    await dialogo.getByLabel('Fecha del pesaje').fill(hoy());
    await dialogo.getByRole('button', { name: 'Guardar pesaje' }).click();
    await expect(dialogo).toBeHidden();
    expect(await leerPesajes(page)).toHaveLength(1);
  });

  test('P4 · la gráfica se puede leer sin verla', async ({ page }) => {
    const { memberId, petId } = await sembrarMascota(page, {
      pesoIdealKg: 4,
      pesajes: [
        { fecha: haceDias(20), pesoKg: 3.8 },
        { fecha: haceDias(10), pesoKg: 4.1, nota: 'NOTA-DEL-PUNTO' },
        { fecha: haceDias(1), pesoKg: 4.4 },
      ],
    });
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);
    await expect(page.locator('main').first()).toBeVisible();

    // 1 · La gráfica entera tiene un resumen en texto.
    const figura = page.getByRole('img', { name: /Evolución del peso de MASCOTA-E2E-PESO/ });
    await expect(figura).toBeVisible();

    // 2 · Cada punto se anuncia con su fecha y su peso, y con su nota.
    await expect(punto(page, '4.4')).toBeVisible();
    await expect(page.getByRole('img', { name: /NOTA-DEL-PUNTO/ })).toBeVisible();

    // 3 · Y la misma serie está como tabla, con encabezados de verdad.
    const tabla = page.getByRole('table');
    await expect(tabla).toBeVisible();
    await expect(tabla.getByRole('columnheader', { name: 'Peso' })).toBeVisible();
    await expect(tabla.getByRole('cell', { name: '4.4 kg' })).toBeVisible();
    await expect(tabla.getByRole('cell', { name: 'NOTA-DEL-PUNTO' })).toBeVisible();
  });

  test('P5 · los puntos de la gráfica se recorren con el teclado', async ({ page }) => {
    const { memberId, petId } = await sembrarMascota(page, {
      pesajes: [
        { fecha: haceDias(10), pesoKg: 4 },
        { fecha: haceDias(1), pesoKg: 4.5 },
      ],
    });
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);

    await punto(page, '4.5').focus();

    const enfocado = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? '',
    );
    expect(enfocado, 'un punto de la gráfica debe poder recibir el foco').toContain('4.5 kg');
  });

  test('P6 · la alerta de desviación no depende solo del color', async ({ page }) => {
    // 5,0 sobre un ideal de 4,0 son +25 %: alerta.
    const { memberId, petId } = await sembrarMascota(page, {
      pesoIdealKg: 4,
      pesajes: [{ fecha: haceDias(1), pesoKg: 5 }],
    });
    await page.goto(`/members/${memberId}/pets/${petId}/peso`);

    const aviso = page.getByRole('status').filter({ hasText: 'ideal' });
    await expect(aviso).toBeVisible();
    await expect(aviso, 'la alerta tiene que decir el número').toContainText('25');
    await expect(aviso).toContainText('encima');
    await expect(aviso, 'y qué se espera de quien lo lee').toContainText('veterinario');
  });

  test('P7 · un 12 % avisa sin alarmar, y sin peso ideal no inventa alertas', async ({ page }) => {
    // 4,48 sobre 4,0 son +12 %: advertencia, no alerta.
    const a = await sembrarMascota(page, {
      pesoIdealKg: 4,
      pesajes: [{ fecha: haceDias(1), pesoKg: 4.48 }],
    });
    await page.goto(`/members/${a.memberId}/pets/${a.petId}/peso`);
    const aviso = page.getByRole('status').filter({ hasText: 'ideal' });
    await expect(aviso).toContainText('Conviene vigilarlo');
    await expect(aviso).not.toContainText('veterinario');

    // Sin peso ideal, no hay nada que comparar y así se dice.
    const b = await sembrarMascota(page, {
      pesoIdealKg: null,
      pesajes: [{ fecha: haceDias(1), pesoKg: 4.48 }],
    });
    await page.goto(`/members/${b.memberId}/pets/${b.petId}/peso`);
    await expect(page.getByRole('status').filter({ hasText: 'Sin peso ideal' })).toBeVisible();
  });

  test('P8 · una mascota que no existe se explica y ofrece salida', async ({ page }) => {
    const { memberId } = await sembrarMascota(page);
    await page.goto(`/members/${memberId}/pets/no-existe/peso`);
    await expect(page.locator('main').first()).toBeVisible();

    const error = avisoDeError(page);
    await expect(error).toContainText('Mascota no encontrada');
    await expect(error.getByRole('link', { name: 'Volver a las mascotas' })).toBeVisible();
  });
});
