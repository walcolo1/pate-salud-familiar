import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  TAMANO_MAXIMO_PDF,
  RUTA_WORKER_PDF,
  MINIMO_CARACTERES_UTILES,
  MENSAJE_PDF_SIN_TEXTO,
  MENSAJE_PDF_ILEGIBLE,
  MENSAJE_PDF_GRANDE,
  normalizarTexto,
  clasificarTextoPdf,
  excedeTamanoPdf,
  mensajeResultadoPdf,
  extraerTextoPdf,
  type CargadorPdf,
  type DocumentoPdfLike,
} from './extraerTextoPdf';

/**
 * Pruebas de la extracción de texto de PDF (Bloque B · D1).
 *
 * Aquí se prueba la LÓGICA con un doble de pdf.js: cuándo un PDF cuenta como
 * escaneado, qué pasa con uno dañado, y que el tamaño se comprueba antes de
 * leer nada. La biblioteca real, su worker y la CSP se prueban en el navegador
 * (`e2e/importacion-pdf.e2e.ts`): son afirmaciones distintas y ninguna
 * sustituye a la otra.
 */

/** Doble de pdf.js: devuelve las páginas que se le indiquen. */
function cargadorFalso(paginas: string[][]): CargadorPdf {
  return async (): Promise<DocumentoPdfLike> => ({
    numPages: paginas.length,
    getPage: async (n: number) => ({
      getTextContent: async () => ({ items: paginas[n - 1].map((str) => ({ str })) }),
    }),
  });
}

const CITA = [
  'Confirmacion de cita',
  'Paciente Sintetico B1',
  'Fecha 15/07/2027 hora 10:30 am',
];

// ─────────────────────────────────────────────────────────────────────────────

describe('normalizarTexto', () => {
  it('colapsa espacios y descarta líneas vacías', () => {
    expect(normalizarTexto('  hola   mundo  \n\n\n  otra  linea ')).toBe('hola mundo\notra linea');
  });

  it('unifica los saltos de línea de Windows', () => {
    expect(normalizarTexto('a\r\nb')).toBe('a\nb');
  });

  it('un texto solo de espacios queda vacío', () => {
    expect(normalizarTexto('   \n \t \n ')).toBe('');
  });
});

describe('clasificarTextoPdf', () => {
  it('un PDF con texto de verdad se acepta', () => {
    const r = clasificarTextoPdf(CITA.join('\n'));
    expect(r.estado).toBe('ok');
    expect(r.estado === 'ok' && r.texto).toContain('Paciente Sintetico B1');
  });

  it('un PDF escaneado —sin capa de texto— se declara sin texto', () => {
    expect(clasificarTextoPdf('').estado).toBe('sin_texto');
    expect(clasificarTextoPdf(null).estado).toBe('sin_texto');
    expect(clasificarTextoPdf(undefined).estado).toBe('sin_texto');
  });

  it('unas migajas de texto NO cuentan como documento legible', () => {
    // Un PDF de imagen suele traer un pie de página en la capa de texto.
    // Devolverlo como si fuera la cita sería peor que admitir que no hay nada.
    expect(clasificarTextoPdf('Pagina 1 de 1').estado).toBe('sin_texto');
  });

  it('el umbral se aplica sobre caracteres útiles, no sobre espacios', () => {
    const justoDebajo = 'a'.repeat(MINIMO_CARACTERES_UTILES - 1);
    const justo = 'a'.repeat(MINIMO_CARACTERES_UTILES);
    expect(clasificarTextoPdf(justoDebajo).estado).toBe('sin_texto');
    expect(clasificarTextoPdf(justo).estado).toBe('ok');
    // Mucho espacio en blanco no convierte un documento vacío en legible.
    expect(clasificarTextoPdf('a  '.repeat(30)).estado).toBe('ok');
    expect(clasificarTextoPdf(' '.repeat(500)).estado).toBe('sin_texto');
  });
});

describe('límite de tamaño', () => {
  it('el límite es 8 MB y se acepta justo en el borde', () => {
    expect(TAMANO_MAXIMO_PDF).toBe(8 * 1024 * 1024);
    expect(excedeTamanoPdf(TAMANO_MAXIMO_PDF)).toBe(false);
    expect(excedeTamanoPdf(TAMANO_MAXIMO_PDF + 1)).toBe(true);
  });

  it('un archivo demasiado grande se rechaza SIN abrirlo', async () => {
    // El cargador es el que leería el archivo. Si se le llama, la comprobación
    // de tamaño llegó tarde.
    const cargador = vi.fn(cargadorFalso([CITA]));
    const grande = new Uint8Array(TAMANO_MAXIMO_PDF + 1);

    const r = await extraerTextoPdf(grande, cargador);

    expect(r).toEqual({ estado: 'demasiado_grande' });
    expect(cargador).not.toHaveBeenCalled();
  });
});

