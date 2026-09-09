/**
 * Avisos locales — Paté · Salud Familiar (C3.2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * NADA DE ESTO SALE DEL DISPOSITIVO
 * ─────────────────────────────────
 * Son notificaciones **locales**: las dibuja el propio navegador a partir de
 * datos que ya están en este equipo. No hay servidor de push, ni claves VAPID,
 * ni un tercero al que se le cuente que alguien toma un medicamento a las
 * ocho. Es la única forma compatible con la regla del proyecto —cuentas
 * personales, sin backend propio— y además la única que no crea un lugar nuevo
 * donde pueda filtrarse PHI.
 *
 * EL TEXTO NO LLEVA DATOS CLÍNICOS. NUNCA.
 * ────────────────────────────────────────
 * Una notificación se dibuja sobre la pantalla bloqueada, delante de quien
 * tenga el móvil a la vista. Así que dice «Es hora de una toma», no qué
 * medicamento ni de quién. El detalle está dentro de la aplicación, detrás del
 * bloqueo de sesión de A6-F3. `PROHIBIDO_EN_AVISOS` fija esa frontera y hay
 * pruebas que la vigilan.
 *
 * HASTA DÓNDE LLEGA ESTO, DE VERDAD
 * ─────────────────────────────────
 * Un aviso programado se dispara mientras la aplicación esté viva. Programar
 * uno para que suene con la aplicación CERRADA exigiría una de estas tres, y
 * ninguna está disponible aquí:
 *
 *   · `TimestampTrigger` (Notification Triggers): fue una prueba de origen de
 *     Chrome y nunca llegó a versión estable. Se detecta y se usa si algún día
 *     aparece, pero hoy no está en ningún navegador de escritorio ni móvil.
 *   · Web Push: necesita un servidor con claves VAPID. El proyecto no tiene
 *     backend propio y meter uno solo para esto contradice el Bloque E.
 *   · Periodic Background Sync: solo Chromium, con la PWA instalada, y el
 *     navegador decide cuándo; el mínimo real ronda las doce horas. Para una
 *     toma a las 08:00 no sirve.
 *
 * Está documentado en `docs/TESTING.md` como limitación conocida, y la
 * interfaz lo dice en voz alta en vez de prometer algo que no cumple.
 */

export type TipoAviso = 'medicacion' | 'cita' | 'control' | 'otro';

/** Cuánto se adelanta el aviso al evento. */
export const ANTELACION_MS = 0;

/** Solo se programa lo que cae dentro de esta ventana. */
export const HORIZONTE_MS = 24 * 60 * 60 * 1000;

/**
 * Texto de cada tipo. Genérico a propósito: se lee en la pantalla bloqueada.
 *
 * Si algún día alguien quiere personalizarlo, que se estrelle contra las
 * pruebas antes que contra la pantalla de alguien en un autobús.
 */
export const TITULO_AVISO = 'Paté · Salud Familiar';

export const CUERPO_AVISO: Record<TipoAviso, string> = {
  medicacion: 'Es hora de una toma de medicamento.',
  cita: 'Tienes una cita médica próxima.',
  control: 'Tienes un control de salud programado.',
  otro: 'Tienes un recordatorio pendiente.',
};

/**
 * Lo que jamás puede aparecer en el cuerpo de un aviso.
 *
 * No es una lista de palabras malas: es la forma de comprobar en una prueba
 * que el texto es una plantilla fija y no una interpolación de datos.
 */
export const PROHIBIDO_EN_AVISOS = ['${', '{{', 'nombre', 'paciente', 'mg', 'dr.', 'dra.'];

export interface AvisoProgramable {
  /** Estable entre ejecuciones: permite cancelar el aviso de un recordatorio. */
  id: string;
  /** Momento en el que debe sonar, en milisegundos desde la época. */
  cuandoMs: number;
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  /** A dónde lleva el clic. Nunca a una ficha concreta: eso identificaría. */
  url: string;
}

/** Lo mínimo que necesita un recordatorio para convertirse en aviso. */
export interface RecordatorioProgramable {
  id: string;
  /** `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm`. */
  cuando: string;
  tipo: TipoAviso;
  /** Si ya está resuelto no se programa nada. */
  resuelto: boolean;
}

