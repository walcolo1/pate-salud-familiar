import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Nombres accesibles de los controles críticos (C1.2).
 *
 * La suite de axe cuenta violaciones; esta comprueba lo contrario, que es lo
 * que de verdad importa: que cada control **se puede encontrar por su nombre**,
 * igual que lo haría alguien navegando con un lector de pantalla.
 *
 * Se localiza por rol y nombre a propósito, nunca por clase CSS ni por
 * `id`: si un día el nombre accesible desaparece, estas pruebas fallan aunque
 * el elemento siga ahí.
 */

test.describe('C1.2 · nombres accesibles', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('N1 · los tres conmutadores de Ajustes se encuentran por su nombre', async ({ page }) => {
    await page.goto('/settings');

    for (const nombre of [
      'Solo importar citas futuras',
      'Bloqueo por inactividad',
      'Cierre lógico nocturno',
    ]) {
      const conmutador = page.getByRole('switch', { name: nombre });
      await expect(conmutador, nombre).toHaveCount(1);
      // Un conmutador tiene que decir además si está activado.
      await expect(conmutador).toHaveAttribute('aria-checked', /true|false/);
    }
  });

  test('N2 · el nombre del conmutador coincide con el texto visible', async ({ page }) => {
    await page.goto('/settings');

    // Se etiquetan con `aria-labelledby` apuntando al texto que ya está en
    // pantalla, no con un `aria-label` duplicado: así el nombre no puede
    // acabar diciendo algo distinto de lo que el usuario lee.
    const conmutador = page.getByRole('switch', { name: 'Bloqueo por inactividad' });
    await expect(conmutador).toHaveAttribute('aria-labelledby', /.+/);
    await expect(conmutador).not.toHaveAttribute('aria-label', /.+/);
  });

  test('N3 · el selector de rol de Ajustes tiene etiqueta asociada', async ({ page }) => {
    await page.goto('/settings');

    const selector = page.getByRole('combobox', { name: /Rol del portal actual/i });
    await expect(selector).toHaveCount(1);
    // La etiqueta visible apunta al campo, en vez de estar solo al lado.
    await expect(page.locator('label[for="simulador-rol"]')).toHaveCount(1);
  });

  test('N4 · en Recordatorios no queda ningún botón sin nombre', async ({ page }) => {
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    const sinNombre = await page.evaluate(() => {
      const nombreDe = (b: HTMLElement) =>
        (b.getAttribute('aria-label') ?? '') +
        (b.getAttribute('aria-labelledby') ?? '') +
        (b.textContent ?? '').trim();
      return Array.from(document.querySelectorAll('button'))
        .filter((b) => nombreDe(b as HTMLElement).length === 0)
        .map((b) => (b as HTMLElement).className.slice(0, 60));
    });

    expect(sinNombre, sinNombre.join(' | ')).toEqual([]);
  });

  test('N5 · el icono de estado de un recordatorio no se anuncia como control', async ({ page }) => {
    await page.goto('/reminders');
    await expect(page.locator('main').first()).toBeVisible();

    // Ese círculo no tiene manejador propio: quien responde al clic es la
    // tarjeta entera. Anunciarlo como botón prometería una acción que no
    // existe, así que se deja como adorno y no recibe el foco.
    const focoAlcanzable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="rounded-full"][class*="shrink-0"]')).filter(
        (e) => e.tagName === 'BUTTON',
      ).length,
    );
    expect(focoAlcanzable).toBe(0);
  });

  /**
   * D4-fase-1 · el botón de cierre se llama «Cerrar», y nada más.
   *
   * El nombre de un control es además su dirección: es como se le localiza,
   * desde un lector de pantalla y desde una prueba. Cuando el nombre incluía
   * el título del diálogo —«Cerrar Registrar vacuna»— contenía los mismos
   * sustantivos que los campos, y buscar el campo «Vacuna» encontraba también
   * el botón de cerrar. Pasó en tres bloques seguidos.
   *
   * Estas dos pruebas fijan la convención para cualquier diálogo futuro.
   */

  /** Familiar sembrado por el modo demostración; ninguno es una persona real. */
  async function idDeUnFamiliar(page: Page): Promise<string> {
    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const uno = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt)[0];
      return (uno?.id ?? '') as string;
    });
    expect(id, 'el modo demostración debería traer al menos un familiar').not.toBe('');
    return id;
  }

  /**
   * Los nombres que resuelve `getByLabel`: los que vienen de `aria-label`,
   * de `aria-labelledby` o de un `<label for>`. Son los que compiten entre sí
   * cuando se busca un campo por su nombre.
   */
  function etiquetasDelDialogo(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      if (!d) return [];
      const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const nombres: string[] = [];
      d.querySelectorAll('input, select, textarea, button').forEach((c) => {
        const aria = c.getAttribute('aria-label');
        if (aria) {
          nombres.push(aria.trim());
          return;
        }
        const por = c.getAttribute('aria-labelledby');
        if (por) {
          nombres.push(
            por
              .split(/\s+/)
              .map((id) => texto(document.getElementById(id)))
              .join(' ')
              .trim(),
          );
          return;
        }
        const id = c.getAttribute('id');
        if (!id) return;
        const etiqueta = d.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (etiqueta) nombres.push(texto(etiqueta));
      });
      return nombres.filter((n) => n.length > 0);
    });
  }

  /** Diálogos que no necesitan sembrar nada: basta con un familiar. */
  const DIALOGOS = [
    { ruta: 'vaccines', abrir: 'Registrar vacuna', titulo: 'Registrar Vacuna' },
    { ruta: 'medications', abrir: 'Registrar Medicamento', titulo: 'Registrar Nuevo Medicamento' },
  ];

  for (const caso of DIALOGOS) {
    test(`N6 · «${caso.titulo}» se cierra con un botón llamado exactamente «Cerrar»`, async ({
      page,
    }) => {
      const id = await idDeUnFamiliar(page);
      await page.goto(`/members/${id}/${caso.ruta}`);
      await page.getByRole('button', { name: caso.abrir, exact: true }).first().click();

      const dialogo = page.getByRole('dialog');
      await expect(dialogo).toBeVisible();

      // Uno, y con ese nombre exacto: ni «Cerrar Registrar Vacuna», ni dos.
      const cerrar = dialogo.getByRole('button', { name: 'Cerrar', exact: true });
      await expect(cerrar).toHaveCount(1);

      // El contexto no se pierde: la descripción apunta al título del diálogo.
      const descrito = await cerrar.getAttribute('aria-describedby');
      expect(descrito, 'el botón de cerrar debe describirse con el título').toBeTruthy();
      await expect(page.locator(`[id="${descrito}"]`)).toHaveText(caso.titulo);
    });

    test(`N7 · en «${caso.titulo}» ningún nombre de etiqueta es subcadena de otro`, async ({
      page,
    }) => {
      const id = await idDeUnFamiliar(page);
      await page.goto(`/members/${id}/${caso.ruta}`);
      await page.getByRole('button', { name: caso.abrir, exact: true }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const nombres = await etiquetasDelDialogo(page);
      expect(nombres.length).toBeGreaterThan(1);

      const choques: string[] = [];
      for (const a of nombres) {
        for (const b of nombres) {
          if (a === b) continue;
          // Minúsculas porque `getByLabel` tampoco distingue mayúsculas.
          if (b.toLowerCase().includes(a.toLowerCase())) choques.push(`«${a}» ⊂ «${b}»`);
        }
      }

      expect(choques, choques.join(' | ')).toEqual([]);
    });
  }

  /**
   * El caso que originó la convención.
   *
   * En «Registrar vacuna» de una mascota hay un campo llamado «Vacuna». Con el
   * nombre anterior, el botón de cerrar se llamaba «Cerrar Registrar vacuna» y
   * contenía esa palabra: buscar el campo devolvía dos elementos. Los otros dos
   * diálogos de arriba no lo notaban, y por eso este caso va aparte: sin él,
   * N7 pasaría sin mirar nada.
   */
  test('N8 · en «Registrar vacuna» de una mascota, «Vacuna» localiza solo el campo', async ({
    page,
  }) => {
    const id = await idDeUnFamiliar(page);

    // Mascota sintética; ningún dato corresponde a un animal real.
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      e.pets = [
        {
          id: 'pet-e2e-nombres',
          familyId: 'local',
          memberId,
          nombre: 'MASCOTA-E2E-NOMBRES',
          especie: 'PERRO',
          sexo: 'MACHO',
          activo: true,
          createdAt: ahora,
          updatedAt: ahora,
          deletedAt: null,
        },
      ];
      e.petVaccines = [];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/pets/pet-e2e-nombres/vacunas`);
    await page.getByRole('button', { name: 'Registrar vacuna', exact: true }).first().click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(1);

    // Sin `exact`, y aun así uno solo: es lo que antes fallaba.
    await expect(dialogo.getByLabel('Vacuna')).toHaveCount(1);

    const nombres = await etiquetasDelDialogo(page);
    const choques = nombres.flatMap((a) =>
      nombres
        .filter((b) => b !== a && b.toLowerCase().includes(a.toLowerCase()))
        .map((b) => `«${a}» ⊂ «${b}»`),
    );
    expect(choques, choques.join(' | ')).toEqual([]);
  });
});
