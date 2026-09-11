import { test, expect, Page } from '@playwright/test';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';

/**
 * E2E · Extracción de texto de PDF (Bloque B · D1).
 *
 * Estas pruebas son las que de verdad importan para esta función, porque son
 * las únicas que ejercitan pdf.js REAL, su worker REAL y la CSP de A7 al mismo
 * tiempo. Las unitarias prueban la lógica con un doble; aquí se comprueba que
 * la biblioteca arranca dentro de la política de seguridad sin pedir nada.
 *
 * Todos los PDF se fabrican aquí, con texto sintético. Ninguno procede de un
 * documento real y ninguno sale del navegador.
 */

const TEXTO_CITA = [
  'Confirmacion de cita medica',
  'Paciente Sintetico B1',
  'Fecha 15/07/2027 hora 10:30 am',
  'Especialidad odontologia',
];

/**
 * Fabrica un PDF mínimo pero válido, con capa de texto de verdad.
 *
 * Se construye a mano —con su tabla de referencias cruzadas y sus
 * desplazamientos calculados— en lugar de guardar un binario en el
 * repositorio: así se ve exactamente qué contiene y no hay ningún archivo
 * opaco versionado.
 */
function pdfConTexto(lineas: string[]): Buffer {
  const contenido =
    'BT\n/F1 12 Tf\n72 720 Td\n14 TL\n' +
    lineas.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj\nT*\n`).join('') +
    'ET\n';

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });

  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const pos of posiciones) {
    pdf += `${String(pos).padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** PDF válido cuya única capa de texto es un pie de página: un escaneado. */
function pdfSinTextoUtil(): Buffer {
  return pdfConTexto(['1 de 1']);
}

/** Vigila que nada salga del origen local durante la extracción. */
function vigilarSalidas(page: Page): string[] {
  const fuera: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost')) return;
    // El guion de identidad lo carga layout.tsx en toda visita y no
    // transporta nada del expediente ni del documento.
    if (u.startsWith('https://accounts.google.com/gsi/')) return;
    fuera.push(u);
  });
  return fuera;
}

async function adjuntar(page: Page, name: string, buffer: Buffer) {
  await page.locator('#adjunto-cita').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer,
  });
}

