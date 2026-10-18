import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo, pdfConTexto } from './apoyo';

/**
 * E2E · Bloque N · exámenes: lectura de informes, bandeja de verificación y
 * comparativo histórico.
 *
 * La base de demostración trae un examen del 4 de mayo de 2026 con
 * «Colesterol Total 240 mg/dL · Menos de 200». Cada prueba añade otro y mira
 * lo que el comparativo calcula entre los dos. Todos los informes son
 * sintéticos.
 */

const INFORME = [
  'LABORATORIO CLINICO SINTETICO E2E',
  'Cedula: 0000000   EPS: PRUEBA',
  'Fecha de toma de muestra: 10/09/2026',
  'COLESTEROL TOTAL   193.0  mg/dL   80 - 200',
  'HDL COLESTEROL     48.0   mg/dL * 55 - 85',
  'GLICEMIA BASAL     104    mg/dL   70 - 100',
];

const VETERINARIO = [
  'CLINICA VETERINARIA SINTETICA',
  'Paciente: Toby  Especie: Canino  Raza: Beagle',
  'Propietario: Prueba',
  'GLUCOSA 98 mg/dL 74 - 143',
];

async function familiarConExamen(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    return (e.exams ?? [])[0]?.memberId ?? null;
  });
  expect(id, 'la demostración trae un examen').toBeTruthy();
  return id as string;
}

