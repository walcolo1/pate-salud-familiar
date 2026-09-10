/**
 * Vacunación de mascotas — Paté · Salud Familiar (Bloque D, D3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El estado de una vacuna **no se guarda**: se calcula a partir de dos fechas,
 * la de aplicación y la del refuerzo. Guardarlo obligaría a mantenerlo al día
 * con un temporizador, y un estado guardado que nadie refresca miente en
 * cuanto pasa la medianoche.
 *
 * De aquí salen tres cosas y las tres dicen lo mismo:
 *
 *   · lo que enseña la lista de vacunas,
 *   · el evento que aparece en la agenda unificada (C3.1),
 *   · el aviso local que se programa (C3.2).
 *
 * Una sola fuente para que no puedan contradecirse.
 */

import type { VaccineEntry } from '../domain/mascotas';
import { hoyLocal } from '../domain/mascotas';

/** A partir de aquí el refuerzo se considera «próximo». */
export const VENTANA_PROXIMA_DIAS = 30;

export type EstadoVacuna =
  /** No se pactó refuerzo: no hay nada que vigilar. */
  | 'sin-refuerzo'
  /** Hay refuerzo, pero queda lejos. */
  | 'al-dia'
  /** El refuerzo entra dentro de la ventana. */
  | 'proxima'
  /** La fecha del refuerzo ya pasó. */
  | 'vencida';

export interface EstadoVacunaCalculado {
  estado: EstadoVacuna;
  /** Días hasta el refuerzo; negativo si ya pasó. `null` sin refuerzo. */
  dias: number | null;
  /** Frase lista para enseñar. No depende del color. */
  mensaje: string;
}

/** Días entre dos fechas `YYYY-MM-DD`, en hora local. */
export function diasEntre(desde: string, hasta: string): number | null {
  const partes = (t: string) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(t ?? '');
  const a = partes(desde);
  const b = partes(hasta);
  if (!a || !b) return null;
  // A mediodía: así ningún cambio de horario mueve la cuenta un día.
  const fa = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 12);
  const fb = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]), 12);
  return Math.round((fb.getTime() - fa.getTime()) / 86_400_000);
}

/** `2026-03-10` → `10 de marzo de 2026`. */
export function fechaLarga(fecha: string): string {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  if (!m) return fecha ?? '';
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function estadoDeVacuna(
  vacuna: Pick<VaccineEntry, 'proximaDosis'>,
  ahora: Date = new Date(),
): EstadoVacunaCalculado {
  const hoy = hoyLocal(ahora);
  const proxima = vacuna.proximaDosis;

  if (!proxima) {
    return {
      estado: 'sin-refuerzo',
      dias: null,
      mensaje: 'Sin refuerzo pactado.',
    };
  }

  const dias = diasEntre(hoy, proxima);
  if (dias === null) {
    // Una fecha ilegible no se convierte en «al día»: eso daría por buena una
    // vacuna que nadie ha comprobado.
    return { estado: 'sin-refuerzo', dias: null, mensaje: 'La fecha del refuerzo no se entiende.' };
  }

  if (dias < 0) {
    const atraso = Math.abs(dias);
    return {
      estado: 'vencida',
      dias,
      mensaje: `Vencida desde hace ${atraso} ${plural(atraso, 'día', 'días')} (${fechaLarga(proxima)}).`,
    };
  }

  if (dias <= VENTANA_PROXIMA_DIAS) {
    return {
      estado: 'proxima',
      dias,
      mensaje:
        dias === 0
          ? `El refuerzo toca hoy (${fechaLarga(proxima)}).`
          : `Próxima el ${fechaLarga(proxima)}, en ${dias} ${plural(dias, 'día', 'días')}.`,
    };
  }

  return {
    estado: 'al-dia',
    dias,
    mensaje: `Al día. Próximo refuerzo el ${fechaLarga(proxima)}.`,
  };
}

/** Las vacunas vivas de una mascota, de la más reciente a la más antigua. */
export function vacunasDe(vacunas: VaccineEntry[], petId: string): VaccineEntry[] {
  return (vacunas ?? [])
    .filter((v) => v.petId === petId && !v.deletedAt)
    .sort((a, b) => (a.fecha === b.fecha ? b.id.localeCompare(a.id) : a.fecha < b.fecha ? 1 : -1));
}

/**
 * Las que requieren atención: vencidas primero, luego las próximas.
 *
 * Sirve tanto para la insignia de la ficha como para decidir qué se programa
 * como aviso.
 */
export function vacunasPendientes(
  vacunas: VaccineEntry[],
  ahora: Date = new Date(),
): Array<{ vacuna: VaccineEntry; estado: EstadoVacunaCalculado }> {
  return (vacunas ?? [])
    .filter((v) => !v.deletedAt && v.proximaDosis)
    .map((vacuna) => ({ vacuna, estado: estadoDeVacuna(vacuna, ahora) }))
    .filter(({ estado }) => estado.estado === 'vencida' || estado.estado === 'proxima')
    .sort((a, b) => (a.estado.dias ?? 0) - (b.estado.dias ?? 0));
}
