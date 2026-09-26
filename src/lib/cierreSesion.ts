/**
 * Máquina de estados del cierre de sesión — Paté · Salud Familiar (A6-F2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Función pura, sin React y sin efectos, para que las reglas que protegen los
 * cambios sin sincronizar se puedan probar de forma exhaustiva.
 *
 * Dos invariantes que sostienen todo lo demás:
 *
 *   · `purgando` es ABSORBENTE. Una vez iniciada la purga, ninguna acción la
 *     saca de ahí. Es lo que impide un segundo cierre, un segundo diálogo o
 *     una segunda purga por doble clic.
 *
 *   · Desde `pendientes` NO se llega a `purgando` en un solo paso. Descartar
 *     cambios sin sincronizar exige pasar por `confirmar_descarte`.
 */

export type FaseCierre =
  | 'inactivo'
  | 'sincronizando'
  | 'pendientes'
  | 'confirmar_descarte'
  | 'purgando';

export type EstadoCierre =
  | { fase: 'inactivo' }
  /** Hay una sincronización remota en curso: no se puede purgar ni cancelarla. */
  | { fase: 'sincronizando'; pendientes: number }
  /** Hay cambios guardados solo en este dispositivo. */
  | { fase: 'pendientes'; pendientes: number; error?: string }
  /** Segunda confirmación antes de descartar cambios de forma irreversible. */
  | { fase: 'confirmar_descarte'; pendientes: number }
  /** Purga en marcha. Estado terminal. */
  | { fase: 'purgando' };

export type AccionCierre =
  | { tipo: 'solicitar'; sincronizando: boolean; pendientes: number }
  | { tipo: 'sync_finalizada'; pendientes: number }
  | { tipo: 'reintento_ok' }
  | { tipo: 'reintento_fallido'; error: string }
  | { tipo: 'pedir_descarte' }
  | { tipo: 'confirmar_descarte' }
  | { tipo: 'cancelar' };

export const ESTADO_CIERRE_INICIAL: EstadoCierre = { fase: 'inactivo' };

/** `true` mientras el diálogo deba estar visible. */
export function dialogoVisible(e: EstadoCierre): boolean {
  return e.fase !== 'inactivo';
}

/** `true` cuando no se admite ninguna interacción, ni siquiera Escape. */
export function estaOcupado(e: EstadoCierre): boolean {
  return e.fase === 'purgando';
}

export function reducirCierre(estado: EstadoCierre, accion: AccionCierre): EstadoCierre {
  // Invariante 1: `purgando` es absorbente.
  if (estado.fase === 'purgando') return estado;

  switch (accion.tipo) {
    case 'solicitar': {
      // Invariante 2: solicitar solo hace algo desde reposo. Un segundo clic
      // mientras el diálogo está abierto no reinicia el flujo.
      if (estado.fase !== 'inactivo') return estado;
      if (accion.sincronizando) {
        return { fase: 'sincronizando', pendientes: accion.pendientes };
      }
      if (accion.pendientes > 0) {
        return { fase: 'pendientes', pendientes: accion.pendientes };
      }
      return { fase: 'purgando' };
    }

    case 'sync_finalizada': {
      if (estado.fase !== 'sincronizando') return estado;
      // Si la sincronización dejó todo enviado, el cierre continúa solo.
      if (accion.pendientes === 0) return { fase: 'purgando' };
      return { fase: 'pendientes', pendientes: accion.pendientes };
    }

    case 'reintento_ok': {
      if (estado.fase !== 'pendientes') return estado;
      return { fase: 'purgando' };
    }

    case 'reintento_fallido': {
      if (estado.fase !== 'pendientes') return estado;
      // No se purga ni se cierra sesión: los cambios siguen a salvo.
      return { fase: 'pendientes', pendientes: estado.pendientes, error: accion.error };
    }

    case 'pedir_descarte': {
      if (estado.fase !== 'pendientes') return estado;
      return { fase: 'confirmar_descarte', pendientes: estado.pendientes };
    }

    case 'confirmar_descarte': {
      // Solo desde la segunda pantalla. Nunca en un solo paso.
      if (estado.fase !== 'confirmar_descarte') return estado;
      return { fase: 'purgando' };
    }

    case 'cancelar':
      return { fase: 'inactivo' };

    default:
      return estado;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque H · quién puede borrar la cola de cambios sin enviar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Por qué se cierra la sesión con purga. Cada motivo decide, explícitamente,
 * si la cola de cambios sin enviar se va con el resto.
 */
export const MOTIVOS_CIERRE = ['DIALOGO', 'BLOQUEO_8H'] as const;
export type MotivoCierre = (typeof MOTIVOS_CIERRE)[number];

const DESCARTA_COLA: Record<MotivoCierre, boolean> = {
  // A `purgando` solo se llega sin pendientes, o tras «Salir y descartar» y su
  // segunda confirmación. Alguien lo ha decidido.
  DIALOGO: true,
  // La pestaña se quedó bloqueada 8 horas y se cierra sola. Nadie ha
  // confirmado nada: borrar lo que no salió sería perderlo sin decisión. El
  // resto del expediente sí se purga.
  BLOQUEO_8H: false,
};

export function descartaCola(motivo: MotivoCierre): boolean {
  return DESCARTA_COLA[motivo];
}