test.describe('Bloque B · D1 · lectura de PDF', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
    await page.goto('/appointments/import');
  });

  test('P1 · un PDF con capa de texto llena el borrador editable', async ({ page }) => {
    await adjuntar(page, 'cita-sintetica.pdf', pdfConTexto(TEXTO_CITA));

    await expect(page.locator('#aviso-adjunto')).toContainText('cita-sintetica.pdf', {
      timeout: 30_000,
    });
    await expect(page.locator('#texto-cita')).toHaveValue(/Paciente Sintetico B1/);
    await expect(page.locator('#texto-cita')).toHaveValue(/15\/07\/2027/);

    // Y el texto extraído sirve de verdad: produce un borrador con sus datos.
    await page.locator('#btn-crear-borrador').click();
    await expect(page.locator('#resultado-borrador')).toContainText('Borrador creado');
    await expect(page.locator('body')).toContainText('2027-07-15');
  });

  test('P2 · un PDF escaneado avisa con honestidad y NO crea ninguna cita', async ({ page }) => {
    await adjuntar(page, 'escaneo-sintetico.pdf', pdfSinTextoUtil());

    await expect(page.locator('#error-adjunto')).toContainText(
      'No se detectó texto en el documento. Completa los datos de la cita manualmente.',
      { timeout: 30_000 },
    );

    // El campo queda vacío: no se inventa contenido.
    await expect(page.locator('#texto-cita')).toHaveValue('');
    // Y sin texto no hay borrador que crear.
    await expect(page.locator('#btn-crear-borrador')).toBeDisabled();

    const estado = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}'),
    );
    const manuales = (estado.appointmentCandidates ?? []).filter(
      (c: { sourceEmail: string }) => c.sourceEmail === 'MANUAL',
    );
    expect(manuales).toEqual([]);
  });

  test('P3 · un PDF corrupto da un error claro y no filtra su contenido', async ({ page }) => {
    const roto = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'latin1'),
      Buffer.from('BASURA-QUE-NO-DEBE-VERSE Paciente Fantasma', 'latin1'),
    ]);

    await adjuntar(page, 'roto-sintetico.pdf', roto);

    const error = page.locator('#error-adjunto');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText('No se pudo leer el documento');
    await expect(error).not.toContainText('BASURA-QUE-NO-DEBE-VERSE');
    await expect(error).not.toContainText('Paciente Fantasma');
    await expect(page.locator('#texto-cita')).toHaveValue('');
  });

  test('P4 · un PDF por encima del límite se rechaza sin leerlo', async ({ page }) => {
    // 9 MB: el límite son 8. El rechazo llega de `validarAdjunto`, antes de
    // que pdf.js vea un solo byte.
    const enorme = Buffer.alloc(9 * 1024 * 1024, 0x41);
    enorme.write('%PDF-1.4\n', 0, 'latin1');

    await adjuntar(page, 'enorme-sintetico.pdf', enorme);

    await expect(page.locator('#error-adjunto')).toContainText('supera los 8 MB', {
      timeout: 30_000,
    });
    await expect(page.locator('#texto-cita')).toHaveValue('');
    // No se muestra el indicador de lectura: no se llegó a abrir el archivo.
    await expect(page.locator('#leyendo-pdf')).toHaveCount(0);
  });

  test('P5 · durante la extracción no sale NADA del dispositivo', async ({ page }) => {
    const fuera = vigilarSalidas(page);

    await adjuntar(page, 'cita-sintetica.pdf', pdfConTexto(TEXTO_CITA));
    await expect(page.locator('#texto-cita')).toHaveValue(/Paciente Sintetico B1/, {
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);

    // Ni CDN, ni APIs de Google, ni Gmail, ni Firebase, ni Drive, ni Sheets,
    // ni Apps Script, ni ningún otro servicio.
    expect(fuera, fuera.join('\n')).toEqual([]);
  });

  test('P6 · el worker se carga del propio origen, nunca de un CDN ni de blob:', async ({ page }) => {
    const peticiones: string[] = [];
    page.on('request', (r) => peticiones.push(r.url()));

    await adjuntar(page, 'cita-sintetica.pdf', pdfConTexto(TEXTO_CITA));
    await expect(page.locator('#texto-cita')).toHaveValue(/Paciente Sintetico B1/, {
      timeout: 30_000,
    });

    const worker = peticiones.filter((u) => u.includes('pdf.worker'));
    expect(worker.length, 'debe pedirse el worker').toBeGreaterThan(0);
    for (const u of worker) {
      expect(u.startsWith('http://127.0.0.1')).toBe(true);
      expect(u).not.toContain('cdn');
      expect(u).not.toContain('unpkg');
      expect(u).not.toContain('blob:');
    }
  });

  test('P7 · la extracción no dispara ni una violación de CSP', async ({ page }) => {
    // Si pdf.js necesitara `unsafe-eval` o un worker en blob:, saltaría aquí.
    const violaciones: string[] = [];
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp.push(
          `${e.violatedDirective} ← ${e.blockedURI}`,
        );
      });
    });
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) violaciones.push(t);
    });

    await page.goto('/appointments/import');
    await adjuntar(page, 'cita-sintetica.pdf', pdfConTexto(TEXTO_CITA));
    await expect(page.locator('#texto-cita')).toHaveValue(/Paciente Sintetico B1/, {
      timeout: 30_000,
    });

    expect(violaciones, violaciones.join('\n')).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])).toEqual([]);
  });

  test('P8 · la CSP servida sigue siendo EXACTAMENTE la de A7', async ({ page }) => {
    // Añadir pdf.js no debe haber movido ni un carácter de la política.
    const csp = (await page.goto('/appointments/import'))!.headers()['content-security-policy'];

    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://accounts.google.com");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain(
      "connect-src 'self' https://*.googleapis.com https://accounts.google.com https://script.google.com https://script.googleusercontent.com",
    );
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toContain('cdnjs');
    expect(csp).not.toContain('unpkg');
    // `blob:` sigue solo en img-src, donde estaba: nunca en script ni worker.
    expect(csp.match(/blob:/g) ?? []).toHaveLength(1);
    expect(csp).toContain("img-src 'self' data: blob:");
  });
});
