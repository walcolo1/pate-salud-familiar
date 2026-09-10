import { test, expect } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Coherencia de la ficha del familiar (C3.3).
 *
 * Las nueve secciones del expediente traían la misma cabecera copiada, con un
 * único enlace: «Volver al perfil». Para pasar de las citas a las vacunas
 * había que subir al perfil y bajar otra vez. Y ninguna decía **de quién** era
 * el expediente: con la aplicación abierta en «Vacunas» no había forma de
 * saber si eran las de un hijo o las del titular sin volver atrás.
 *
 * Estas pruebas fijan lo contrario: que se puede saltar entre secciones, que
 * en todas se sabe de quién se trata, y que todas explican qué hacer cuando
 * están vacías.
 */

const SECCIONES = [
  { segmento: 'health', etiqueta: 'Ficha médica' },
  { segmento: 'appts', etiqueta: 'Citas' },
  { segmento: 'checkups', etiqueta: 'Controles' },
  { segmento: 'vaccines', etiqueta: 'Vacunas' },
  { segmento: 'exams', etiqueta: 'Exámenes' },
  { segmento: 'documents', etiqueta: 'Documentos' },
  { segmento: 'orders', etiqueta: 'Órdenes' },
  { segmento: 'medications', etiqueta: 'Medicamentos' },
  { segmento: 'history', etiqueta: 'Historial' },
] as const;

test.describe('C3.3 · ficha del familiar', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('F1 · se salta de una sección a otra sin pasar por el perfil', async ({ page }) => {
    const { id } = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const vivo = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
      return { id: vivo.id as string };
    });

    await page.goto(`/members/${id}/appts`);
    const navegacion = page.getByRole('navigation', { name: 'Secciones del expediente' });
    await expect(navegacion).toBeVisible();

    // De citas a vacunas, directo.
    await navegacion.getByRole('link', { name: 'Vacunas' }).click();
    await expect(page).toHaveURL(new RegExp(`/members/${id}/vaccines`));

    // Y de vacunas a medicamentos, sin volver al perfil por el camino.
    await navegacion.getByRole('link', { name: 'Medicamentos' }).click();
    await expect(page).toHaveURL(new RegExp(`/members/${id}/medications`));
  });

  test('F2 · la sección actual se anuncia, no solo se colorea', async ({ page }) => {
    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      return (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0].id as string;
    });

    await page.goto(`/members/${id}/exams`);
    const navegacion = page.getByRole('navigation', { name: 'Secciones del expediente' });

    // `aria-current="page"` es lo que oye quien no ve el color.
    await expect(navegacion.getByRole('link', { name: 'Exámenes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navegacion.getByRole('link', { name: 'Vacunas' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('F3 · en las nueve secciones se sabe de quién es el expediente', async ({ page }) => {
    const { id, nombre } = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const vivo = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
      return { id: vivo.id as string, nombre: vivo.fullName as string };
    });

    for (const { segmento, etiqueta } of SECCIONES) {
      await page.goto(`/members/${id}/${segmento}`);
      await expect(page.locator('main').first()).toBeVisible();

      await expect(
        page.getByRole('heading', { name: nombre, level: 2 }),
        `en «${etiqueta}» no se ve de quién es el expediente`,
      ).toBeVisible();

      await expect(
        page.getByRole('navigation', { name: 'Secciones del expediente' }),
        `en «${etiqueta}» no hay forma de ir a otra sección`,
      ).toBeVisible();
    }
  });

  test('F4 · el perfil y la edición NO llevan el armazón: no se repite la cabecera', async ({ page }) => {
    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      return (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0].id as string;
    });

    await page.goto(`/members/${id}`);
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del expediente' })).toBeHidden();

    // En el formulario de edición, una barra de secciones invita a salirse a
    // medio rellenar: tampoco se pinta.
    await page.goto(`/members/${id}/edit`);
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del expediente' })).toBeHidden();
  });

  test('F5 · las secciones vacías dicen qué hacer, no solo que están vacías', async ({ page }) => {
    // Un familiar recién creado tiene TODAS las secciones vacías: es el caso
    // que más veces se ve y el que peor estaba.
    await page.goto('/members/new');
    await page.getByPlaceholder('Ej. Juan Pérez').fill('Familiar E2E Ficha');
    await page.getByPlaceholder(/Ej\. 10203/).fill(String(Date.now()).slice(-9));
    await page.getByRole('button', { name: 'Guardar Familiar' }).click();
    await page.waitForURL(/\/members/, { timeout: 20_000 });

    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const m = (e.members ?? []).find(
        (x: { fullName: string; deletedAt?: unknown }) =>
          x.fullName === 'Familiar E2E Ficha' && !x.deletedAt,
      );
      return m?.id as string;
    });

    // Las que ofrecen crear algo, lo ofrecen.
    for (const [segmento, accion] of [
      ['appts', 'Programar cita'],
      ['vaccines', 'Registrar vacuna'],
      ['exams', 'Registrar examen'],
      ['documents', 'Subir documento'],
      ['orders', 'Nueva orden'],
      ['checkups', 'Registrar control'],
      ['medications', 'Registrar medicamento'],
    ] as const) {
      await page.goto(`/members/${id}/${segmento}`);
      await expect(page.locator('main').first()).toBeVisible();

      const salida = page.getByRole('button', { name: accion });
      await expect(
        salida.first(),
        `la sección «${segmento}» está vacía y no ofrece nada que hacer`,
      ).toBeVisible();
    }
  });
});