describe('extraerTextoPdf', () => {
  const datos = new Uint8Array([1, 2, 3]);

  it('junta el texto de todas las páginas', async () => {
    const r = await extraerTextoPdf(datos, cargadorFalso([CITA, ['Pagina dos con contenido']]));
    expect(r.estado).toBe('ok');
    expect(r.estado === 'ok' && r.texto).toContain('Paciente Sintetico B1');
    expect(r.estado === 'ok' && r.texto).toContain('Pagina dos con contenido');
  });

  it('un PDF escaneado devuelve sin_texto, no una cadena vacía', async () => {
    const r = await extraerTextoPdf(datos, cargadorFalso([[], []]));
    expect(r).toEqual({ estado: 'sin_texto' });
  });

  it('un PDF dañado devuelve ilegible en vez de lanzar', async () => {
    const roto: CargadorPdf = async () => {
      throw new Error('InvalidPDFException');
    };
    await expect(extraerTextoPdf(datos, roto)).resolves.toEqual({ estado: 'ilegible' });
  });

  it('un PDF cifrado tampoco rompe la aplicación', async () => {
    const cifrado: CargadorPdf = async () => {
      throw new Error('PasswordException');
    };
    await expect(extraerTextoPdf(datos, cifrado)).resolves.toEqual({ estado: 'ilegible' });
  });

  it('si una página falla a mitad, no se entrega texto a medias', async () => {
    const aMitad: CargadorPdf = async () => ({
      numPages: 2,
      getPage: async (n: number) => {
        if (n === 2) throw new Error('FormatError');
        return { getTextContent: async () => ({ items: CITA.map((str) => ({ str })) }) };
      },
    });
    await expect(extraerTextoPdf(datos, aMitad)).resolves.toEqual({ estado: 'ilegible' });
  });

  it('el error registrado no arrastra contenido del documento', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    const filtrador: CargadorPdf = async () => {
      throw new Error('Paciente Sintetico B1 tiene cita el 15/07/2027');
    };

    await extraerTextoPdf(datos, filtrador);

    const registrado = espia.mock.calls.flat().join(' ');
    expect(registrado).not.toContain('Paciente Sintetico B1');
    expect(registrado).not.toContain('15/07/2027');
    espia.mockRestore();
  });

  it('ignora elementos sin `str` sin romperse', async () => {
    const raro: CargadorPdf = async () => ({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [{ str: 'Confirmacion de cita medica' }, {}, { otro: 1 }, { str: 'del paciente' }],
        }),
      }),
    });
    const r = await extraerTextoPdf(datos, raro);
    expect(r.estado).toBe('ok');
    expect(r.estado === 'ok' && r.texto).toContain('Confirmacion de cita medica');
  });
});

describe('mensajes para la persona', () => {
  it('cada estado tiene su mensaje, y el correcto no tiene ninguno', () => {
    expect(mensajeResultadoPdf({ estado: 'ok', texto: 'x' })).toBeNull();
    expect(mensajeResultadoPdf({ estado: 'sin_texto' })).toBe(MENSAJE_PDF_SIN_TEXTO);
    expect(mensajeResultadoPdf({ estado: 'ilegible' })).toBe(MENSAJE_PDF_ILEGIBLE);
    expect(mensajeResultadoPdf({ estado: 'demasiado_grande' })).toBe(MENSAJE_PDF_GRANDE);
  });

  it('el aviso de PDF escaneado dice exactamente lo acordado', () => {
    expect(MENSAJE_PDF_SIN_TEXTO).toBe(
      'No se detectó texto en el documento. Completa los datos de la cita manualmente.',
    );
  });

  it('ningún mensaje culpa a la persona ni deja el camino cerrado', () => {
    for (const m of [MENSAJE_PDF_SIN_TEXTO, MENSAJE_PDF_ILEGIBLE]) {
      expect(m).toMatch(/manualmente|a mano/i);
    }
  });
});

describe('worker de pdf.js', () => {
  it('se sirve del propio origen: ni CDN ni blob:', () => {
    // `worker-src 'self'` de la CSP de A7. Un worker externo o en blob:
    // exigiría abrir la directiva, y eso no se hace.
    expect(RUTA_WORKER_PDF).toBe('/pdf.worker.min.mjs');
    expect(RUTA_WORKER_PDF.startsWith('/')).toBe(true);
    expect(RUTA_WORKER_PDF).not.toContain('//');
    expect(RUTA_WORKER_PDF).not.toContain('blob:');
    expect(RUTA_WORKER_PDF).not.toContain('data:');
  });

  it('el paquete instalado no evalúa código en tiempo de ejecución', () => {
    // `isEvalSupported: false` ya no existe en pdf.js 6 porque la biblioteca
    // dejó de necesitarlo. Esta prueba sustituye a la bandera: si una versión
    // futura reintrodujera `eval`, la CSP de A7 lo bloquearía en producción y
    // aquí se vería antes.
    for (const archivo of [
      'node_modules/pdfjs-dist/build/pdf.min.mjs',
      'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    ]) {
      const fuente = readFileSync(archivo, 'utf8');
      expect(fuente.includes('eval('), archivo).toBe(false);
      // `new Function(` con paréntesis: `new FunctionBasedShading(` es un
      // nombre de clase, no evaluación de código.
      expect(fuente.includes('new Function('), archivo).toBe(false);
    }
  });

  it('la copia servida es EXACTAMENTE la del paquete instalado', () => {
    // Sin esta prueba, actualizar `pdfjs-dist` dejaría el worker de una
    // versión distinta al de la biblioteca, y el fallo aparecería en tiempo
    // de ejecución y no aquí.
    const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
    expect(sha('public/pdf.worker.min.mjs')).toBe(
      sha('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    );
  });
});
