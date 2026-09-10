import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Historial clínico veterinario (Bloque D, D4).
 *
 * Ningún dato de aquí corresponde a un animal, a una clínica ni a una persona
 * reales.
 *
 * Lo que se fija: que una atención se registra y se lee agrupada por año, que
 * la validación del dominio se respeta desde la pantalla, que el filtro por
 * tipo distingue «no hay nada» de «no hay nada de esto», y —lo que sostiene la
 * frontera del módulo— que **el historial no entra en la agenda ni en los
 * avisos**: registra lo que ya pasó.
 *
 * Todo se localiza por rol y nombre accesible, nunca por clase ni por id.
 */

const dd = (n: number) => String(n).padStart(2, '0');
const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};
const hoy = () => enDias(0);

interface EntradaSembrada {
  id: string;
  fecha: string;
  tipo: string;
  diagnostico: string;
}

/** Siembra una mascota y, si se piden, sus atenciones. */
async function sembrar(page: Page, entradas: EntradaSembrada[] = []) {
  return page.evaluate((lista) => {
    const clave = 'pate-salud-state:demo';
    const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
    const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
    const ahora = new Date().toISOString();

    e.pets = [
      {
        id: 'pet-e2e-hist',
        familyId: 'local',
        memberId: uno.id,
        nombre: 'MASCOTA-E2E-HIST',
        especie: 'GATO',
        sexo: 'HEMBRA',
        activo: true,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
      },
    ];

    e.petHistory = lista.map((h) => ({
      id: h.id,
      petId: 'pet-e2e-hist',
      memberId: uno.id,
      fecha: h.fecha,
      tipo: h.tipo,
      diagnostico: h.diagnostico,
      tratamiento: null,
      veterinario: null,
      documentoId: null,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }));

    localStorage.setItem(clave, JSON.stringify(e));
    return { memberId: uno.id as string, petId: 'pet-e2e-hist' };
  }, entradas);
}

const leerHistorial = (page: Page) =>
  page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.petHistory ?? []) as Array<{
      id: string;
      fecha: string;
      tipo: string;
      diagnostico: string;
      tratamiento: string | null;
      veterinario: string | null;
    }>;
  });

