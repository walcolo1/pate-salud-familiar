/**
 * Agenda unificada — Paté · Salud Familiar (C3.1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TRES ORÍGENES QUE NO SE PARECÍAN EN NADA
 * ────────────────────────────────────────
 * Las citas, las dosis y los controles viven en tres estructuras que se
 * escribieron por separado y acabaron representando lo mismo de tres maneras:
 *
 *   · `MedicalAppointment.scheduledAt`   `YYYY-MM-DDTHH:mm`   HealthEventStatus
 *   · `MedicationDoseReminder.scheduledAt` `YYYY-MM-DDTHH:mm` DoseReminderStatus
 *   · `PeriodicCheckup.scheduledDate`    `YYYY-MM-DD`         HealthEventStatus
 *
 * Tres nombres de campo, dos granularidades y **dos catálogos de estado
 * incompatibles**: `COMPLETED` en unos, `TAKEN` en otros. Cualquier vista que
 * quiera enseñarlos juntos tiene que traducir, y si cada pantalla traduce por
 * su cuenta, cada pantalla se equivoca a su manera.
 *
 * Este módulo hace esa traducción una sola vez.
 *
 * POR QUÉ NADA DE `new Date('YYYY-MM-DD')`
 * ────────────────────────────────────────
 * Esa forma la interpreta el motor como **medianoche UTC**. En Colombia
 * (UTC-5) una cita del día 10 se dibuja en el día 9: el error clásico que
 * mueve media agenda un día hacia atrás y solo se nota en producción. Aquí las
 * fechas se manejan como texto `YYYY-MM-DD` y, cuando hace falta calcular, se
 * construyen con `new Date(año, mes, día)`, que es hora local.
 *
 * NADA DE ESTO TOCA GOOGLE
 * ────────────────────────
 * Es un módulo puro sobre datos que ya están en memoria. No hay peticiones, ni
 * a Calendar ni a nada: la sincronización con Google es del Bloque E.
 */

import type {
  MedicalAppointment,
  MedicationDoseReminder,
  PeriodicCheckup,
} from '../domain/models';
import type { Pet, VaccineEntry } from '../domain/mascotas';

export type TipoEvento = 'cita' | 'dosis' | 'control' | 'vacuna-mascota';

/** Estado común. Traduce los dos catálogos de origen a uno solo. */
export type EstadoEvento = 'pendiente' | 'hecho' | 'cancelado' | 'vencido';

/** Los que siguen requiriendo algo de alguien. */
export const ESTADOS_ABIERTOS: readonly EstadoEvento[] = ['pendiente', 'vencido'];

export interface EventoCalendario {
  /** `tipo:idOriginal`. Dos orígenes pueden repetir identificador. */
  id: string;
  tipo: TipoEvento;
  /** `YYYY-MM-DD`, siempre. */
  fecha: string;
  /** `HH:mm`, o `null` si el origen no guarda hora. */
  hora: string | null;
  estado: EstadoEvento;
  familiarId: string;
  familiarNombre: string;
  titulo: string;
  detalle: string | null;
  /** Lo propio de cada tipo: medicamento, especialidad, clase de control. */
  metadatos: Record<string, string | null>;
}

interface FamiliarMinimo {
  id: string;
  fullName: string;
}

/** Cualquier estructura con marca de borrado. */
type Borrable = { deletedAt?: string | null };

const nombreDe = (memberId: string, familiares: FamiliarMinimo[]): string =>
  familiares.find((f) => f.id === memberId)?.fullName ?? 'Familiar retirado';

/**
 * Parte `YYYY-MM-DDTHH:mm` en sus dos mitades sin pasar por `Date`.
 *
 * Convertir a `Date` y volver a texto es justo donde se cuela el desfase de
 * zona horaria. El texto ya viene en hora local: se corta y ya está.
 */
function partirMarca(marca: string | null | undefined): { fecha: string; hora: string | null } {
  if (!marca) return { fecha: '', hora: null };
  const [fecha, resto] = marca.split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) return { fecha: '', hora: null };
  const hora = resto?.slice(0, 5);
  return { fecha, hora: /^\d{2}:\d{2}$/.test(hora ?? '') ? hora : null };
}

/** `HealthEventStatus` → estado común. */
function estadoDeEventoClinico(status: string): EstadoEvento {
  switch (status) {
    case 'COMPLETED':
      return 'hecho';
    case 'CANCELLED':
      return 'cancelado';
    case 'OVERDUE':
      return 'vencido';
    default:
      return 'pendiente';
  }
}

