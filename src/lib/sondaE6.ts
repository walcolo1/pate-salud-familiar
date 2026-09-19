/**
 * Sonda E6 en vivo — el plan de las cinco promesas (Bloque E, E6-live)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Las 35 pruebas de `router.test.ts` cubren la cadena con dobles: el orden de
 * los eslabones, cada corte, la traducción de errores. Lo que no pueden cubrir
 * es lo que solo existe cuando hay un despliegue de verdad —que `UrlFetchApp`
 * alcance `tokeninfo`, que un `id_token` emitido por Google pase las tres
 * validaciones, que revocar surta efecto en la petición siguiente—.
 *
 * Aquí está **el plan** de esa validación, y solo el plan: qué se pide, con qué
 * token y qué se espera de vuelta. Lo que hace la red vive en
 * `scripts/e6-en-vivo.mjs`, que transpila este fichero y lo ejecuta. El reparto
 * es el mismo de todo el bloque: las decisiones donde se pueden probar, las
 * llamadas donde no queda más remedio.
 *
 * ESTE FICHERO NO SABE NINGÚN SECRETO
 * ───────────────────────────────────
 * Ni la URL del despliegue, ni los correos, ni los tokens. Todo eso entra por
 * parámetro en el momento de ejecutar y **no se escribe en ninguna parte**: la
 * URL de un Web App es una credencial —quien la tenga puede llamar al endpoint—
 * y un `id_token` es una sesión viva durante una hora.
 */

/** De dónde sale el `idToken` de cada prueba. */
export type FuenteToken =
  /** No se manda el campo. Es la petición de un desconocido. */
  | 'NINGUNO'
  /** Una cadena que ni siquiera tiene forma de JWT. */
  | 'BASURA'
  /** Tres tramos separados por puntos, base64url válido, firma inventada. */
  | 'JWT_FALSO'
  /** El token real del titular. */
  | 'TITULAR'
  /** El token real de la segunda cuenta. */
  | 'SEGUNDA';

/** Qué se espera de la respuesta. */
export type Expectativa =
  /** `ok: true`, sin mirar el contenido. */
  | { clase: 'OK' }
  /** `ok: true` y además **ninguna fuga**: ni correos ni identificadores. */
  | { clase: 'OK_SIN_FUGAS' }
  /** `ok: false` con exactamente este código. */
  | { clase: 'ERROR'; codigo: string };

export interface PruebaEnVivo {
  /** Identificador estable, el que se cita en la evidencia. */
  id: string;
  /** Cuál de las cinco promesas comprueba. */
  criterio: number;
  titulo: string;
  /** Por qué esta prueba existe. Va al informe, no a la consola. */
  porque: string;
  token: FuenteToken;
  accion: string;
  payloadDe?: (contexto: ContextoSonda) => Record<string, unknown>;
  /** Cuerpo literal, para las pruebas que mandan algo que no es una solicitud. */
  cuerpoCrudo?: string;
  espera: Expectativa;
  /**
   * Lo que tiene que hacer una persona **antes** de esta prueba, cuando no se
   * puede automatizar. El corredor se para y lo enseña.
   */
  pasoManual?: string;
}

