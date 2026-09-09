import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Los tres estados: cargando, vacío y fallo (C2).
 *
 * EL FALLO QUE ESTAS PRUEBAS EXISTEN PARA IMPEDIR
 * ───────────────────────────────────────────────
 * Hasta C2, un expediente que no se podía leer y un expediente sin datos
 * llegaban a la interfaz exactamente igual: como `null`. La pantalla decía
 * «Aún no tienes familiares registrados» sobre un historial clínico intacto
 * que seguía en el navegador, sin abrir. Y `loadAppState`, además, lo
 * **borraba** al fallar la lectura.
 *
 * La prueba central de este archivo corrompe el expediente a propósito y exige
 * las dos cosas: que la aplicación lo diga, y que los datos sigan ahí.
 */

/**
 * El aviso de error de la aplicación.
 *
 * Next.js inyecta su propio `role="alert"` vacío —el anunciador de rutas— así
 * que localizar solo por rol encuentra dos elementos. Este se identifica por
 * su encabezado, que es también como lo distingue quien usa lector de pantalla.
 */
function avisoDeError(page: Page) {
  return page
    .getByRole('alert')
    .filter({ has: page.getByRole('heading', { name: 'No se pudo abrir tu expediente' }) });
}

/** Corrompe el expediente de demostración conservando una copia para comparar. */
async function corromperExpediente(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clave = 'pate-salud-state:demo';
    const original = localStorage.getItem(clave) ?? '';
    // JSON truncado: el fallo más plausible de una escritura interrumpida.
    localStorage.setItem(clave, original.slice(0, Math.floor(original.length / 2)));
    return original;
  });
}

test.describe('C2 · estados de carga, vacío y error', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('S1 · el estado de carga se anuncia, no solo gira', async ({ page }) => {
    // La carga real dura milisegundos, así que se retiene el arranque para
    // poder mirarla. Se frena un recurso propio, no una petición externa.
    let liberar: () => void = () => {};
    const espera = new Promise<void>((r) => {
      liberar = r;
    });
    await page.route('**/_next/static/**/dashboard*.js', async (ruta) => {
      await espera;
      await ruta.continue();
    });

    const navegacion = page.goto('/dashboard');
    const cargando = page.getByRole('status');

    // Lo que importa no es el círculo: es que haya un texto que anunciar.
    await expect(cargando.first()).toContainText(/Cargando/i, { timeout: 10_000 });

    liberar();
    await navegacion;
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('S2 · un expediente ilegible NO se anuncia como vacío', async ({ page }) => {
    const original = await corromperExpediente(page);
    expect(original.length, 'la demostración debe traer un expediente').toBeGreaterThan(100);

    await page.goto('/dashboard');

    const error = avisoDeError(page);
    await expect(error, 'no apareció ningún aviso de error').toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText('No se pudo abrir tu expediente');
    await expect(error).toContainText('No se ha borrado nada');

    // Y en ningún caso el mensaje de expediente vacío.
    await expect(page.getByText(/Aún no tienes familiares/i)).toBeHidden();

    // Hay salida: reintentar y una alternativa.
    await expect(error.getByRole('button', { name: 'Volver a intentarlo' })).toBeVisible();
    await expect(error.getByRole('link', { name: 'Ir a Configuración' })).toBeVisible();
  });

  test('S3 · el expediente ilegible se conserva y se pone en cuarentena', async ({ page }) => {
    await corromperExpediente(page);
    await page.goto('/dashboard');
    await expect(avisoDeError(page)).toBeVisible({ timeout: 20_000 });

    const estado = await page.evaluate(() => {
      const clave = 'pate-salud-state:demo';
      return {
        original: localStorage.getItem(clave),
        cuarentena: localStorage.getItem(`pate:cuarentena:${clave}`),
      };
    });

    expect(estado.original, 'el expediente dañado NO puede haberse borrado').not.toBeNull();
    expect(estado.cuarentena, 'debe quedar una copia rescatable').not.toBeNull();
    expect(estado.cuarentena).toBe(estado.original);
  });

  test('S4 · reintentar vuelve a leer, y con el expediente sano se recupera', async ({ page }) => {
    const original = await corromperExpediente(page);
    await page.goto('/dashboard');
    const error = avisoDeError(page);
    await expect(error).toBeVisible({ timeout: 20_000 });

    // Se repara el expediente y se pulsa el botón: si «reintentar» fuera
    // decorativo, la pantalla de error seguiría ahí.
    await page.evaluate((bueno) => {
      localStorage.setItem('pate-salud-state:demo', bueno);
    }, original);

    await error.getByRole('button', { name: 'Volver a intentarlo' }).click();

    await expect(error).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('S5 · un expediente vacío propone qué hacer, no solo constata el vacío', async ({ page }) => {
    // Expediente válido y sin datos: el caso legítimo de «no hay nada».
    await page.evaluate(() => {
      localStorage.setItem(
        'pate-salud-state:demo',
        JSON.stringify({
          schemaVersion: 1,
          origen: 'DEMO',
          user: JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}').user ?? null,
          members: [],
          healthProfiles: {},
          appointments: [],
          checkups: [],
          vaccines: [],
          exams: [],
          examResults: {},
          documents: [],
          history: [],
          reminders: [],
          tasks: [],
          medicalOrders: [],
          medicationPrescriptions: [],
          medicationDoseReminders: [],
          appointmentCandidates: [],
          sharedReports: [],
          emailSources: [],
        }),
      );
    });

    await page.goto('/dashboard');
    await expect(page.locator('main').first()).toBeVisible();

    // Nada de alarmas: un expediente nuevo no es un fallo.
    await expect(avisoDeError(page)).toBeHidden();

    await expect(page.getByText(/Aún no tienes familiares registrados/i)).toBeVisible();
    const accion = page.getByRole('link', { name: 'Agregar primer familiar' });
    await expect(accion, 'un estado vacío sin salida deja a la persona parada').toBeVisible();
    await accion.click();
    await expect(page).toHaveURL(/\/members\/new/);
  });

  test('S6 · el vacío de una subruta ofrece abrir su formulario', async ({ page }) => {
    const id = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      const vivos = (e.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
      return vivos[0]?.id ?? null;
    });
    expect(id).toBeTruthy();

    // La demostración no trae vacunas: el vacío es real, no simulado.
    await page.goto(`/members/${id}/vaccines`);
    await expect(page.locator('main').first()).toBeVisible();

    await expect(page.getByText('Sin dosis registradas')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar vacuna' }).last().click();
    await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 10_000 });
  });
});
