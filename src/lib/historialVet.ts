/**
 * Historial clínico veterinario — Paté · Salud Familiar (Bloque D, D4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE Y QUÉ NO
 * ─────────────────
 * El historial es un **registro de lo que ya pasó**. No programa nada, no
 * entra en la agenda y no genera avisos. La agenda mira hacia delante —citas,
 * dosis, controles, refuerzos— y meter ahí una consulta de hace dos años solo
 * serviría para enterrar lo que está por venir. Por eso `TipoEvento` sigue
 * teniendo cuatro valores después de D4, y `CUERPO_AVISO` los mismos cinco.
 *
 * POR QUÉ AQUÍ Y NO EN LA PANTALLA
 * ────────────────────────────────
 * Ordenar, agrupar y contar son decisiones con reglas, y las reglas se
 * prueban. Una pantalla que ordena por su cuenta solo se puede comprobar
 * abriéndola.
 *
 * SOBRE LAS FECHAS ILEGIBLES
 * ──────────────────────────
 * `validarHistorialVet` no deja entrar una fecha mal formada por el
 * formulario, pero el formulario no es la única puerta: también entra por la
 * restauración de un respaldo. Una entrada con fecha ilegible **no se pierde
 * ni se inventa**: se agrupa aparte y se dice que no se entiende. Perder una
 * cirugía porque su fecha venía rota sería peor que enseñarla sin fecha.
 */

import {
  NOMBRE_TIPO_HISTORIAL,
  type MedicalHistoryEntry,
  type TipoHistorialVet,
} from '../domain/mascotas';
// El mismo formateador de fechas que usa la cartilla de vacunas. Duplicarlo
// sería tener dos que acaban escribiendo la fecha de dos maneras distintas.
import { fechaLarga } from './vacunasMascota';

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha que se puede ordenar y de la que se puede sacar el año. */
export const esFechaUtil = (v: unknown): v is string =>
  typeof v === 'string' && ES_FECHA.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Las entradas vivas de una mascota, de la más reciente a la más antigua.
 *
 * El desempate por `createdAt` no es un adorno: dos atenciones el mismo día
 * son corrientes —una urgencia y la consulta de seguimiento—, y sin desempate
 * el orden dependería de cómo llegara el array.
 */
export function historialDe(entradas: MedicalHistoryEntry[], petId: string): MedicalHistoryEntry[] {
  return (entradas ?? [])
    .filter((e) => e.petId === petId && !e.deletedAt)
    .sort((a, b) => {
      // Lo ilegible al final: no se puede afirmar cuándo ocurrió.
      const ua = esFechaUtil(a.fecha);
      const ub = esFechaUtil(b.fecha);
      if (ua !== ub) return ua ? -1 : 1;
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return (b.createdAt ?? '') < (a.createdAt ?? '') ? -1 : 1;
    });
}

export const FILTRO_TODOS = 'TODOS';
export type FiltroTipo = TipoHistorialVet | typeof FILTRO_TODOS;

export function filtrarPorTipo(
  entradas: MedicalHistoryEntry[],
  filtro: FiltroTipo,
): MedicalHistoryEntry[] {
  return filtro === FILTRO_TODOS ? entradas : entradas.filter((e) => e.tipo === filtro);
}

/** Un año del historial. `anio: null` recoge las entradas de fecha ilegible. */
export interface GrupoAnual {
  anio: number | null;
  /** Lo que se enseña como encabezado del grupo. */
  etiqueta: string;
  entradas: MedicalHistoryEntry[];
}

/**
 * Agrupa por año conservando el orden recibido.
 *
 * El año se saca de los cuatro primeros caracteres del texto, nunca de un
 * `Date`: `new Date('2026-01-01')` es medianoche UTC, que al oeste de
 * Greenwich cae en 2025.
 */
export function agruparPorAnio(entradas: MedicalHistoryEntry[]): GrupoAnual[] {
  const grupos: GrupoAnual[] = [];
  for (const entrada of entradas ?? []) {
    const anio = esFechaUtil(entrada.fecha) ? Number(entrada.fecha.slice(0, 4)) : null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.anio === anio) {
      ultimo.entradas.push(entrada);
      continue;
    }
    grupos.push({
      anio,
      etiqueta: anio === null ? 'Sin fecha reconocible' : String(anio),
      entradas: [entrada],
    });
  }
  return grupos;
}

export interface RecuentoTipo {
  tipo: TipoHistorialVet;
  nombre: string;
  total: number;
}

export interface ResumenHistorial {
  total: number;
  /** La atención más reciente con fecha utilizable, o `null`. */
  ultima: MedicalHistoryEntry | null;
  /** Solo los tipos presentes, de más frecuente a menos. */
  tipos: RecuentoTipo[];
}

export function resumenHistorial(entradas: MedicalHistoryEntry[]): ResumenHistorial {
  const vivas = (entradas ?? []).filter((e) => !e.deletedAt);

  const cuenta = new Map<TipoHistorialVet, number>();
  for (const e of vivas) cuenta.set(e.tipo, (cuenta.get(e.tipo) ?? 0) + 1);

  const tipos = [...cuenta.entries()]
    .map(([tipo, total]) => ({ tipo, nombre: NOMBRE_TIPO_HISTORIAL[tipo] ?? tipo, total }))
    // Empate resuelto por nombre para que el orden no dependa del recorrido.
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));

  // «La última» es la de fecha más reciente, no la que se apuntó al final:
  // se puede registrar hoy una consulta del mes pasado.
  const conFecha = vivas.filter((e) => esFechaUtil(e.fecha));
  const ultima =
    conFecha.length === 0
      ? null
      : conFecha.reduce((mejor, e) => (e.fecha > mejor.fecha ? e : mejor), conFecha[0]);

  return { total: vivas.length, ultima, tipos };
}

/** «Consulta · 3 de enero de 2026». Para leerlo de corrido. */
export function descripcionEntrada(entrada: MedicalHistoryEntry): string {
  const tipo = NOMBRE_TIPO_HISTORIAL[entrada.tipo] ?? 'Atención';
  return esFechaUtil(entrada.fecha)
    ? `${tipo} · ${fechaLarga(entrada.fecha)}`
    : `${tipo} · fecha no reconocible`;
}