/** Lo que el corredor sabe en tiempo de ejecución. Nada de esto se versiona. */
export interface ContextoSonda {
  /** Correo de la segunda cuenta, ya normalizado. */
  emailSegunda: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// El plan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un JWT con la forma correcta y la firma inventada.
 *
 * Importa que sea **bien formado**: si se manda basura, `claveCache` lanza
 * antes de llegar a Google y la prueba pasaría sin haber comprobado que
 * `tokeninfo` rechaza lo que no firmó. Con esto sí sale la petición de red, y
 * lo que se mide es la respuesta de Google.
 */
export const JWT_FALSO =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhdWQiOiJubyIsImV4cCI6OTk5OTk5OTk5OX0' +
  '.ZmlybWEtaW52ZW50YWRhLXF1ZS1Hb29nbGUtbm8tZmlybW8';

/**
 * Las nueve peticiones, en el orden en que tienen que salir.
 *
 * **El orden es parte de la prueba**, y en dos sitios:
 *
 *   · `E6L-4` usa la segunda cuenta **antes** de darla de alta. Si se hiciera
 *     después, no probaría la denegación por defecto.
 *   · `E6L-5c` tiene que ir inmediatamente detrás de `E6L-5b`, y `E6L-5a` tiene
 *     que haber pasado antes para que la entrada de caché de esa cuenta esté
 *     **caliente**. Revocar sobre una caché fría no demuestra nada: el acierto
 *     es que la clave versionada deja fuera a quien ya estaba dentro.
 */
export const PLAN_E6: readonly PruebaEnVivo[] = [
  {
    id: 'E6L-1',
    criterio: 1,
    titulo: 'ping anónimo responde y no cuenta nada',
    porque:
      'El endpoint es público. Su única acción sin token no puede devolver el correo del titular ni el identificador de la hoja.',
    token: 'NINGUNO',
    accion: 'ping',
    espera: { clase: 'OK_SIN_FUGAS' },
  },
  {
    id: 'E6L-2',
    criterio: 3,
    titulo: 'sin el campo idToken se rechaza',
    porque: 'Toda acción con verbo pasa por E3. Sin token no hay identidad y no hay rol.',
    token: 'NINGUNO',
    accion: 'listarPacientes',
    espera: { clase: 'ERROR', codigo: 'TOKEN_INVALIDO' },
  },
  {
    id: 'E6L-3',
    criterio: 3,
    titulo: 'una cadena que no es un JWT se rechaza sin salir a la red',
    porque:
      '`claveCache` corta antes de gastar una llamada a Google. Un endpoint público no puede convertirse en un ariete contra tokeninfo.',
    token: 'BASURA',
    accion: 'listarPacientes',
    espera: { clase: 'ERROR', codigo: 'TOKEN_INVALIDO' },
  },
  {
    id: 'E6L-4',
    criterio: 3,
    titulo: 'un JWT bien formado que Google no firmó se rechaza',
    porque:
      'Esta es la que de verdad mide E3: la petición sale a `tokeninfo`, Google contesta que no es suyo, y el router traduce eso a una sola palabra.',
    token: 'JWT_FALSO',
    accion: 'listarPacientes',
    espera: { clase: 'ERROR', codigo: 'TOKEN_INVALIDO' },
  },
  {
    id: 'E6L-5',
    criterio: 2,
    titulo: 'el id_token real del titular pasa las tres validaciones',
    porque:
      'Audiencia, correo verificado y caducidad, comprobadas sobre lo que responde Google y no sobre el JWT descodificado a mano.',
    token: 'TITULAR',
    accion: 'listarPacientes',
    espera: { clase: 'OK' },
  },
  {
    id: 'E6L-6',
    criterio: 4,
    titulo: 'una cuenta real que no figura en ACCESO se deniega',
    porque:
      'Denegación por defecto. El token es válido y la identidad es cierta; lo que falta es la fila, y sin fila no se entra.',
    token: 'SEGUNDA',
    accion: 'listarPacientes',
    espera: { clase: 'ERROR', codigo: 'ACCESO_DENEGADO' },
    pasoManual:
      'Ninguno. La segunda cuenta NO debe figurar todavía en la pestaña ACCESO.',
  },
  {
    id: 'E6L-7',
    criterio: 5,
    titulo: 'la misma cuenta, ya dada de alta, entra',
    porque:
      'Deja la entrada de caché caliente, que es la condición que hace significativa la revocación de la prueba siguiente.',
    token: 'SEGUNDA',
    accion: 'listarPacientes',
    espera: { clase: 'OK' },
    pasoManual:
      'En la pestaña ACCESO, añade una fila para la segunda cuenta: email, rol LECTOR, pacientes_asignados «*», estado ACTIVO. Guarda.',
  },
  {
    id: 'E6L-8',
    criterio: 5,
    titulo: 'el titular revoca a esa cuenta por la API',
    porque:
      'La revocación tiene que pasar por `mutarAcceso`, que es lo único que sube la versión. Tachar la celda a mano en la hoja NO invalida nada.',
    token: 'TITULAR',
    accion: 'revocar',
    payloadDe: (contexto) => ({ email: contexto.emailSegunda }),
    espera: { clase: 'OK' },
  },
  {
    id: 'E6L-9',
    criterio: 5,
    titulo: 'la petición inmediatamente siguiente de la revocada se rechaza',
    porque:
      'Es el criterio que justifica todo el diseño de E4. Mismo token, misma acción, sin esperar: si esto tarda cinco minutos, la versión en la clave no sirve para nada.',
    token: 'SEGUNDA',
    accion: 'listarPacientes',
    espera: { clase: 'ERROR', codigo: 'ACCESO_DENEGADO' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Construir la petición
// ─────────────────────────────────────────────────────────────────────────────

export interface TokensReales {
  titular: string;
  segunda: string;
}

/** Qué token le toca a cada prueba. */
export function tokenDe(fuente: FuenteToken, tokens: TokensReales): string | null {
  if (fuente === 'NINGUNO') return null;
  if (fuente === 'BASURA') return 'esto-no-es-un-jwt';
  if (fuente === 'JWT_FALSO') return JWT_FALSO;
  if (fuente === 'TITULAR') return tokens.titular;
  return tokens.segunda;
}

/**
 * El cuerpo que se manda, ya serializado.
 *
 * `text/plain` por costumbre prudente: E0-bis midió que `application/json`
 * también cruza, pero lo que funciona con seguridad no cuesta nada.
 */
export function cuerpoDe(
  prueba: PruebaEnVivo,
  tokens: TokensReales,
  contexto: ContextoSonda,
): string {
  if (typeof prueba.cuerpoCrudo === 'string') return prueba.cuerpoCrudo;

  const solicitud: Record<string, unknown> = { accion: prueba.accion };

  const token = tokenDe(prueba.token, tokens);
  // Ausente, no vacío: mandar `idToken: ''` sería otra prueba distinta.
  if (token !== null) solicitud.idToken = token;

  if (prueba.payloadDe) solicitud.payload = prueba.payloadDe(contexto);

  return JSON.stringify(solicitud);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fugas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué se ha escapado en una respuesta que no debería contar nada.
 *
 * El mismo par de reglas que `E0b-4` aplica en el navegador, aquí sobre el
 * texto crudo: cualquier cosa con forma de correo, y cualquier cadena larga que
 * pueda ser el identificador de la hoja o de una carpeta de Drive.
 *
 * Se mira el **texto crudo**, no el objeto: un correo metido dentro de un
 * mensaje de error también es una fuga.
 */
export function fugasEn(crudo: string): string[] {
  const fugas: string[] = [];
  const texto = typeof crudo === 'string' ? crudo : '';

  if (/[^@\s"]+@[^@\s"]+\.[a-z]{2,}/i.test(texto)) fugas.push('una dirección de correo');
  if (/[A-Za-z0-9_-]{40,}/.test(texto)) fugas.push('un identificador largo');

  return fugas;
}

/**
 * Deja un texto en condiciones de imprimirse y de pegarse en un informe.
 *
 * Un `id_token` no puede aparecer en una consola que luego se copia a un
 * documento: dura una hora y es una sesión completa. Los correos tampoco.
 */
export function redactar(texto: string): string {
  return String(texto ?? '')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '‹id_token›')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/gi, '‹correo›')
    .replace(/[A-Za-z0-9_-]{40,}/g, '‹identificador›');
}

// ─────────────────────────────────────────────────────────────────────────────
// Clasificar la respuesta
// ─────────────────────────────────────────────────────────────────────────────

export interface Resultado {
  id: string;
  criterio: number;
  titulo: string;
  veredicto: 'PASA' | 'FALLA';
  /** Qué se vio, ya redactado. Apto para pegar en la evidencia. */
  detalle: string;
  /** Milisegundos de ida y vuelta, cuando el corredor los mide. */
  ms?: number;
}

/**
 * ¿Hizo el despliegue lo que la prueba esperaba?
 *
 * Un 302 se trata aparte porque es el fallo más común y el más
 * desconcertante: Apps Script redirige a la pantalla de sesión cuando el
 * despliegue no está publicado como `ANYONE_ANONYMOUS`, y lo que llega es HTML
 * en vez de JSON. Decir «respuesta ilegible» ahí no ayudaría a nadie.
 */
export function clasificar(prueba: PruebaEnVivo, estado: number, crudo: string): Resultado {
  const base = { id: prueba.id, criterio: prueba.criterio, titulo: prueba.titulo };
  const falla = (detalle: string): Resultado => ({ ...base, veredicto: 'FALLA', detalle });

  if (estado !== 200) {
    if (estado === 302 || /accounts\.google\.com|iniciar sesión/i.test(crudo)) {
      return falla(
        `HTTP ${estado}: el despliegue pide iniciar sesión. Revisa que «Quién tiene acceso» sea «Cualquier usuario» y que la URL termine en /exec`,
      );
    }
    return falla(`HTTP ${estado}: ${redactar(crudo).slice(0, 200)}`);
  }

  let cuerpo: { ok?: unknown; error?: unknown; data?: unknown };
  try {
    cuerpo = JSON.parse(crudo) as typeof cuerpo;
  } catch {
    return falla(`la respuesta no es JSON: ${redactar(crudo).slice(0, 200)}`);
  }

  if (prueba.espera.clase === 'ERROR') {
    if (cuerpo.ok !== false) return falla(`esperaba ok:false y llegó ok:${String(cuerpo.ok)}`);
    if (cuerpo.error !== prueba.espera.codigo) {
      return falla(`esperaba ${prueba.espera.codigo} y llegó ${String(cuerpo.error)}`);
    }
    return { ...base, veredicto: 'PASA', detalle: `ok:false · ${prueba.espera.codigo}` };
  }

  if (cuerpo.ok !== true) {
    // El código sí se enseña: aquí el fallo es nuestro, no de quien llama, y sin
    // el código no hay por dónde empezar a mirar.
    return falla(`esperaba ok:true y llegó ok:${String(cuerpo.ok)} · ${String(cuerpo.error ?? '')}`);
  }

  if (prueba.espera.clase === 'OK_SIN_FUGAS') {
    const fugas = fugasEn(crudo);
    if (fugas.length > 0) {
      return falla(`la respuesta anónima contiene ${fugas.join(' y ')}`);
    }
    return { ...base, veredicto: 'PASA', detalle: `ok:true · sin fugas · ${redactar(crudo)}` };
  }

  return { ...base, veredicto: 'PASA', detalle: 'ok:true' };
}

/** Cuántas pasaron, y qué criterios quedan sin cerrar. */
export function resumen(resultados: readonly Resultado[]): {
  pasan: number;
  fallan: number;
  criteriosAbiertos: number[];
} {
  const abiertos: number[] = [];
  let pasan = 0;

  for (const r of resultados) {
    if (r.veredicto === 'PASA') pasan++;
    else if (abiertos.indexOf(r.criterio) === -1) abiertos.push(r.criterio);
  }

  return { pasan, fallan: resultados.length - pasan, criteriosAbiertos: abiertos.sort() };
}