/** `DoseReminderStatus` → estado común. Es OTRO catálogo. */
function estadoDeDosis(status: string): EstadoEvento {
  switch (status) {
    case 'TAKEN':
      return 'hecho';
    case 'MISSED':
      return 'vencido';
    case 'SKIPPED':
      return 'cancelado';
    default:
      return 'pendiente';
  }
}

export function normalizarCita(
  cita: MedicalAppointment,
  familiares: FamiliarMinimo[],
): EventoCalendario {
  const { fecha, hora } = partirMarca(cita.scheduledAt || `${cita.date ?? ''}T${cita.time ?? ''}`);
  return {
    id: `cita:${cita.id}`,
    tipo: 'cita',
    fecha,
    hora,
    estado: estadoDeEventoClinico(cita.status),
    familiarId: cita.memberId,
    familiarNombre: nombreDe(cita.memberId, familiares),
    titulo: cita.specialty || 'Cita médica',
    detalle: cita.doctorName || null,
    metadatos: {
      especialidad: cita.specialty || null,
      medico: cita.doctorName || null,
      lugar: cita.location ?? null,
      motivo: cita.reason || null,
    },
  };
}

export function normalizarDosis(
  dosis: MedicationDoseReminder,
  familiares: FamiliarMinimo[],
): EventoCalendario {
  const { fecha, hora } = partirMarca(dosis.scheduledAt);
  return {
    id: `dosis:${dosis.id}`,
    tipo: 'dosis',
    fecha,
    hora,
    estado: estadoDeDosis(dosis.status),
    familiarId: dosis.memberId,
    familiarNombre: nombreDe(dosis.memberId, familiares),
    titulo: dosis.medicationName || 'Toma de medicamento',
    detalle: dosis.dose || null,
    metadatos: {
      medicamento: dosis.medicationName || null,
      dosis: dosis.dose || null,
      prescripcionId: dosis.prescriptionId || null,
    },
  };
}

export function normalizarControl(
  control: PeriodicCheckup,
  familiares: FamiliarMinimo[],
): EventoCalendario {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(control.scheduledDate ?? '')
    ? control.scheduledDate
    : '';
  return {
    id: `control:${control.id}`,
    tipo: 'control',
    fecha,
    // Un control se guarda solo con día. Poner las 00:00 lo colocaría de
    // madrugada en cualquier vista por horas, que es peor que no decir nada.
    hora: null,
    estado: estadoDeEventoClinico(control.status),
    familiarId: control.memberId,
    familiarNombre: nombreDe(control.memberId, familiares),
    titulo: control.checkupType || 'Control periódico',
    detalle: control.doctorName ?? null,
    metadatos: {
      clase: control.checkupType || null,
      medico: control.doctorName ?? null,
    },
  };
}

/**
 * D3 · El refuerzo de una vacuna de mascota.
 *
 * El evento de agenda es la **próxima dosis**, no la ya aplicada: en una
 * agenda solo tiene sentido lo que está por venir. Las que no tienen refuerzo
 * pactado no producen ningún evento.
 *
 * El estado se traduce al MISMO catálogo que el resto —`pendiente` o
 * `vencido`— en vez de abrir un cuarto. Una agenda con cuatro vocabularios de
 * estado es una agenda que nadie puede filtrar.
 */
export function normalizarVacunaMascota(
  vacuna: VaccineEntry,
  mascotas: Pet[],
  familiares: FamiliarMinimo[],
  hoy: string,
): EventoCalendario | null {
  const fecha = vacuna.proximaDosis;
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const mascota = (mascotas ?? []).find((m) => m.id === vacuna.petId);

  return {
    id: `vacuna-mascota:${vacuna.id}`,
    tipo: 'vacuna-mascota',
    fecha,
    // Un refuerzo se pacta por día, no por hora.
    hora: null,
    estado: fecha < hoy ? 'vencido' : 'pendiente',
    familiarId: vacuna.memberId,
    familiarNombre: nombreDe(vacuna.memberId, familiares),
    titulo: vacuna.vacuna || 'Refuerzo de vacuna',
    detalle: mascota?.nombre ?? 'Mascota',
    metadatos: {
      mascota: mascota?.nombre ?? null,
      mascotaId: vacuna.petId,
      vacuna: vacuna.vacuna || null,
      laboratorio: vacuna.laboratorio ?? null,
    },
  };
}

const vivo = (x: Borrable) => !x.deletedAt;

