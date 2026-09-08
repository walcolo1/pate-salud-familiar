import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Importación manual de citas (Bloque B).
 *
 * Verifican lo que sustituyó al escaneo de Gmail: pegar texto, adjuntar un
 * archivo, revisar el borrador y confirmarlo. Y, sobre todo, verifican las
 * AUSENCIAS: ninguna ruta pide Gmail, ninguna petición sale hacia la API de
 * Gmail y ningún botón ofrece escanear el correo.
 *
 * Todo el texto es sintético. No procede de ningún correo real.
 */

/** Correo sintético con la forma de los que envía una EPS. */
const CORREO_SINTETICO = [
  'Estimado usuario,',
  'Le confirmamos la cita de Paciente Sintetico B1',
  'para el 15/07/2027 a las 10:30 am',
  'con la Dra. Sintetica Prueba',
  'Especialidad: odontología',
  'IPS Clinica Sintetica, consultorio 104',
].join('\n');

/** Vigila cualquier petición hacia la API de Gmail. */
function vigilarGmail(page: Page): string[] {
  const intentos: string[] = [];
  page.on('request', (r) => {
    if (/gmail\.googleapis\.com|auth\/gmail/.test(r.url())) intentos.push(r.url());
  });
  return intentos;
}

/** Siembra un familiar con el nombre que aparece en el correo sintético. */
async function sembrarFamiliar(page: Page) {
  await page.evaluate(() => {
    const clave = 'pate-salud-state:demo';
    const estado = JSON.parse(localStorage.getItem(clave) ?? '{}');
    estado.members = [
      {
        id: 'm-b1',
        familyGroupId: 'fam-demo',
        fullName: 'Paciente Sintetico B1',
        birthDate: '1990-01-01',
        relationship: 'CHILD',
        documentType: 'CC',
        documentNumber: 'DOCUMENTO-TEST-B1-55443322',
        status: 'ACTIVE',
        deletedAt: null,
      },
    ];
    localStorage.setItem(clave, JSON.stringify(estado));
  });
}

