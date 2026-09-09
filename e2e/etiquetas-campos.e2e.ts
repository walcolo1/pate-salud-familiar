import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Nombre accesible de los campos de formulario (C1.4).
 *
 * La auditoría estática encontró 102 campos y 95 sin nombre accesible: sin
 * `id` + `<label htmlFor>`, sin `aria-label`, sin nada. Un lector de pantalla
 * anunciaba «cuadro de edición, en blanco» catorce veces seguidas en el
 * formulario de medicamentos. El `placeholder` no cuenta: desaparece al
 * escribir y muchos lectores no lo anuncian.
 *
 * CÓMO SE COMPRUEBA
 * ─────────────────
 * No hay una lista de 102 nombres esperados escrita a mano —envejecería mal y
 * pasaría por alto cualquier campo nuevo—. La prueba **barre** cada pantalla y
 * cada diálogo abierto, y de todo control visible exige:
 *
 *   1. que tenga nombre accesible, y que no esté vacío;
 *   2. que **Playwright lo encuentre por ese nombre** con `getByLabel`, que
 *      implementa el cálculo de nombre accesible de la especificación. Si el
 *      nombre que ve la prueba y el que ve el motor no coinciden, falla.
 *
 * El punto 2 es lo que impide que esto se convierta en una prueba que se
 * aprueba a sí misma: el nombre lo confirma un tercero.
 *
 * QUÉ NO CUBRE
 * ────────────
 * Que el nombre sea BUENO —que describa el propósito y no mienta— sigue
 * necesitando criterio humano; queda como validación manual en `TESTING.md`.
 * Lo que aquí se fija es que exista y sea el texto que se ve en pantalla.
 */

/** Controles visibles con su nombre accesible, calculado en la página. */
type Control = { etiqueta: string; tipo: string; nombre: string; origen: string };

async function controlesVisibles(page: Page, dentroDe: string): Promise<Control[]> {
  return page.evaluate((selectorRaiz) => {
    const raiz = document.querySelector(selectorRaiz);
    if (!raiz) return [];

    const nombreDe = (el: HTMLElement): { nombre: string; origen: string } => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return { nombre: aria.trim(), origen: 'aria-label' };

      const idsEtiqueta = el.getAttribute('aria-labelledby');
      if (idsEtiqueta) {
        const texto = idsEtiqueta
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (texto) return { nombre: texto, origen: 'aria-labelledby' };
      }

      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l?.textContent?.trim()) return { nombre: l.textContent.trim(), origen: 'label htmlFor' };
      }

      const envolvente = el.closest('label');
      if (envolvente?.textContent?.trim()) {
        return { nombre: envolvente.textContent.trim(), origen: 'label envolvente' };
      }

      const titulo = el.getAttribute('title');
      if (titulo?.trim()) return { nombre: titulo.trim(), origen: 'title' };

      return { nombre: '', origen: 'ninguno' };
    };

    const controles = raiz.querySelectorAll<HTMLElement>('input, select, textarea');
    return [...controles]
      .filter((el) => {
        if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
        // Un control invisible no lo anuncia nadie: no es deuda de C1.4.
        return el.offsetParent !== null || el.getClientRects().length > 0;
      })
      .map((el) => ({
        etiqueta: el.tagName.toLowerCase(),
        tipo: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
        ...nombreDe(el),
      }));
  }, dentroDe);
}

/**
 * Exige nombre a todos los controles y lo confirma contra el motor de
 * Playwright, que calcula el nombre accesible por su cuenta.
 */
async function exigirNombres(page: Page, pantalla: string, dentroDe = 'main') {
  const controles = await controlesVisibles(page, dentroDe);
  expect(controles.length, `${pantalla}: no se encontró ningún campo que comprobar`).toBeGreaterThan(0);

  const anonimos = controles.filter((c) => !c.nombre);
  expect(
    anonimos,
    `${pantalla}: ${anonimos.length} campo(s) sin nombre accesible → ` +
      anonimos.map((c) => `<${c.etiqueta} type="${c.tipo}">`).join(', '),
  ).toEqual([]);

  for (const c of controles) {
    // getByLabel implementa el cálculo de la especificación. Si no encuentra
    // nada con ese nombre, la asociación que ve la prueba no es la real.
    const encontrados = await page.getByLabel(c.nombre, { exact: true }).count();
    expect(
      encontrados,
      `${pantalla}: Playwright no encuentra ningún campo llamado «${c.nombre}» ` +
        `(la prueba lo dedujo de ${c.origen})`,
    ).toBeGreaterThan(0);
  }

  console.log(`[etiquetas] ${pantalla.padEnd(34)} ${controles.length} campo(s) con nombre`);
}

