/**
 * Origen de los datos: REAL o DEMO — Paté · Salud Familiar (A6-F3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta ahora, que el modo demostración no sincronizara con Google era una
 * CASUALIDAD: no había token, así que las llamadas fallaban. Nada en el código
 * lo impedía. Este módulo convierte esa protección en estructural.
 *
 * El origen se marca dentro del propio estado guardado y de cada exportación,
 * de modo que un respaldo ficticio no pueda entrar en un expediente real ni
 * al revés.
 *
 * ANTE LA DUDA, REAL
 * ──────────────────
 * Un origen ausente, desconocido o corrupto se trata como REAL. Equivocarse
 * hacia REAL cierra puertas; equivocarse hacia DEMO las abre.
 */

export type OrigenDatos = 'REAL' | 'DEMO';

/** Clave de estado de la sesión demo. */
export const CLAVE_ESTADO_DEMO = 'pate-salud-state:demo';

/** Aviso incrustado en toda exportación de datos ficticios. */
export const AVISO_DEMO =
  'DATOS DE DEMOSTRACIÓN — información ficticia, no corresponde a ninguna persona real';

// ─────────────────────────────────────────────────────────────────────────────
// Origen de la sesión
// ─────────────────────────────────────────────────────────────────────────────

/** Solo una sesión de Google es REAL. Cualquier otra cosa es demostración. */
export function origenDe(user: { provider?: string | null } | null | undefined): OrigenDatos {
  return user?.provider === 'google' ? 'REAL' : 'DEMO';
}

export function esDemo(user: { provider?: string | null } | null | undefined): boolean {
  return origenDe(user) === 'DEMO';
}

// ─────────────────────────────────────────────────────────────────────────────
// Origen de un estado guardado o de un respaldo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deduce el origen de un estado guardado.
 *
 * · Si trae `origen` válido, se respeta.
 * · Si no lo trae —respaldo de una versión anterior— se infiere de la CLAVE,
 *   nunca del contenido: adivinar por los datos sería una heurística frágil
 *   sobre información clínica.
 * · Devuelve `null` cuando no hay forma de saberlo, para que quien llama
 *   decida en lugar de recibir una suposición disfrazada de dato.
 */
export function origenDeEstado(
  estado: unknown,
  claveOrigen?: string | null,
): OrigenDatos | null {
  if (estado && typeof estado === 'object') {
    const o = (estado as { origen?: unknown }).origen;
    if (o === 'REAL' || o === 'DEMO') return o;
  }
  if (claveOrigen === CLAVE_ESTADO_DEMO) return 'DEMO';
  if (claveOrigen && claveOrigen.startsWith('pate-salud-state:')) return 'REAL';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportaciones
// ─────────────────────────────────────────────────────────────────────────────

/** `DEMO_pate_salud_expediente_familiar_2026-09-07.json` para datos ficticios. */
export function nombreExportacion(origen: OrigenDatos, fecha: Date): string {
  const iso = fecha.toISOString().split('T')[0];
  const base = `pate_salud_expediente_familiar_${iso}.json`;
  return origen === 'DEMO' ? `DEMO_${base}` : base;
}

/**
 * Envuelve el estado exportado con su marca de origen.
 * No muta el objeto recibido: devuelve uno nuevo.
 */
export function sobreExportacion<T extends object>(
  origen: OrigenDatos,
  estado: T,
): T & { _aviso?: string; origen: OrigenDatos } {
  return origen === 'DEMO'
    ? { _aviso: AVISO_DEMO, origen, ...estado }
    : { origen, ...estado };
}

// ─────────────────────────────────────────────────────────────────────────────
// Importaciones
// ─────────────────────────────────────────────────────────────────────────────

export type CodigoRechazo = 'DEMO_EN_REAL' | 'REAL_EN_DEMO' | 'SIN_ORIGEN';

export type ResultadoImportacion =
  | { ok: true }
  | { ok: false; codigo: CodigoRechazo };

/**
 * Un respaldo ficticio no entra en un expediente real, ni al revés.
 *
 * Un respaldo sin origen —de una versión anterior— no se rechaza ni se acepta
 * en silencio: devuelve `SIN_ORIGEN` para que la interfaz pida confirmación
 * explícita al usuario.
 */
export function validarImportacion(
  sesion: OrigenDatos,
  respaldo: OrigenDatos | null,
): ResultadoImportacion {
  if (respaldo === null) return { ok: false, codigo: 'SIN_ORIGEN' };
  if (sesion === respaldo) return { ok: true };
  return {
    ok: false,
    codigo: respaldo === 'DEMO' ? 'DEMO_EN_REAL' : 'REAL_EN_DEMO',
  };
}

/** Texto para el usuario. Nunca incluye contenido del respaldo. */
export function mensajeRechazo(codigo: CodigoRechazo): { titulo: string; descripcion: string } {
  switch (codigo) {
    case 'DEMO_EN_REAL':
      return {
        titulo: 'Este respaldo es de datos de demostración',
        descripcion:
          'El archivo que elegiste contiene información ficticia del modo demostración y no puede importarse en tu expediente real. Elige un respaldo exportado desde tu cuenta.',
      };
    case 'REAL_EN_DEMO':
      return {
        titulo: 'Este respaldo contiene datos reales',
        descripcion:
          'No se puede importar un expediente real dentro del modo demostración. Inicia sesión con tu cuenta de Google para restaurarlo.',
      };
    case 'SIN_ORIGEN':
      return {
        titulo: 'Este respaldo es de una versión anterior',
        descripcion:
          'El archivo no indica si contiene datos reales o de demostración. Confirma que corresponde a esta sesión antes de restaurarlo.',
      };
  }
}