test.describe('Bloque B · importación manual de citas', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  test('G1 · se llega a Importar cita sin OAuth y sin pedir Gmail', async ({ page }) => {
    const intentos = vigilarGmail(page);

    await page.goto('/appointments/import');
    await expect(page.getByRole('heading', { name: 'Importar una cita' })).toBeVisible();

    // La promesa que se le hace a la persona en pantalla.
    await expect(page.locator('body')).toContainText('La aplicación no lee tu correo');

    // Y ningún botón ofrece escanear ni conectar el buzón.
    await expect(page.getByRole('button', { name: /Escanear|Buscar citas|Conectar Gmail/i })).toHaveCount(0);
    expect(intentos).toEqual([]);
  });

  test('G2 · pegar texto sintético produce un borrador con los datos extraídos', async ({ page }) => {
    await sembrarFamiliar(page);
    await page.goto('/appointments/import');

    await page.locator('#texto-cita').fill(CORREO_SINTETICO);
    await page.locator('#btn-crear-borrador').click();

    await expect(page.locator('#resultado-borrador')).toContainText('Borrador creado');

    const cuerpo = page.locator('body');
    await expect(cuerpo).toContainText('Paciente Sintetico B1');
    await expect(cuerpo).toContainText('2027-07-15');
    await expect(cuerpo).toContainText('10:30');
    await expect(cuerpo).toContainText('Sintetica Prueba');
  });

  test('G3 · el borrador NO crea la cita: queda pendiente de revisión', async ({ page }) => {
    await sembrarFamiliar(page);
    await page.goto('/appointments/import');
    await page.locator('#texto-cita').fill(CORREO_SINTETICO);
    await page.locator('#btn-crear-borrador').click();
    await expect(page.locator('#resultado-borrador')).toBeVisible();

    // En disco hay candidato, pero NINGUNA cita creada a partir de él.
    // (El modo demostración trae citas de ejemplo propias; lo que importa es
    // que ninguna proceda de este borrador.)
    const estado = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}'),
    );
    const candidatos = estado.appointmentCandidates ?? [];
    expect(candidatos.length).toBeGreaterThan(0);

    const borrador = candidatos.find((c: { sourceEmail: string }) => c.sourceEmail === 'MANUAL');
    expect(borrador).toBeTruthy();
    expect(borrador.status).toBe('PENDING_REVIEW');
    expect(borrador.createdAppointmentId ?? null).toBeNull();

    const citas = estado.appointments ?? [];
    expect(citas.some((a: { sourceMessageId?: string }) => a.sourceMessageId === borrador.gmailMessageId)).toBe(false);
  });

  test('G4 · el borrador es editable antes de confirmar', async ({ page }) => {
    await sembrarFamiliar(page);
    await page.goto('/appointments/import');
    await page.locator('#texto-cita').fill(CORREO_SINTETICO);
    await page.locator('#btn-crear-borrador').click();
    await expect(page.locator('#resultado-borrador')).toBeVisible();

    await page.getByRole('button', { name: /Editar/i }).first().click();

    // Un campo de fecha editable, con el valor detectado dentro.
    const fecha = page.locator('input[type="date"]').first();
    await expect(fecha).toBeVisible();
    await expect(fecha).toHaveValue('2027-07-15');

    await fecha.fill('2027-08-20');
    await page.getByRole('button', { name: /Guardar/i }).first().click();
    await expect(page.locator('body')).toContainText('2027-08-20');
  });

  test('G5 · sin texto no se crea nada y se explica por qué', async ({ page }) => {
    await page.goto('/appointments/import');

    // El botón está deshabilitado mientras no haya texto.
    await expect(page.locator('#btn-crear-borrador')).toBeDisabled();

    await page.locator('#texto-cita').fill('   ');
    await expect(page.locator('#btn-crear-borrador')).toBeDisabled();
  });

  test('G6 · adjuntar un texto sintético rellena el campo, sin salir del dispositivo', async ({ page }) => {
    const intentos: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('http://localhost')) {
        intentos.push(r.url());
      }
    });

    await sembrarFamiliar(page);
    await page.goto('/appointments/import');

    await page.locator('#adjunto-cita').setInputFiles({
      name: 'cita-sintetica.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(CORREO_SINTETICO, 'utf8'),
    });

    await expect(page.locator('#aviso-adjunto')).toContainText('cita-sintetica.txt');
    await expect(page.locator('#texto-cita')).toHaveValue(/Paciente Sintetico B1/);

    await page.locator('#btn-crear-borrador').click();
    await expect(page.locator('#resultado-borrador')).toContainText('Borrador creado');

    // Ninguna petición salió del origen local (salvo el guion de identidad,
    // que layout.tsx carga siempre y no transporta nada del expediente).
    expect(intentos.filter((u) => !u.startsWith('https://accounts.google.com/gsi/'))).toEqual([]);
  });

  test('G7 · una imagen se adjunta, pero se dice que hay que completarla a mano', async ({ page }) => {
    // Los PDF SÍ se leen desde D1 —eso lo cubre `importacion-pdf.e2e.ts`—.
    // Las imágenes no: haría falta OCR, que no entra en esta fase. Lo que se
    // prueba aquí es la honestidad del mensaje.
    await page.goto('/appointments/import');

    await page.locator('#adjunto-cita').setInputFiles({
      name: 'captura-sintetica.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
        'hex',
      ),
    });

    // Honestidad: no se finge una extracción que no ocurre.
    await expect(page.locator('#aviso-adjunto')).toContainText('no puede leerse automáticamente');
    await expect(page.locator('#aviso-adjunto')).toContainText('a mano');
  });

  test('G8 · un tipo no admitido se rechaza sin exponer su contenido', async ({ page }) => {
    await page.goto('/appointments/import');

    await page.locator('#adjunto-cita').setInputFiles({
      name: 'programa.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('CONTENIDO-QUE-NO-DEBE-VERSE', 'utf8'),
    });

    const error = page.locator('#error-adjunto');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Solo se aceptan');
    await expect(error).not.toContainText('CONTENIDO-QUE-NO-DEBE-VERSE');
    await expect(page.locator('#texto-cita')).toHaveValue('');
  });

  test('G9 · la aplicación arranca y navega sin ninguna petición a la API de Gmail', async ({ page }) => {
    const intentos = vigilarGmail(page);

    for (const ruta of ['/dashboard', '/settings', '/appointments/import', '/members']) {
      await page.goto(ruta);
    }
    await page.waitForTimeout(6000); // supera cualquier temporizador de fondo

    expect(intentos).toEqual([]);
  });

  test('G10 · Ajustes ya no ofrece escaneo de Gmail ni lista de remitentes', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /Configuraci/i })).toBeVisible();

    const cuerpo = page.locator('body');
    await expect(cuerpo).not.toContainText('Escaneo automático diario de Gmail');
    await expect(cuerpo).not.toContainText('Escanear Gmail ahora');
    await expect(cuerpo).not.toContainText('Agregar fuente');
    await expect(page.locator('#btn-toggle-gmail-autoscan')).toHaveCount(0);
    await expect(page.locator('#btn-trigger-gmail-autoscan')).toHaveCount(0);

    // Lo que sí se conserva porque sigue aplicando a la importación manual.
    await expect(page.locator('#btn-toggle-future-only')).toBeVisible();
    await expect(page.locator('#link-importar-cita')).toBeVisible();
  });

  test('G11 · la consola no reporta ningún error durante el recorrido', async ({ page }) => {
    // Se ignoran los fallos de red provocados por la propia prueba: el arnés
    // aborta todo tráfico hacia Google, y Chromium lo registra como error.
    const errores: string[] = [];
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() !== 'error') return;
      if (/Failed to load resource|ERR_FAILED|ERR_BLOCKED/i.test(t)) return;
      errores.push(t);
    });

    await sembrarFamiliar(page);
    await page.goto('/appointments/import');
    await page.locator('#texto-cita').fill(CORREO_SINTETICO);
    await page.locator('#btn-crear-borrador').click();
    await expect(page.locator('#resultado-borrador')).toBeVisible();

    expect(errores, errores.join('\n')).toEqual([]);
  });
});