async function abrirRegistro(page: Page, id: string) {
  await page.goto(`/members/${id}/exams`);
  await expect(page.getByRole('heading', { name: 'Comparativo histórico' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar examen' }).first().click();
  const dialogo = page.locator('dialog[open]');
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test.describe('Bloque N · exámenes y comparativo', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('N1 · texto pegado → bandeja → nada se guarda sin revisar → comparativo con Δ, cruce y tendencia', async ({ page }) => {
    const id = await familiarConExamen(page);
    // El aviso legal está desde el primer momento, con o sin datos nuevos.
    await page.goto(`/members/${id}/exams`);
    await expect(page.getByRole('note').filter({ hasText: 'médico o veterinario tratante' })).toBeVisible();

    const dialogo = await abrirRegistro(page, id);
    await dialogo.getByLabel('Nombre del examen').fill('Control lipídico E2E');
    await dialogo.getByRole('button', { name: 'Pegar texto' }).click();
    await dialogo.getByLabel('Texto del informe').fill(INFORME.join('\n'));
    await dialogo.getByRole('button', { name: 'Leer valores del texto' }).click();

    await expect(dialogo.getByRole('status')).toContainText('3 valores reconocidos');
    await expect(dialogo.getByLabel('Fecha de la muestra')).toHaveValue('2026-09-10');
    await expect(dialogo.getByLabel(/Laboratorio/)).toHaveValue('LABORATORIO CLINICO SINTETICO E2E');
    await expect(dialogo.getByLabel('Valor, fila 1')).toHaveValue('193');

    const guardar = dialogo.getByRole('button', { name: /Guardar examen/ });
    await expect(guardar, 'sin la marca de revisión no se guarda').toBeDisabled();

    // Corregir un número contra el papel, y marcar la revisión.
    await dialogo.getByLabel('Valor, fila 2').fill('50');
    await dialogo.getByLabel(/Revisé cada valor/).check();
    await expect(guardar).toBeEnabled();
    await guardar.click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // Colesterol total: 240 (Alto) → 193 (Normal).
    const colesterol = page.locator('[data-serie="COLESTEROL_TOTAL|mg/dl"]');
    await expect(colesterol).toContainText('240');
    await expect(colesterol).toContainText('193');
    await expect(colesterol).toContainText('−47');
    await expect(colesterol).toContainText('Cruzó: Alto → Normal');
    await expect(colesterol).toContainText('Bajando');
    await expect(colesterol.getByRole('img', { name: /Evolución de Colesterol total/ })).toBeVisible();

    // Glucosa: un solo dato todavía, sin Δ.
    await expect(page.locator('[data-serie="GLUCOSA|mg/dl"]')).toContainText('Un solo dato');

    // Y en el estado: la verificación y la corrección quedan dichas.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const e = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
          const examen = (e.exams ?? []).find((x: { examName: string }) => x.examName === 'Control lipídico E2E');
          const rs = examen ? e.examResults?.[examen.id] ?? [] : [];
          return rs.map((r: { parameterName: string; value: string; extractionConfidence: string; verifiedBy: string; isAbnormal: boolean }) =>
            `${r.parameterName}|${r.value}|${r.extractionConfidence}|${r.isAbnormal}|${String(r.verifiedBy).split(':')[0]}`);
        }),
      )
      .toEqual([
        'COLESTEROL TOTAL|193|ALTA|false|REVISION_HUMANA',
        'HDL COLESTEROL|50|CORREGIDO|true|REVISION_HUMANA',
        'GLICEMIA BASAL|104|ALTA|true|REVISION_HUMANA',
      ]);
  });

  test('N2 · un PDF de laboratorio se lee en el navegador, sin salir del dispositivo', async ({ page }) => {
    const id = await familiarConExamen(page);
    const dialogo = await abrirRegistro(page, id);

    const fuera: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost')) return;
      if (u.startsWith('https://accounts.google.com/gsi/')) return;
      fuera.push(u);
    });

    await dialogo.getByLabel(/Informe en PDF/).setInputFiles({
      name: 'laboratorio-sintetico.pdf',
      mimeType: 'application/pdf',
      buffer: pdfConTexto(INFORME),
    });
    await expect(dialogo.getByRole('status').filter({ hasText: 'valores reconocidos' })).toContainText(
      'laboratorio-sintetico.pdf',
      { timeout: 20_000 },
    );
    await expect(dialogo.getByLabel('Analito, fila 1')).toHaveValue('COLESTEROL TOTAL');
    await expect(dialogo.getByLabel('Mínimo de referencia, fila 2')).toHaveValue('55');
    expect(fuera, 'el PDF no se envía a ningún sitio').toEqual([]);
  });

  test('N3 · un informe veterinario no entra en la ficha de una persona', async ({ page }) => {
    const id = await familiarConExamen(page);
    const dialogo = await abrirRegistro(page, id);
    await dialogo.getByLabel('Nombre del examen').fill('No debe guardarse');
    await dialogo.getByRole('button', { name: 'Pegar texto' }).click();
    await dialogo.getByLabel('Texto del informe').fill(VETERINARIO.join('\n'));
    await dialogo.getByRole('button', { name: 'Leer valores del texto' }).click();

    await expect(dialogo.getByRole('alert')).toContainText('no se puede guardar en esta ficha');
    await expect(dialogo.getByText(/parece veterinario/)).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Agregar fila' })).toBeDisabled();
    await expect(dialogo.getByRole('button', { name: /Guardar examen/ })).toBeDisabled();
  });

  test('N4 · captura manual: la tabla dice qué falta y calcula el estado', async ({ page }) => {
    const id = await familiarConExamen(page);
    const dialogo = await abrirRegistro(page, id);
    await dialogo.getByLabel('Nombre del examen').fill('Manual E2E');
    await dialogo.getByRole('button', { name: 'A mano' }).click();
    await dialogo.getByRole('button', { name: 'Agregar fila' }).click();

    await expect(dialogo.getByText('Fila 1: Falta el analito. Falta el valor.')).toBeVisible();
    await dialogo.getByLabel('Analito, fila 1').fill('Triglicéridos');
    await dialogo.getByLabel('Valor, fila 1').fill('180');
    await expect(dialogo.getByText(/Falta la unidad/)).toBeVisible();
    await dialogo.getByLabel('Unidad, fila 1').fill('mg/dL');
    await dialogo.getByLabel('Máximo de referencia, fila 1').fill('150');
    await expect(dialogo.locator('[data-fila-verificacion="1"]')).toContainText('Alto');
    await dialogo.getByLabel(/Revisé cada valor/).check();
    await dialogo.getByRole('button', { name: /Guardar examen y 1 valor/ }).click();

    // 145 (demo, «Menos de 150») → 180: cruza a Alto y sube.
    const tg = page.locator('[data-serie="TRIGLICERIDOS|mg/dl"]');
    await expect(tg).toContainText('Cruzó: Normal → Alto');
    await expect(tg).toContainText('Subiendo');
  });

  test('N5 · ficha de emergencia imprimible', async ({ page }) => {
    const id = await familiarConExamen(page);
    await page.goto(`/members/${id}`);
    await page.goto(`/members/${id}/emergencia`);
    const ficha = page.getByRole('article');
    await expect(ficha.getByText('Ficha de emergencia', { exact: true })).toBeVisible();
    await expect(ficha.getByRole('heading', { level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Alergias/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Medicamentos activos/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir ficha' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: 'Ficha de emergencia' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