export interface OrigenesAgenda {
  citas: MedicalAppointment[];
  dosis: MedicationDoseReminder[];
  controles: PeriodicCheckup[];
  /** D3 · Refuerzos de vacunas de mascotas. */
  vacunasMascota?: VaccineEntry[];
  /** Para poner nombre a la mascota de cada refuerzo. */
  mascotas?: Pet[];
}

/**
 * Reúne los tres orígenes, ya normalizados y ordenados.
 *
 * Lo borrado y lo que no tiene fecha válida se quedan fuera: colocar un evento
 * sin fecha en un día cualquiera es peor que no enseñarlo, porque parece un
 * dato y no lo es.
 */
export function construirAgenda(
  origenes: OrigenesAgenda,
  familiares: FamiliarMinimo[],
  hoy: string = aTexto(new Date()),
): EventoCalendario[] {
  const eventos = [
    ...(origenes.citas ?? []).filter(vivo).map((c) => normalizarCita(c, familiares)),
    ...(origenes.dosis ?? []).filter(vivo).map((d) => normalizarDosis(d, familiares)),
    ...(origenes.controles ?? []).filter(vivo).map((k) => normalizarControl(k, familiares)),
    ...(origenes.vacunasMascota ?? [])
      .filter(vivo)
      .map((v) => normalizarVacunaMascota(v, origenes.mascotas ?? [], familiares, hoy))
      .filter((e): e is EventoCalendario => e !== null),
  ].filter((e) => e.fecha !== '');

  return eventos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    // Sin hora va primero: es un evento del día entero.
    const ha = a.hora ?? '';
    const hb = b.hora ?? '';
    if (ha !== hb) return ha < hb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rangos de fechas
// ─────────────────────────────────────────────────────────────────────────────

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** `Date` local → `YYYY-MM-DD`. Nunca `toISOString`, que pasa por UTC. */
export function aTexto(d: Date): string {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** `YYYY-MM-DD` → `Date` local a mediodía, lejos de cualquier cambio de hora. */
export function aFecha(texto: string): Date {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export interface Rango {
  desde: string;
  hasta: string;
}

/** `mes` es el índice de `Date`: 0 = enero. */
export function rangoMes(anio: number, mes: number): Rango {
  return {
    desde: aTexto(new Date(anio, mes, 1)),
    // El día 0 del mes siguiente es el último del actual, bisiestos incluidos.
    hasta: aTexto(new Date(anio, mes + 1, 0)),
  };
}

/** La semana de lunes a domingo que contiene `dia`. */
export function rangoSemana(dia: string): Rango {
  const d = aFecha(dia);
  // getDay(): 0 = domingo. El lunes queda a 6 días de un domingo, no a -1.
  const desplazamiento = (d.getDay() + 6) % 7;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() - desplazamiento);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { desde: aTexto(lunes), hasta: aTexto(domingo) };
}

function diasEntre(rango: Rango): string[] {
  const salida: string[] = [];
  const fin = aFecha(rango.hasta);
  for (let d = aFecha(rango.desde); d <= fin; d.setDate(d.getDate() + 1)) {
    salida.push(aTexto(d));
  }
  return salida;
}

export const diasDelMes = (anio: number, mes: number): string[] => diasEntre(rangoMes(anio, mes));
export const diasDeLaSemana = (dia: string): string[] => diasEntre(rangoSemana(dia));

// ─────────────────────────────────────────────────────────────────────────────
// Filtros y agrupación
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltrosAgenda {
  familiarId?: string | null;
  tipos?: TipoEvento[] | null;
  estados?: EstadoEvento[] | null;
  desde?: string | null;
  hasta?: string | null;
}

/** Los extremos del rango entran. */
export function filtrarAgenda(
  eventos: EventoCalendario[],
  filtros: FiltrosAgenda,
): EventoCalendario[] {
  return eventos.filter((e) => {
    if (filtros.familiarId && e.familiarId !== filtros.familiarId) return false;
    if (filtros.tipos?.length && !filtros.tipos.includes(e.tipo)) return false;
    if (filtros.estados?.length && !filtros.estados.includes(e.estado)) return false;
    if (filtros.desde && e.fecha < filtros.desde) return false;
    if (filtros.hasta && e.fecha > filtros.hasta) return false;
    return true;
  });
}

/** `{ 'YYYY-MM-DD': eventos }`. Los días sin nada no aparecen. */
export function agruparPorDia(eventos: EventoCalendario[]): Record<string, EventoCalendario[]> {
  const mapa: Record<string, EventoCalendario[]> = {};
  for (const e of eventos) (mapa[e.fecha] ??= []).push(e);
  return mapa;
}
