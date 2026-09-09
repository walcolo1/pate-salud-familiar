/**
 * Pauta de medicación — Paté · Salud Familiar (C3.4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Genera las tomas de un tratamiento a partir de su pauta. Estaba dentro de
 * `AppContext`, mezclado con la sesión y los metadatos de sincronización, y
 * por tanto sin una sola prueba. Aquí es una función pura, y eso deja a la
 * vista tres cosas que allí no se veían:
 *
 * **1 · No había tope.** Un tratamiento de un año cada cuatro horas genera
 * 2.190 tomas, y cada una es un registro en el expediente. Ahora hay un máximo
 * y, sobre todo, una forma de saber ANTES de guardar cuántas van a salir.
 *
 * **2 · Los identificadores chocaban.** Se construían con
 * `dose-${Date.now()}-${random(1e6)}`, y dentro de un mismo bucle `Date.now()`
 * no cambia: la unicidad quedaba en manos del azar. Con 2.190 tomas la
 * probabilidad de que dos compartieran identificador supera el 90 % —la
 * paradoja del cumpleaños—, y dos tomas con el mismo id en un expediente
 * clínico significa que marcar una como tomada marca la otra. Ahora el
 * identificador es determinista: pauta más índice.
 *
 * **3 · Reprogramar destruía lo ya ocurrido.** Cambiar la pauta obligaba a
 * regenerar, y regenerar borraba las tomas anteriores, incluidas las que ya
 * estaban tomadas o falladas. `reprogramarDosis` conserva todo lo que ya pasó
 * y solo sustituye lo que aún no ha llegado.
 *
 * TODO EN HORA LOCAL
 * ──────────────────
 * Las horas se construyen con `new Date(año, mes, día, hora, minuto)`. Nada de
 * `new Date('YYYY-MM-DD')`, que es medianoche UTC y desplaza la primera toma
 * del día al día anterior en cualquier zona al oeste de Greenwich.
 */

import type { MedicationDoseReminder, MedicationPrescription } from '../domain/models';

/**
 * Máximo de tomas que se generan para un tratamiento.
 *
 * 400 cubre de sobra lo razonable —seis meses cada 12 horas son 366— y corta
 * antes de que el expediente se llene de miles de registros que nadie va a
 * mirar. Al llegar al tope se avisa: no se recorta en silencio.
 */
export const MAXIMO_DOSIS = 400;

/** A partir de aquí la interfaz avisa antes de guardar. */
export const AVISO_DESDE_DOSIS = 60;

export interface Pauta {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  frequencyType: MedicationPrescription['frequencyType'];
  frequencyIntervalHours?: number | null;
  specificTimes?: string[] | null;
}

/** Horas por defecto de cada frecuencia con nombre. */
export const HORAS_POR_FRECUENCIA: Record<string, string[]> = {
  ONCE_DAILY: ['08:00'],
  TWICE_DAILY: ['08:00', '20:00'],
  THREE_TIMES_DAILY: ['08:00', '14:00', '20:00'],
  FOUR_TIMES_DAILY: ['06:00', '12:00', '18:00', '00:00'],
};

const dd = (n: number) => String(n).padStart(2, '0');

/** `Date` local → `YYYY-MM-DDTHH:mm`, sin pasar por UTC. */
export function aMarcaLocal(d: Date): string {
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

function fechaLocal(texto: string, hora = 0, minuto = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? '');
  if (!m) return null;
  const [, a, mes, d] = m;
  const f = new Date(Number(a), Number(mes) - 1, Number(d), hora, minuto, 0, 0);
  const valida =
    f.getFullYear() === Number(a) && f.getMonth() === Number(mes) - 1 && f.getDate() === Number(d);
  return valida ? f : null;
}

export interface CalendarioPauta {
  /** Momentos de cada toma, en orden y en hora local. */
  momentos: string[];
  /** Cuántas habría salido sin tope. */
  totalSinTope: number;
  /** `true` si se recortó por llegar al máximo. */
  truncado: boolean;
}

/**
 * Calcula los momentos de una pauta.
 *
 * Devuelve el recuento real y el que habría salido sin tope, para que quien lo
 * enseñe pueda decir la verdad completa: «son 2.190, se van a crear 400».
 */
export function calcularMomentos(pauta: Pauta, maximo: number = MAXIMO_DOSIS): CalendarioPauta {
  const inicio = fechaLocal(pauta.startDate, 0, 0);
  const fin = fechaLocal(pauta.endDate, 23, 59);
  if (!inicio || !fin || fin.getTime() < inicio.getTime()) {
    return { momentos: [], totalSinTope: 0, truncado: false };
  }

  const momentos: string[] = [];
  let totalSinTope = 0;
  const anotar = (d: Date) => {
    totalSinTope++;
    if (momentos.length < maximo) momentos.push(aMarcaLocal(d));
  };

  if (pauta.frequencyType === 'EVERY_X_HOURS' && pauta.frequencyIntervalHours) {
    const horas = Math.max(1, Math.floor(pauta.frequencyIntervalHours));
    // La primera toma es a las 08:00 del día de inicio, no a medianoche:
    // arrancar un tratamiento a las 00:00 es un despertador, no una pauta.
    const primera = fechaLocal(pauta.startDate, 8, 0);
    if (!primera) return { momentos: [], totalSinTope: 0, truncado: false };
    for (let t = primera.getTime(); t <= fin.getTime(); t += horas * 3600_000) {
      anotar(new Date(t));
      // Sin este freno, un intervalo absurdo podría girar sin fin.
      if (totalSinTope > maximo * 20) break;
    }
  } else {
    const horas =
      pauta.frequencyType === 'SPECIFIC_TIMES'
        ? [...(pauta.specificTimes ?? [])].filter((h) => /^\d{2}:\d{2}$/.test(h)).sort()
        : (HORAS_POR_FRECUENCIA[pauta.frequencyType as string] ?? ['08:00']);

    if (horas.length === 0) return { momentos: [], totalSinTope: 0, truncado: false };

    const dia = new Date(inicio);
    while (dia.getTime() <= fin.getTime()) {
      for (const h of horas) {
        const [hh, mm] = h.split(':').map(Number);
        const momento = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hh, mm, 0, 0);
        if (momento.getTime() >= inicio.getTime() && momento.getTime() <= fin.getTime()) {
          anotar(momento);
        }
      }
      dia.setDate(dia.getDate() + 1);
      if (totalSinTope > maximo * 20) break;
    }
  }

  momentos.sort();
  return { momentos, totalSinTope, truncado: totalSinTope > momentos.length };
}

