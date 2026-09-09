import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Teclado y foco visible (C1.5).
 *
 * La aplicación se podía usar entera con el ratón y solo a medias con el
 * teclado. Dos fallos distintos:
 *
 *   · **Foco invisible.** 88 `outline-none` repartidos por los formularios y
 *     cero reglas de `:focus-visible`. Al tabular no se sabía dónde se estaba.
 *   · **Controles que no eran controles.** Las tarjetas de recordatorio y de
 *     tarea respondían al clic desde un `<div>`. Sin `tabIndex` no recibían el
 *     foco, y sin `onKeyDown` no había forma de marcar una toma como hecha sin
 *     ratón. Alguien que navegue con teclado simplemente no podía.
 *
 * La última prueba es la que impide que esto vuelva: barre la pantalla
 * buscando cualquier cosa que responda al clic y no al teclado.
 */

/** Enfoca el siguiente elemento y devuelve cómo se ve su contorno. */
async function tabular(page: Page) {
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const e = getComputedStyle(el);
    return {
      etiqueta: el.tagName.toLowerCase(),
      texto: (el.textContent ?? '').trim().slice(0, 40),
      contorno: e.outlineStyle,
      anchoContorno: e.outlineWidth,
      anillo: e.boxShadow,
    };
  });
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

test.describe('C1.5 · teclado y foco', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('K1 · el foco se ve al tabular por el panel', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('main').first()).toBeVisible();
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    let enfocados = 0;
    const invisibles: string[] = [];
    for (let i = 0; i < 20; i++) {
      const f = await tabular(page);
      if (!f) continue;
      enfocados++;
      // Vale el contorno o un anillo de sombra: los campos usan lo segundo.
      const seVe = f.contorno !== 'none' || (f.anillo !== 'none' && f.anillo !== '');
      if (!seVe) invisibles.push(`<${f.etiqueta}> «${f.texto}»`);
    }

    expect(enfocados, 'el tabulador no llegó a ningún control').toBeGreaterThan(5);
    expect(invisibles, `elementos enfocados sin indicación visible: ${invisibles.join(' · ')}`).toEqual([]);
  });

  test('K2 · Enter abre un diálogo y Escape lo cierra', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.goto(`/members/${id}/vaccines`);
    await expect(page.locator('main').first()).toBeVisible();

    const dialogo = page.locator('dialog[open]');
    await expect(dialogo).toBeHidden();

    await page.getByRole('button', { name: 'Registrar vacuna' }).first().focus();
    await page.keyboard.press('Enter');
    await expect(dialogo, 'Enter no abrió el diálogo').toBeVisible({ timeout: 10_000 });

    // Y el foco entra al diálogo, no se queda detrás.
    const dentro = await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
    expect(dentro, 'el foco se quedó fuera del diálogo').toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialogo, 'Escape no cerró el diálogo').toBeHidden();
  });

  test('K3 · un recordatorio se marca con Enter y se desmarca con Espacio', async ({ page }) => {
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    const tarjeta = page.getByRole('checkbox').first();
    await expect(tarjeta, 'la demostración debe traer algún recordatorio').toBeVisible();

    const estadoInicial = await tarjeta.getAttribute('aria-checked');
    await tarjeta.focus();

    await page.keyboard.press('Enter');
    await expect(tarjeta, 'Enter no cambió el estado').not.toHaveAttribute(
      'aria-checked',
      estadoInicial ?? '',
    );

    await page.keyboard.press(' ');
    await expect(tarjeta, 'el Espacio no devolvió el estado anterior').toHaveAttribute(
      'aria-checked',
      estadoInicial ?? '',
    );
  });

  test('K4 · nada responde al clic sin responder al teclado', async ({ page }) => {
    const id = await primerFamiliar(page);
    for (const [pantalla, url] of [
      ['dashboard', '/dashboard'],
      ['reminders', '/reminders'],
      ['members', '/members'],
      ['miembro-medications', `/members/${id}/medications`],
      ['settings', '/settings'],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('main').first()).toBeVisible();

      const huerfanos = await page.evaluate(() => {
        const FOCALIZABLES = 'a[href], button, input, select, textarea, summary, [tabindex]';
        const ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'switch', 'option']);
        const salida: string[] = [];

        for (const el of document.querySelectorAll<HTMLElement>('main *')) {
          if (getComputedStyle(el).cursor !== 'pointer') continue;
          if (el.matches(FOCALIZABLES)) continue;
          // Una <label> no necesita foco: activa el campo al que apunta.
          if (el.closest('label')) continue;
          // Si su ancestro es el control de verdad, el hijo no tiene que serlo.
          if (el.parentElement?.closest(FOCALIZABLES)) continue;
          const rol = el.getAttribute('role');
          if (rol && ROLES.has(rol) && el.hasAttribute('tabindex')) continue;
          // Solo cuenta lo que de verdad hace algo al pulsarlo: si ni él ni
          // ningún ancestro maneja el clic, el cursor es cosmético.
          let manejador = false;
          for (let n: HTMLElement | null = el; n; n = n.parentElement) {
            if (n.matches(FOCALIZABLES) || n.getAttribute('role')) { manejador = true; break; }
          }
          if (!manejador) salida.push(`<${el.tagName.toLowerCase()}> «${(el.textContent ?? '').trim().slice(0, 40)}»`);
        }
        return salida;
      });

      expect(
        huerfanos,
        `${pantalla}: ${huerfanos.length} elemento(s) responden al ratón y no al teclado → ${huerfanos.join(' · ')}`,
      ).toEqual([]);
    }
  });
});
