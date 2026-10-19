import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Bloque O · centro de control de la mascota, de punta a punta.
 *
 * Alta con la ficha completa → cinco módulos → recordatorios → modo lectura.
 * Los nombres y números son sintéticos.
 */

const NOMBRE = 'MASCOTA-CENTRO-E2E';

function fecha(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

async function registrarMascota(page: Page) {
  await page.goto('/mascotas?nueva=1');
  const dialogo = page.getByRole('dialog', { name: 'Registrar mascota' });
  await expect(dialogo).toBeVisible({ timeout: 15_000 });
  await dialogo.getByLabel('Nombre').fill(NOMBRE);
  await dialogo.getByLabel('Especie').selectOption('PERRO');
  await dialogo.getByLabel('Sexo').selectOption('HEMBRA');
  await dialogo.getByLabel('Tamaño').selectOption('MEDIANO');
  await dialogo.getByLabel('Fecha de nacimiento (opcional)').fill('2020-05-20');
  await dialogo.getByLabel('Peso actual (kg)').fill('13.5');
  await dialogo.getByLabel('Peso ideal (kg)').fill('11');
  await dialogo.getByLabel('Microchip').fill('985112003456789');
  await dialogo.getByLabel('Esterilizado/a').selectOption('SI');
  await dialogo.getByLabel('Fecha de la cirugía de esterilización').fill('2021-03-02');
  await dialogo.getByLabel('Teléfono del responsable').fill('3000000000');
  await dialogo.getByLabel('Veterinario habitual').fill('Dra. Sintética');
  await dialogo.getByLabel('Clínica veterinaria').fill('Clínica E2E');
  await dialogo.getByLabel('Miedos (ruidos, pólvora…)').fill('Pólvora');
  await dialogo.getByLabel('Marca del alimento').fill('Marca E2E');
  await dialogo.getByLabel('Presentación').selectOption('SECO');
  await dialogo.getByLabel('Comidas al día').fill('2');
  await dialogo.getByLabel('Baño cada (días)').fill('30');
  await dialogo.getByRole('button', { name: 'Registrar mascota', exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.getByRole('link', { name: `Abrir el centro de control de ${NOMBRE}` }).click();
  await page.waitForURL(/\/mascotas\/pet-/);
  await expect(page.getByRole('heading', { name: NOMBRE })).toBeVisible();
}

const pestana = (page: Page, nombre: RegExp | string) => page.getByRole('tab', { name: nombre });

test.describe('Bloque O · centro de control de la mascota', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('O1 · ficha completa, alerta de peso y quién la administra', async ({ page }) => {
    await registrarMascota(page);
    const perfil = page.getByRole('tabpanel', { name: 'Perfil, peso y rutina' });
    await expect(perfil.getByText('985112003456789')).toBeVisible();
    await expect(perfil.getByText(/Sí · /)).toBeVisible(); // esterilización con fecha
    await expect(perfil.getByText(/Dra\. Sintética · Clínica E2E/)).toBeVisible();
    await expect(perfil.getByText(/Marca E2E · Seco · 2 al día/)).toBeVisible();
    await expect(perfil.getByText(/Miedos: Pólvora/)).toBeVisible();
    // 13,5 kg frente a 11 kg ideales: +23 %.
    await expect(perfil.getByRole('status')).toContainText('23 % por encima del ideal');
    await expect(perfil.getByRole('heading', { name: 'Quién puede administrarla' })).toBeVisible();

    // Lo escrito sobrevive a recargar (va al estado persistido).
    await page.reload();
    await expect(page.getByRole('tabpanel', { name: 'Perfil, peso y rutina' }).getByText('985112003456789')).toBeVisible();
  });

  test('O2 · pestañas accesibles con teclado; vacuna esencial con próxima dosis calculada', async ({ page }) => {
    await registrarMascota(page);
    await pestana(page, 'Perfil, peso y rutina').focus();
    await page.keyboard.press('ArrowRight');
    await expect(pestana(page, 'Vacunas')).toHaveAttribute('aria-selected', 'true');
    await expect(pestana(page, 'Vacunas')).toBeFocused();

    const panel = page.getByRole('tabpanel', { name: 'Vacunas' });
    await panel.getByRole('button', { name: 'Registrar vacuna' }).click();
    const dialogo = page.getByRole('dialog', { name: `Registrar vacuna de ${NOMBRE}` });
    await dialogo.getByLabel('Vacuna', { exact: true }).fill('Rabia');
    await dialogo.getByLabel('Fecha aplicada').fill('2026-01-10');
    await expect(dialogo.getByLabel('Tipo de vacuna')).toHaveValue('CORE');
    await expect(dialogo.getByLabel('Próxima dosis')).toHaveValue('2027-01-10');
    await dialogo.getByLabel('Lote').fill('L-E2E');
    await dialogo.getByLabel('Costo (COP)').fill('60000');
    await dialogo.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dialogo).toBeHidden();
    await expect(panel.getByRole('list', { name: 'Vacunas aplicadas' }).getByText('Esencial (core)')).toBeVisible();
    await expect(panel.getByText(/lote L-E2E/)).toBeVisible();
  });

  test('O3 · antipulgas con producto y próxima aplicación mensual; gasto en el resumen', async ({ page }) => {
    await registrarMascota(page);
    await pestana(page, 'Salud preventiva').click();
    const panel = page.getByRole('tabpanel', { name: 'Salud preventiva' });
    await panel.getByRole('button', { name: 'Registrar aplicación' }).click();
    const dialogo = page.getByRole('dialog', { name: `Registrar cuidado de ${NOMBRE}` });
    await dialogo.getByLabel('Qué se hizo').selectOption('ANTIPULGAS');
    await dialogo.getByLabel('Fecha aplicada').fill(fecha(-40));
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('Indica el producto aplicado');
    await dialogo.getByLabel('Producto').fill('Pipeta E2E');
    await dialogo.getByLabel('Vía').selectOption('TOPICA');
    await dialogo.getByLabel('Costo (COP)').fill('45000');
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialogo).toBeHidden();
    // 40 días atrás + 1 mes: ya vencida.
    await expect(panel.locator('[data-preventivo="ANTIPULGAS"]')).toContainText('Vencida');

    await pestana(page, /Exámenes, documentos y recordatorios/).click();
    const seg = page.getByRole('tabpanel', { name: /Exámenes, documentos y recordatorios/ });
    await expect(seg.locator('[data-recordatorio="PREVENTIVO"]')).toContainText('Vencido');
    await expect(seg.getByRole('region', { name: /Gastos por mes/ })).toContainText('45.000');
  });

  test('O4 · tratamiento cada 12 h: tomas por marcar y cumplimiento', async ({ page }) => {
    await registrarMascota(page);
    await pestana(page, 'Medicamentos').click();
    const panel = page.getByRole('tabpanel', { name: 'Medicamentos' });
    await panel.getByRole('button', { name: 'Nuevo tratamiento' }).click();
    const dialogo = page.getByRole('dialog', { name: `Nuevo tratamiento de ${NOMBRE}` });
    await dialogo.getByLabel('Medicamento').fill('Amoxicilina E2E');
    await dialogo.getByLabel('Dosis', { exact: true }).fill('250');
    await dialogo.getByLabel('Frecuencia').selectOption('CADA_12H');
    await dialogo.getByLabel('Fecha de inicio').fill(fecha(-1));
    await dialogo.getByLabel('Hora de la primera toma').fill('00:00');
    await dialogo.getByLabel('Fecha de fin').fill(fecha(5));
    await dialogo.getByRole('button', { name: 'Guardar tratamiento' }).click();
    await expect(dialogo).toBeHidden();

    const t = panel.locator('[data-tratamiento="Amoxicilina E2E"]');
    await expect(t.locator('[data-cumplimiento]')).toContainText('0 %');
    await t.getByRole('button', { name: /Marcar como aplicada/ }).first().click();
    await expect(t.locator('[data-cumplimiento]')).toContainText(/\d+ %\s*\(1 de/);
    await t.getByRole('button', { name: 'Suspender' }).click();
    await expect(t).toContainText('Suspendido');
  });

  test('O5 · recordatorios: completar y posponer; examen veterinario con su comparativo', async ({ page }) => {
    await registrarMascota(page);
    // Una vacuna con refuerzo vencido genera recordatorio.
    await pestana(page, 'Vacunas').click();
    await page.getByRole('tabpanel', { name: 'Vacunas' }).getByRole('button', { name: 'Registrar vacuna' }).click();
    const dv = page.getByRole('dialog', { name: `Registrar vacuna de ${NOMBRE}` });
    await dv.getByLabel('Vacuna', { exact: true }).fill('Polivalente (DHPPi)');
    await dv.getByLabel('Fecha aplicada').fill(fecha(-370));
    await dv.getByRole('button', { name: 'Guardar vacuna' }).click();
    await expect(dv).toBeHidden();

    await pestana(page, /Exámenes, documentos y recordatorios/).click();
    const seg = page.getByRole('tabpanel', { name: /Exámenes, documentos y recordatorios/ });
    const vacuna = seg.locator('[data-recordatorio="VACUNA"]');
    await expect(vacuna).toContainText('Vencido');
    await vacuna.getByRole('button', { name: /Posponer una semana/ }).click();
    await expect(vacuna).toContainText('pospuesto desde');
    await vacuna.getByRole('button', { name: /Completar/ }).click();
    await expect(seg.locator('[data-recordatorio="VACUNA"]')).toHaveCount(0);

    // Examen veterinario: el lector del Bloque N con especie MASCOTA.
    await seg.getByRole('button', { name: 'Registrar examen' }).click();
    const de = page.getByRole('dialog', { name: `Registrar examen de ${NOMBRE}` });
    await de.getByLabel('Nombre del examen').fill('Química sanguínea E2E');
    await de.getByRole('button', { name: 'Pegar texto' }).click();
    await de.getByLabel('Texto del informe').fill('CLINICA VETERINARIA E2E\nEspecie: Canino\nFecha de toma: 10/09/2026\nGLUCOSA 98 mg/dL 74 - 143\nSDMA 12 ug/dL 0 - 14');
    await de.getByRole('button', { name: 'Leer valores del texto' }).click();
    await expect(de.getByRole('status')).toContainText('2 valores reconocidos');
    await de.getByLabel(/Revisé cada valor/).check();
    await de.getByRole('button', { name: /Guardar examen/ }).click();
    await expect(de).toBeHidden();
    await expect(seg.locator('[data-serie="SDMA|ug/dl"]')).toContainText('12');
  });

  test('O6 · un lector la consulta pero no puede cambiar nada', async ({ page }) => {
    await registrarMascota(page);
    const url = page.url();
    await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
      e.simulatedRole = 'VIEWER';
      localStorage.setItem('pate-salud-state:demo', JSON.stringify(e));
    });
    await page.goto(url);
    await expect(page.getByRole('note').filter({ hasText: 'acceso de lectura' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar ficha' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar peso' })).toHaveCount(0);
    await pestana(page, 'Vacunas').click();
    await expect(page.getByRole('button', { name: 'Registrar vacuna' })).toHaveCount(0);
  });
});