/** `YYYY-MM-DD[THH:mm]` → milisegundos en hora local. */
export function aMilisegundos(cuando: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(cuando ?? '');
  if (!m) return null;
  const [, anio, mes, dia, h, min] = m;
  const hora = Number(h ?? 9);
  const minuto = Number(min ?? 0);
  if (hora > 23 || minuto > 59) return null;

  // Construido en hora local a propósito: `new Date('YYYY-MM-DD')` es UTC y
  // adelantaría o atrasaría el aviso tantas horas como diga la zona.
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia), hora, minuto, 0, 0);

  // `Date` NO valida: el mes 13 rueda a enero del año siguiente y el día 40 se
  // convierte en el 9 del mes que viene. Sin esta comprobación, «2026-13-40»
  // sería un momento perfectamente válido, y el aviso sonaría un día
  // cualquiera. Si lo construido no coincide con lo escrito, no era una fecha.
  const coincide =
    fecha.getFullYear() === Number(anio) &&
    fecha.getMonth() === Number(mes) - 1 &&
    fecha.getDate() === Number(dia);
  if (!coincide) return null;

  const t = fecha.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Convierte recordatorios en avisos programables.
 *
 * Deja fuera lo resuelto, lo que ya pasó y lo que cae más allá del horizonte:
 * programar un temporizador para dentro de tres semanas es pedirle al
 * navegador algo que no va a cumplir.
 */
export function construirAvisos(
  recordatorios: RecordatorioProgramable[],
  ahoraMs: number,
  horizonteMs: number = HORIZONTE_MS,
): AvisoProgramable[] {
  const salida: AvisoProgramable[] = [];

  for (const r of recordatorios ?? []) {
    if (r.resuelto) continue;
    const t = aMilisegundos(r.cuando);
    if (t === null) continue;

    const cuandoMs = t - ANTELACION_MS;
    if (cuandoMs <= ahoraMs) continue;
    if (cuandoMs - ahoraMs > horizonteMs) continue;

    salida.push({
      id: r.id,
      cuandoMs,
      tipo: r.tipo,
      titulo: TITULO_AVISO,
      cuerpo: CUERPO_AVISO[r.tipo] ?? CUERPO_AVISO.otro,
      url: '/reminders',
    });
  }

  return salida.sort((a, b) => a.cuandoMs - b.cuandoMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Programador
// ─────────────────────────────────────────────────────────────────────────────

export interface RelojLike {
  ahora: () => number;
  programar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
}

/**
 * Mantiene vivos los temporizadores de los avisos pendientes.
 *
 * `sincronizar` es idempotente: se le pasa la lista completa de avisos que
 * deberían existir y él añade los que falten y cancela los que sobren. Así,
 * marcar un recordatorio como hecho es simplemente volver a llamarlo con la
 * lista nueva, sin llevar la cuenta de qué cambió.
 */
export class ProgramadorAvisos {
  private timers = new Map<string, unknown>();

  constructor(
    private reloj: RelojLike,
    private mostrar: (aviso: AvisoProgramable) => void,
  ) {}

  sincronizar(avisos: AvisoProgramable[]): void {
    const deseados = new Set(avisos.map((a) => a.id));

    // Lo que ya no toca: se cancela.
    for (const [id, timer] of this.timers) {
      if (!deseados.has(id)) {
        this.reloj.cancelar(timer);
        this.timers.delete(id);
      }
    }

    // Lo nuevo: se programa. Lo que ya estaba se deja en paz, para no
    // reiniciar la cuenta atrás en cada repintado de React.
    for (const aviso of avisos) {
      if (this.timers.has(aviso.id)) continue;
      const espera = Math.max(0, aviso.cuandoMs - this.reloj.ahora());
      const timer = this.reloj.programar(() => {
        this.timers.delete(aviso.id);
        this.mostrar(aviso);
      }, espera);
      this.timers.set(aviso.id, timer);
    }
  }

  /** Cuántos avisos están armados ahora mismo. */
  get programados(): number {
    return this.timers.size;
  }

  /** Identificadores armados, para poder comprobarlo desde una prueba. */
  get ids(): string[] {
    return [...this.timers.keys()];
  }

  cancelarTodo(): void {
    for (const timer of this.timers.values()) this.reloj.cancelar(timer);
    this.timers.clear();
  }
}
