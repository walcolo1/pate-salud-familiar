/**
 * Extracción de texto de PDF — Paté · Salud Familiar (Bloque B · D1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Las EPS mandan la confirmación de la cita como PDF. Este módulo saca su
 * texto para que la persona no tenga que transcribirlo a mano.
 *
 * DÓNDE OCURRE
 * ────────────
 * En este navegador, y en ningún otro sitio. El archivo no se sube, no se
 * envía a ninguna API y no sale del dispositivo: es información clínica. La
 * biblioteca (`pdfjs-dist`) va empaquetada con la aplicación y su worker se
 * sirve desde el propio origen —`/pdf.worker.min.mjs`—, nunca desde un CDN.
 *
 * POR QUÉ ESTA CONFIGURACIÓN Y NO OTRA
 * ────────────────────────────────────
 * La CSP de A7 no se toca ni un carácter. Eso obliga a:
 *
 *   · worker del propio origen   → `worker-src 'self'`. Un worker en `blob:`
 *                                  exigiría abrir la directiva.
 *   · `disableFontFace: true`    → no hace falta dibujar nada, solo leer el
 *                                  texto; evita cargar tipografías.
 *   · `useWorkerFetch: false`    → el worker no sale a buscar recursos.
 *   · sin `unsafe-eval`          → pdf.js 6 ya no evalúa código en tiempo de
 *                                  ejecución, así que la opción
 *                                  `isEvalSupported` desapareció de la
 *                                  biblioteca. Hay una prueba que verifica la
 *                                  ausencia de `eval` en el paquete instalado,
 *                                  por si una versión futura lo reintrodujera.
 *
 * Si algo de esto dejara de bastar, la salida correcta NO es aflojar la
 * política: es volver al comportamiento anterior —adjuntar y completar a
 * mano—, que sigue implementado y probado.
 *
 * LO QUE ESTE MÓDULO NO HACE
 * ──────────────────────────
 * Un PDF escaneado es una imagen dentro de un PDF: no tiene capa de texto y
 * aquí no hay OCR. En ese caso se dice con claridad, en vez de devolver una
 * cadena vacía que parecería un fallo.
 */

/** Mismo límite que el resto de adjuntos. */
export const TAMANO_MAXIMO_PDF = 8 * 1024 * 1024;

/** Ruta del worker. Del propio origen: la CSP declara `worker-src 'self'`. */
export const RUTA_WORKER_PDF = '/pdf.worker.min.mjs';

/**
 * Un PDF con menos texto útil que esto se trata como escaneado.
 *
 * No es cero: muchos PDF de imagen traen una firma o un pie de página en la
 * capa de texto, y devolver «Página 1 de 1» como si fuera la cita sería peor
 * que admitir que no se detectó nada.
 */
export const MINIMO_CARACTERES_UTILES = 20;

export const MENSAJE_PDF_SIN_TEXTO =
  'No se detectó texto en el documento. Completa los datos de la cita manualmente.';

export const MENSAJE_PDF_ILEGIBLE =
  'No se pudo leer el documento. Puede estar dañado o protegido con contraseña. ' +
  'Completa los datos de la cita manualmente.';

export const MENSAJE_PDF_GRANDE = 'El archivo supera los 8 MB.';

export type ResultadoPdf =
  | { estado: 'ok'; texto: string }
  | { estado: 'sin_texto' }
  | { estado: 'ilegible' }
  | { estado: 'demasiado_grande' };

/** Mensaje para la persona. Nunca incluye contenido del documento. */
export function mensajeResultadoPdf(r: ResultadoPdf): string | null {
  switch (r.estado) {
    case 'ok':
      return null;
    case 'sin_texto':
      return MENSAJE_PDF_SIN_TEXTO;
    case 'ilegible':
      return MENSAJE_PDF_ILEGIBLE;
    case 'demasiado_grande':
      return MENSAJE_PDF_GRANDE;
  }
}

/** Normaliza el texto que devuelve pdf.js: espacios sueltos y líneas vacías. */
export function normalizarTexto(crudo: string): string {
  return crudo
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .trim();
}

/**
 * Decide el resultado a partir del texto ya extraído.
 *
 * Se separa de la extracción a propósito: así la regla —cuándo un PDF cuenta
 * como «sin texto»— se prueba sin navegador ni biblioteca.
 */
export function clasificarTextoPdf(crudo: string | null | undefined): ResultadoPdf {
  const texto = normalizarTexto(crudo ?? '');
  if (texto.replace(/\s/g, '').length < MINIMO_CARACTERES_UTILES) {
    return { estado: 'sin_texto' };
  }
  return { estado: 'ok', texto };
}

/** Comprueba el tamaño ANTES de leer un solo byte del archivo. */
export function excedeTamanoPdf(bytes: number): boolean {
  return bytes > TAMANO_MAXIMO_PDF;
}

/**
 * Carga de pdf.js, inyectable.
 *
 * En el navegador se importa la biblioteca real; en las pruebas se pasa un
 * doble, de modo que la lógica de este módulo se verifique sin arrastrar 1,3 MB
 * de worker a un entorno donde no hay `Worker`.
 */
export interface DocumentoPdfLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

export type CargadorPdf = (datos: Uint8Array) => Promise<DocumentoPdfLike>;

async function cargadorPorDefecto(datos: Uint8Array): Promise<DocumentoPdfLike> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = RUTA_WORKER_PDF;

  const tarea = pdfjs.getDocument({
    data: datos,
    // SOBRE `isEvalSupported: false`
    // ──────────────────────────────
    // Esa opción ya NO existe en pdf.js 6: se retiró porque la biblioteca
    // dejó de evaluar código en tiempo de ejecución. Comprobado sobre el
    // paquete instalado —cero `eval(` y cero `new Function(` en `pdf.min.mjs`
    // y en el worker—, así que el objetivo que perseguía la opción se cumple
    // de forma estructural, sin depender de una bandera.
    // La comprobación de verdad es la de navegador: `e2e/importacion-pdf`
    // extrae texto con la CSP de A7 puesta y exige cero violaciones.
    //
    // No se dibuja nada: no hacen falta tipografías ni fuentes del sistema.
    disableFontFace: true,
    useSystemFonts: false,
    // Que el worker no salga a buscar recursos por su cuenta.
    useWorkerFetch: false,
  });
  return (await tarea.promise) as unknown as DocumentoPdfLike;
}

/**
 * Extrae el texto de todas las páginas.
 *
 * Nunca lanza: devuelve `ilegible`. Un PDF dañado, cifrado o que no es un PDF
 * es un caso normal de uso, no un fallo del programa, y la persona necesita
 * un mensaje, no una excepción.
 */
export async function extraerTextoPdf(
  datos: Uint8Array,
  cargador: CargadorPdf = cargadorPorDefecto,
): Promise<ResultadoPdf> {
  if (excedeTamanoPdf(datos.byteLength)) return { estado: 'demasiado_grande' };

  try {
    const documento = await cargador(datos);
    const partes: string[] = [];

    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const contenido = await pagina.getTextContent();
      const linea = contenido.items
        .map((i) => (i as { str?: string }).str ?? '')
        .join(' ');
      partes.push(linea);
    }

    return clasificarTextoPdf(partes.join('\n'));
  } catch (err) {
    // No se registra el error con su contenido: podría arrastrar fragmentos
    // del documento, que es información clínica.
    console.error('[extraerTextoPdf] No se pudo leer el PDF:', (err as Error)?.name ?? 'error');
    return { estado: 'ilegible' };
  }
}