test.describe('D4 · historial veterinario', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('H1 · sin atenciones, la pantalla dice qué hacer', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('Aún no hay atenciones registradas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar atención' }).last()).toBeVisible();

    // Sin nada que filtrar, el filtro no está: un control que no puede cambiar
    // nada solo estorba a quien navega con teclado.
    await expect(page.getByLabel('Ver solo')).toHaveCount(0);
  });

  test('H2 · se registra una atención y aparece agrupada por año', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);

    await page.getByRole('button', { name: 'Registrar atención', exact: true }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar atención' });
    await expect(dialogo).toBeVisible();

    await dialogo.getByLabel('Tipo de atención').selectOption('CIRUGIA');
    await dialogo.getByLabel('Diagnóstico o motivo').fill('DIAGNOSTICO-E2E');
    await dialogo.getByLabel('Tratamiento indicado').fill('TRATAMIENTO-E2E');
    await dialogo.getByLabel('Veterinario o clínica').fill('CLINICA-E2E');
    await dialogo.getByRole('button', { name: 'Guardar atención' }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole('heading', { name: 'DIAGNOSTICO-E2E' })).toBeVisible();
    await expect(page.getByText('TRATAMIENTO-E2E')).toBeVisible();
    await expect(page.getByText('CLINICA-E2E')).toBeVisible();
    // El año es el encabezado del grupo.
    await expect(page.getByRole('heading', { name: hoy().slice(0, 4), exact: true })).toBeVisible();

    const guardadas = await leerHistorial(page);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].fecha).toBe(hoy());
    expect(guardadas[0].tipo).toBe('CIRUGIA');
    expect(guardadas[0].veterinario).toBe('CLINICA-E2E');
  });

  test('H3 · la validación del dominio se respeta desde la pantalla', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await page.getByRole('button', { name: 'Registrar atención', exact: true }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar atención' });

    // Sin diagnóstico no se guarda: una entrada sin él no dice nada dentro de
    // un año.
    await dialogo.getByRole('button', { name: 'Guardar atención' }).click();
    await expect(dialogo.getByRole('alert')).toBeVisible();
    expect(await leerHistorial(page)).toHaveLength(0);

    // Una atención futura no es historial, es agenda.
    await dialogo.getByLabel('Diagnóstico o motivo').fill('DIAGNOSTICO-E2E');
    await dialogo.getByLabel('Fecha', { exact: true }).fill(enDias(5));
    await dialogo.getByRole('button', { name: 'Guardar atención' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('futura');
    expect(await leerHistorial(page)).toHaveLength(0);

    // Corregido, entra.
    await dialogo.getByLabel('Fecha', { exact: true }).fill(hoy());
    await dialogo.getByRole('button', { name: 'Guardar atención' }).click();
    await expect(dialogo).toBeHidden();
    expect(await leerHistorial(page)).toHaveLength(1);
  });

  test('H4 · lo más reciente va primero, y cada año es un grupo', async ({ page }) => {
    const { memberId, petId } = await sembrar(page, [
      { id: 'h-vieja', fecha: '2023-04-10', tipo: 'CONSULTA', diagnostico: 'ATENCION-VIEJA' },
      { id: 'h-media', fecha: '2024-08-01', tipo: 'URGENCIA', diagnostico: 'ATENCION-MEDIA' },
      { id: 'h-nueva', fecha: enDias(-3), tipo: 'REVISION', diagnostico: 'ATENCION-NUEVA' },
    ]);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await expect(page.locator('main').first()).toBeVisible();

    const orden = await page
      .getByRole('heading', { level: 4 })
      .allTextContents();
    expect(orden).toEqual(['ATENCION-NUEVA', 'ATENCION-MEDIA', 'ATENCION-VIEJA']);

    const anios = await page.getByRole('heading', { level: 3 }).allTextContents();
    expect(anios).toEqual([hoy().slice(0, 4), '2024', '2023']);

    // El resumen dice cuál fue la última, con su tipo y su fecha.
    await expect(page.getByText(/Última atención: Revisión/)).toBeVisible();
  });

  test('H5 · filtrar sin resultados no se confunde con no tener historial', async ({ page }) => {
    const { memberId, petId } = await sembrar(page, [
      { id: 'h1', fecha: enDias(-10), tipo: 'CONSULTA', diagnostico: 'ATENCION-CONSULTA' },
      { id: 'h2', fecha: enDias(-20), tipo: 'URGENCIA', diagnostico: 'ATENCION-URGENCIA' },
    ]);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await expect(page.locator('main').first()).toBeVisible();

    await page.getByLabel('Ver solo').selectOption('URGENCIA');
    await expect(page.getByRole('heading', { name: 'ATENCION-URGENCIA' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ATENCION-CONSULTA' })).toBeHidden();

    // Un tipo sin entradas: el camino de salida es quitar el filtro, no
    // registrar algo que nadie ha pedido registrar.
    await page.getByLabel('Ver solo').selectOption('CIRUGIA');
    await expect(page.getByText('Ninguna atención de ese tipo')).toBeVisible();
    await page.getByRole('button', { name: 'Ver todas las atenciones' }).click();
    await expect(page.getByRole('heading', { name: 'ATENCION-CONSULTA' })).toBeVisible();
  });

  test('H6 · una fecha ilegible no borra la entrada: se enseña y se dice', async ({ page }) => {
    // Por el formulario no entra, pero por la restauración de un respaldo sí.
    const { memberId, petId } = await sembrar(page, [
      { id: 'h-rota', fecha: 'el invierno pasado', tipo: 'CIRUGIA', diagnostico: 'ATENCION-ROTA' },
      { id: 'h-buena', fecha: enDias(-5), tipo: 'CONSULTA', diagnostico: 'ATENCION-BUENA' },
    ]);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'ATENCION-ROTA' })).toBeVisible();
    await expect(page.getByText('Fecha no reconocible').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sin fecha reconocible' })).toBeVisible();
  });

  test('H7 · el historial no entra en la agenda ni en un aviso', async ({ page }) => {
    // El mismo doble de C3.2: el navegador sin cabeza arranca con las
    // notificaciones denegadas, así que el permiso se finge.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => 'granted',
      });
      interface Espia {
        mostrados: Array<{ cuerpo: string }>;
        temporizadores: Array<{ ms: number; disparar: () => void }>;
      }
      const espia: Espia = { mostrados: [], temporizadores: [] };
      (window as unknown as { __espia: Espia }).__espia = espia;

      const proto = ServiceWorkerRegistration.prototype as unknown as {
        showNotification: (t: string, o?: NotificationOptions) => Promise<void>;
      };
      proto.showNotification = function (_titulo: string, opciones?: NotificationOptions) {
        espia.mostrados.push({ cuerpo: opciones?.body ?? '' });
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

    const { memberId, petId } = await sembrar(page, [
      { id: 'h-agenda', fecha: hoy(), tipo: 'URGENCIA', diagnostico: 'DIAGNOSTICO-AGENDA-E2E' },
    ]);

    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await expect(page.getByRole('heading', { name: 'DIAGNOSTICO-AGENDA-E2E' })).toBeVisible();

    // La agenda mira hacia delante: una atención de hoy ya ocurrida no es un
    // evento pendiente de nada.
    await page.goto('/agenda');
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByText('DIAGNOSTICO-AGENDA-E2E')).toHaveCount(0);
    await expect(page.getByText('MASCOTA-E2E-HIST')).toHaveCount(0);

    // Y si algún aviso llegara a dispararse, no puede llevar nada de esto.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.evaluate(() => {
      const e = (window as unknown as {
        __espia: { temporizadores: { disparar: () => void }[] };
      }).__espia;
      for (const t of e.temporizadores) t.disparar();
    });
    const cuerpos = await page.evaluate(() =>
      (window as unknown as { __espia: { mostrados: Array<{ cuerpo: string }> } }).__espia.mostrados
        .map((m) => m.cuerpo)
        .join(' | '),
    );
    expect(cuerpos).not.toContain('DIAGNOSTICO-AGENDA-E2E');
    expect(cuerpos).not.toContain('MASCOTA-E2E-HIST');
  });

  test('H8 · el diálogo cumple la convención de nombres de D4-fase-1', async ({ page }) => {
    const { memberId, petId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets/${petId}/historial`);
    await page.getByRole('button', { name: 'Registrar atención', exact: true }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Registrar atención' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(1);

    // Ningún nombre de etiqueta es subcadena de otro: el diálogo nuevo nace
    // cumpliendo la regla, en vez de arreglarse a base de `exact: true`.
    const nombres = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      if (!d) return [];
      const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const salida: string[] = [];
      d.querySelectorAll('input, select, textarea, button').forEach((c) => {
        const aria = c.getAttribute('aria-label');
        if (aria) {
          salida.push(aria.trim());
          return;
        }
        const id = c.getAttribute('id');
        if (!id) return;
        const etiqueta = d.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (etiqueta) salida.push(texto(etiqueta));
      });
      return salida.filter((n) => n.length > 0);
    });

    const choques = nombres.flatMap((a) =>
      nombres
        .filter((b) => b !== a && b.toLowerCase().includes(a.toLowerCase()))
        .map((b) => `«${a}» ⊂ «${b}»`),
    );
    expect(choques, choques.join(' | ')).toEqual([]);
  });

  test('H9 · la tarjeta de la mascota lleva al historial por su nombre', async ({ page }) => {
    const { memberId } = await sembrar(page);
    await page.goto(`/members/${memberId}/pets`);
    await expect(page.locator('main').first()).toBeVisible();

    await page.getByRole('link', { name: 'Ver el historial de MASCOTA-E2E-HIST' }).click();
    await expect(page.getByRole('heading', { name: /Historial de MASCOTA-E2E-HIST/ })).toBeVisible();
  });
});