/** Cuántas tomas saldrían. Para avisar ANTES de guardar. */
export function estimarDosis(pauta: Pauta, maximo: number = MAXIMO_DOSIS): CalendarioPauta {
  return calcularMomentos(pauta, maximo);
}

/** Datos que no dependen de la pauta pero acompañan a cada toma. */
export interface ContextoDosis {
  prescriptionId: string;
  memberId: string;
  medicationName: string;
  dose: string;
  creadoEn: string;
  syncStatus?: MedicationDoseReminder['syncStatus'];
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
}

/**
 * Identificador determinista.
 *
 * Mismo tratamiento y mismo índice, mismo id. Eso hace que regenerar sea
 * idempotente y elimina de raíz las colisiones del azar.
 */
export const idDeDosis = (prescriptionId: string, indice: number) =>
  `dose-${prescriptionId}-${String(indice).padStart(4, '0')}`;

export interface ResultadoGeneracion {
  dosis: MedicationDoseReminder[];
  totalSinTope: number;
  truncado: boolean;
}

export function generarDosis(
  pauta: Pauta,
  contexto: ContextoDosis,
  maximo: number = MAXIMO_DOSIS,
): ResultadoGeneracion {
  const { momentos, totalSinTope, truncado } = calcularMomentos(pauta, maximo);

  const dosis = momentos.map((scheduledAt, i) => ({
    id: idDeDosis(contexto.prescriptionId, i),
    prescriptionId: contexto.prescriptionId,
    memberId: contexto.memberId,
    medicationName: contexto.medicationName,
    dose: contexto.dose,
    scheduledAt,
    status: 'PENDING' as const,
    createdAt: contexto.creadoEn,
    updatedAt: contexto.creadoEn,
    syncStatus: contexto.syncStatus ?? null,
    ownerEmail: contexto.ownerEmail ?? null,
    ownerGoogleId: contexto.ownerGoogleId ?? null,
    sourceDeviceId: contexto.sourceDeviceId ?? null,
  }));

  return { dosis, totalSinTope, truncado };
}

export interface ResultadoReprogramacion extends ResultadoGeneracion {
  /** Tomas anteriores que se conservan porque ya forman parte del historial. */
  conservadas: MedicationDoseReminder[];
  /** Tomas futuras que se retiran para dejar sitio a la pauta nueva. */
  retiradas: number;
}

/**
 * Aplica una pauta nueva sin tocar lo que ya ocurrió.
 *
 * QUÉ SE CONSERVA, Y POR QUÉ
 * ──────────────────────────
 *   · Toda toma que **no** esté pendiente —tomada, fallada u omitida—: es el
 *     registro de lo que pasó de verdad y borrarlo falsifica el historial.
 *   · Toda toma pendiente que **ya venció**. Que nadie la marcara no la
 *     convierte en inexistente: borrarla haría desaparecer la prueba de que
 *     hubo una toma sin registrar, que es justo lo que un médico querría ver.
 *
 * Solo se sustituye lo que todavía no ha llegado.
 */
export function reprogramarDosis(
  pauta: Pauta,
  contexto: ContextoDosis,
  existentes: MedicationDoseReminder[],
  ahora: Date = new Date(),
  maximo: number = MAXIMO_DOSIS,
): ResultadoReprogramacion {
  const marcaAhora = aMarcaLocal(ahora);

  const vivas = (existentes ?? []).filter((d) => !d.deletedAt && d.prescriptionId === contexto.prescriptionId);
  const conservadas = vivas.filter((d) => d.status !== 'PENDING' || d.scheduledAt <= marcaAhora);
  const retiradas = vivas.length - conservadas.length;

  const yaOcupados = new Set(conservadas.map((d) => d.scheduledAt));
  const { momentos, totalSinTope, truncado } = calcularMomentos(pauta, maximo);

  // Solo lo que está por venir, y sin repetir un momento ya registrado.
  const nuevos = momentos.filter((m) => m > marcaAhora && !yaOcupados.has(m));

  // El índice arranca donde acaba lo conservado para no reutilizar un id que
  // ya pertenece a una toma del historial.
  const desplazamiento = conservadas.length;
  const dosis = nuevos.map((scheduledAt, i) => ({
    id: idDeDosis(contexto.prescriptionId, desplazamiento + i),
    prescriptionId: contexto.prescriptionId,
    memberId: contexto.memberId,
    medicationName: contexto.medicationName,
    dose: contexto.dose,
    scheduledAt,
    status: 'PENDING' as const,
    createdAt: contexto.creadoEn,
    updatedAt: contexto.creadoEn,
    syncStatus: contexto.syncStatus ?? null,
    ownerEmail: contexto.ownerEmail ?? null,
    ownerGoogleId: contexto.ownerGoogleId ?? null,
    sourceDeviceId: contexto.sourceDeviceId ?? null,
  }));

  return { dosis, conservadas, retiradas, totalSinTope, truncado };
}