async function primerFamiliar(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const vivos = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
    return vivos[0]?.id ?? null;
  });
  expect(id, 'la base de demostración debe traer al menos un familiar').toBeTruthy();
  return id as string;
}

/** Subrutas de la ficha, con el botón que abre su formulario. */
const SUBRUTAS = [
  { nombre: 'appts', abridor: 'Programar cita' },
  { nombre: 'checkups', abridor: 'Registrar control' },
  { nombre: 'documents', abridor: 'Subir documento' },
  { nombre: 'exams', abridor: 'Registrar examen' },
  { nombre: 'medications', abridor: 'Registrar Medicamento' },
  { nombre: 'orders', abridor: 'Nueva Orden' },
  { nombre: 'vaccines', abridor: 'Registrar vacuna' },
] as const;

test.describe('C1.4 · nombre accesible de los campos', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('E1 · pantallas con formulario a la vista', async ({ page }) => {
    const id = await primerFamiliar(page);
    for (const [pantalla, url] of [
      ['members', '/members'],
      ['members-new', '/members/new'],
      ['miembro-edit', `/members/${id}/edit`],
      ['appointments-import', '/appointments/import'],
      ['settings', '/settings'],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('main').first()).toBeVisible();
      await exigirNombres(page, pantalla);
    }
  });

  test('E2 · los siete formularios clínicos de la ficha', async ({ page }) => {
    const id = await primerFamiliar(page);
    for (const sub of SUBRUTAS) {
      await page.goto(`/members/${id}/${sub.nombre}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('main').first()).toBeVisible();

      await page.getByRole('button', { name: sub.abridor }).first().click();
      await expect(page.locator('dialog[open]'), `no se abrió el diálogo de ${sub.nombre}`).toBeVisible({
        timeout: 10_000,
      });
      await exigirNombres(page, `miembro-${sub.nombre}-dialogo`, 'dialog[open]');
    }
  });

  test('E3 · los tres diálogos de órdenes médicas', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      const base = {
        memberId,
        orderType: 'EXAM',
        doctorName: 'Profesional Sintetico',
        issuedAt: ahora.slice(0, 10),
        requiresAuthorization: true,
        createdAt: ahora,
        updatedAt: ahora,
      };
      e.medicalOrders = [
        ...(e.medicalOrders ?? []),
        { ...base, id: 'orden-e1-pendiente', title: 'ORDEN-E2E-PENDIENTE', status: 'PENDING_AUTHORIZATION', authorizationStatus: 'PENDING' },
        { ...base, id: 'orden-e1-autorizada', title: 'ORDEN-E2E-AUTORIZADA', status: 'AUTHORIZED', authorizationStatus: 'AUTHORIZED' },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/orders`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main').first()).toBeVisible();

    const dialogo = page.locator('dialog[open]');
    for (const [boton, pantalla] of [
      ['Registrar Aprobación', 'orders-autorizacion'],
      ['Adjuntar Soporte', 'orders-soporte'],
      ['Agendar Cita Médica', 'orders-agendar'],
    ] as const) {
      await page.getByRole('button', { name: boton }).first().click();
      await expect(dialogo, `no se abrió ${pantalla}`).toBeVisible({ timeout: 10_000 });
      await exigirNombres(page, pantalla, 'dialog[open]');
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
    }
  });

  test('E4 · un campo concreto se encuentra por rol y nombre', async ({ page }) => {
    // El barrido demuestra que NINGÚN campo se quedó sin nombre. Esto
    // demuestra lo contrario: que el nombre sirve para llegar al campo, que es
    // lo que hace alguien navegando con lector de pantalla.
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/vaccines`);
    await page.getByRole('button', { name: 'Registrar vacuna' }).first().click();
    await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('textbox', { name: 'Nombre de la Vacuna' }).fill('VACUNA-E2E');
    await page.getByRole('spinbutton', { name: 'Dosis No.' }).fill('2');
    await page.getByRole('combobox', { name: 'Estado' }).selectOption({ index: 0 });

    await expect(page.getByRole('textbox', { name: 'Nombre de la Vacuna' })).toHaveValue('VACUNA-E2E');
  });
});
