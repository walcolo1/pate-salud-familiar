/**
 * Módulos clínicos veterinarios (Bloque O).
 *
 * Todo puro y determinista: catálogo de vacunas por especie (esencial /
 * opcional), salud preventiva con su próxima aplicación, tratamientos con su
 * pauta de tomas y cumplimiento, gastos por categoría y mes, y el motor de
 * recordatorios. Nada de esto decide una pauta clínica: las frecuencias son
 * las habituales para proponer una fecha, y la persona las cambia.
 *
 * DÓNDE VIVE CADA COSA (pestañas existentes, `paciente_id = mascota`)
 * ──────────────────────────────────────────────────────────────────
 *   vacunas ............ VACUNAS        (tipo y certificado en `notas`)
 *   salud preventiva ... CONTROLES      (`tipo` = categoría; producto, dosis,
 *                                         vía y costo en `notas`)
 *   tratamientos ....... MEDICAMENTOS   (tipo, vía y efectos en `notas`)
 *   tomas .............. DOSIS          (solo las marcadas: la pauta se calcula)
 *   recordatorios ...... RECORDATORIOS  (solo completar / posponer: la lista
 *                                         se calcula de los datos)
 *   exámenes ........... EXAMENES + EXAMENES_RESULTADOS (Bloque N, MASCOTA)
 *   documentos ......... DOCUMENTOS
 */

import type { Especie } from './mascotas';

export type Sincronizable = {
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
};

// ─── Fechas ────────────────────────────────────────────────────────────────

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** Suma meses sin saltarse fin de mes: 31-ene + 1 mes = 28/29-feb. */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimo));
  return objetivo.toISOString().slice(0, 10);
}

export function diasHasta(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// ─── Vacunas por especie ───────────────────────────────────────────────────

export type TipoVacuna = 'CORE' | 'NO_CORE';
export const NOMBRE_TIPO_VACUNA: Record<TipoVacuna, string> = { CORE: 'Esencial (core)', NO_CORE: 'Opcional (no-core)' };

export interface VacunaCatalogo { nombre: string; tipo: TipoVacuna; refuerzoMeses: number }

/**
 * Catálogo de referencia (WSAVA 2024). El refuerzo es el habitual en adultos;
 * en cachorros la serie inicial es más corta y la decide el veterinario.
 */
export const CATALOGO_VACUNAS_MASCOTA: Partial<Record<Especie, VacunaCatalogo[]>> = {
  PERRO: [
    { nombre: 'Polivalente (DHPPi)', tipo: 'CORE', refuerzoMeses: 12 },
    { nombre: 'Rabia', tipo: 'CORE', refuerzoMeses: 12 },
    { nombre: 'Leptospirosis (L4)', tipo: 'NO_CORE', refuerzoMeses: 12 },
    { nombre: 'Tos de las perreras (Bordetella)', tipo: 'NO_CORE', refuerzoMeses: 12 },
    { nombre: 'Coronavirus canino', tipo: 'NO_CORE', refuerzoMeses: 12 },
    { nombre: 'Influenza canina', tipo: 'NO_CORE', refuerzoMeses: 12 },
  ],
  GATO: [
    { nombre: 'Triple felina (FVRCP)', tipo: 'CORE', refuerzoMeses: 12 },
    { nombre: 'Rabia', tipo: 'CORE', refuerzoMeses: 12 },
    { nombre: 'Leucemia felina (FeLV)', tipo: 'NO_CORE', refuerzoMeses: 12 },
    { nombre: 'Clamidiosis felina', tipo: 'NO_CORE', refuerzoMeses: 12 },
  ],
  CONEJO: [
    { nombre: 'Mixomatosis', tipo: 'CORE', refuerzoMeses: 12 },
    { nombre: 'Enfermedad hemorrágica vírica (RHDV1/2)', tipo: 'CORE', refuerzoMeses: 12 },
  ],
  AVE: [{ nombre: 'Polyomavirus aviar', tipo: 'NO_CORE', refuerzoMeses: 12 }],
};

export function vacunasDeEspecie(especie: Especie): VacunaCatalogo[] {
  return CATALOGO_VACUNAS_MASCOTA[especie] ?? [];
}

export function buscarVacunaCatalogo(especie: Especie, nombre: string): VacunaCatalogo | null {
  const n = nombre.trim().toLowerCase();
  return vacunasDeEspecie(especie).find((v) => v.nombre.toLowerCase() === n) ?? null;
}

/** Próxima dosis propuesta: fecha + refuerzo del catálogo, o null si no está. */
export function proximaDosisPropuesta(especie: Especie, nombre: string, fecha: string): string | null {
  const v = buscarVacunaCatalogo(especie, nombre);
  return v && esFecha(fecha) ? sumarMeses(fecha, v.refuerzoMeses) : null;
}

// ─── Salud preventiva y atenciones ─────────────────────────────────────────

export const CATEGORIAS_CUIDADO = [
  'DESPARASITACION_INTERNA',
  'ANTIPULGAS',
  'FILARIA',
  'CONSULTA',
  'ODONTOLOGIA',
  'BANO_ESTETICA',
  'CIRUGIA',
  'GASTO',
] as const;
export type CategoriaCuidado = (typeof CATEGORIAS_CUIDADO)[number];

export interface DefinicionCuidado {
  nombre: string;
  /** Periodicidad propuesta en meses; null = no se repite sola. */
  periodicidadMeses: number | null;
  /** Lleva producto, dosis y vía. */
  conProducto: boolean;
}

export const CUIDADOS: Record<CategoriaCuidado, DefinicionCuidado> = {
  DESPARASITACION_INTERNA: { nombre: 'Desparasitación interna', periodicidadMeses: 3, conProducto: true },
  ANTIPULGAS: { nombre: 'Antipulgas / garrapatas', periodicidadMeses: 1, conProducto: true },
  FILARIA: { nombre: 'Prevención de filaria (heartworm)', periodicidadMeses: 1, conProducto: true },
  CONSULTA: { nombre: 'Consulta veterinaria', periodicidadMeses: null, conProducto: false },
  ODONTOLOGIA: { nombre: 'Odontología', periodicidadMeses: 12, conProducto: false },
  BANO_ESTETICA: { nombre: 'Baño y estética', periodicidadMeses: 1, conProducto: false },
  CIRUGIA: { nombre: 'Cirugía / hospitalización', periodicidadMeses: null, conProducto: false },
  GASTO: { nombre: 'Otro gasto (alimento, accesorios, seguro)', periodicidadMeses: null, conProducto: false },
};

/** Prefijo de `CONTROLES.tipo` para distinguir lo veterinario de los controles humanos. */
export const PREFIJO_TIPO_CUIDADO = 'VET_';

export const FRECUENCIAS_PREVENTIVAS = [
  { meses: 1, etiqueta: 'Mensual' },
  { meses: 3, etiqueta: 'Trimestral' },
  { meses: 6, etiqueta: 'Semestral' },
  { meses: 12, etiqueta: 'Anual' },
] as const;

export const VIAS = ['ORAL', 'TOPICA', 'INYECTABLE', 'OTICA', 'OFTALMICA'] as const;
export type Via = (typeof VIAS)[number];
export const NOMBRE_VIA: Record<Via, string> = {
  ORAL: 'Oral', TOPICA: 'Tópica (pipeta, spot-on)', INYECTABLE: 'Inyectable', OTICA: 'Ótica', OFTALMICA: 'Oftálmica',
};

export interface CuidadoMascota extends Sincronizable {
  id: string;
  petId: string;
  memberId: string;
  categoria: CategoriaCuidado;
  fecha: string;
  /** Calculada al guardar (fecha + periodicidad) o puesta a mano. */
  proxima?: string | null;
  periodicidadMeses?: number | null;
  profesional?: string | null;
  producto?: string | null;
  dosis?: string | null;
  via?: Via | null;
  costo?: number | null;
  notas?: string | null;
}

export function proximaAplicacion(fecha: string, periodicidadMeses: number | null | undefined): string | null {
  return periodicidadMeses && periodicidadMeses > 0 && esFecha(fecha) ? sumarMeses(fecha, periodicidadMeses) : null;
}

export interface Problema { campo: string; mensaje: string }

export function validarCuidado(c: Partial<CuidadoMascota>, hoy: string): Problema[] {
  const p: Problema[] = [];
  if (!c.categoria || !CATEGORIAS_CUIDADO.includes(c.categoria)) p.push({ campo: 'categoria', mensaje: 'Elige qué se hizo.' });
  if (!esFecha(c.fecha)) p.push({ campo: 'fecha', mensaje: 'Indica la fecha.' });
  else if (c.fecha > hoy) p.push({ campo: 'fecha', mensaje: 'Se registra lo ya hecho: la fecha no puede ser futura.' });
  if (c.proxima && (!esFecha(c.proxima) || (esFecha(c.fecha) && c.proxima <= c.fecha))) {
    p.push({ campo: 'proxima', mensaje: 'La próxima aplicación debe ser posterior.' });
  }
  if (c.costo != null && (!Number.isFinite(c.costo) || c.costo < 0)) p.push({ campo: 'costo', mensaje: 'El costo no puede ser negativo.' });
  if (c.categoria === 'GASTO' && !(c.costo && c.costo > 0)) p.push({ campo: 'costo', mensaje: 'Un gasto necesita su valor.' });
  if (c.categoria && CUIDADOS[c.categoria]?.conProducto && !(c.producto ?? '').trim()) {
    p.push({ campo: 'producto', mensaje: 'Indica el producto aplicado.' });
  }
  return p;
}

/** La aplicación vigente de cada categoría (la más reciente). */
export function ultimosPorCategoria(cuidados: CuidadoMascota[], petId: string): Map<CategoriaCuidado, CuidadoMascota> {
  const m = new Map<CategoriaCuidado, CuidadoMascota>();
  for (const c of cuidados) {
    if (c.petId !== petId || c.deletedAt) continue;
    const previo = m.get(c.categoria);
    if (!previo || c.fecha > previo.fecha || (c.fecha === previo.fecha && c.id > previo.id)) m.set(c.categoria, c);
  }
  return m;
}

// ─── Tratamientos y tomas ──────────────────────────────────────────────────

export const TIPOS_TRATAMIENTO = ['ANTIBIOTICO', 'ANTIPARASITARIO', 'ANTIINFLAMATORIO', 'ANALGESICO', 'SUPLEMENTO', 'OTRO'] as const;
export type TipoTratamiento = (typeof TIPOS_TRATAMIENTO)[number];
export const NOMBRE_TIPO_TRATAMIENTO: Record<TipoTratamiento, string> = {
  ANTIBIOTICO: 'Antibiótico', ANTIPARASITARIO: 'Antiparasitario', ANTIINFLAMATORIO: 'Antiinflamatorio',
  ANALGESICO: 'Analgésico', SUPLEMENTO: 'Suplemento', OTRO: 'Otro',
};

export const UNIDADES_DOSIS = ['mg', 'ml', 'gotas', 'comprimido', 'pipeta', 'UI'] as const;
export type UnidadDosis = (typeof UNIDADES_DOSIS)[number];

export const FRECUENCIAS_TRATAMIENTO = ['CADA_8H', 'CADA_12H', 'CADA_24H', 'SEMANAL', 'MENSUAL'] as const;
export type FrecuenciaTratamiento = (typeof FRECUENCIAS_TRATAMIENTO)[number];
export const NOMBRE_FRECUENCIA: Record<FrecuenciaTratamiento, string> = {
  CADA_8H: 'Cada 8 horas', CADA_12H: 'Cada 12 horas', CADA_24H: 'Cada 24 horas', SEMANAL: 'Semanal', MENSUAL: 'Mensual',
};

export const ESTADOS_TRATAMIENTO = ['ACTIVO', 'COMPLETADO', 'SUSPENDIDO'] as const;
export type EstadoTratamiento = (typeof ESTADOS_TRATAMIENTO)[number];
export const NOMBRE_ESTADO_TRATAMIENTO: Record<EstadoTratamiento, string> = {
  ACTIVO: 'Activo', COMPLETADO: 'Completado', SUSPENDIDO: 'Suspendido',
};

export interface TratamientoMascota extends Sincronizable {
  id: string;
  petId: string;
  memberId: string;
  nombre: string;
  tipo: TipoTratamiento;
  dosisValor: number;
  dosisUnidad: UnidadDosis;
  frecuencia: FrecuenciaTratamiento;
  via: Via;
  fechaInicio: string;
  /** Hora de la primera toma, HH:mm. */
  horaInicio: string;
  fechaFin?: string | null;
  indicaciones?: string | null;
  efectosSecundarios?: string | null;
  prescritoPor?: string | null;
  estado: EstadoTratamiento;
}

export type EstadoToma = 'APLICADA' | 'OMITIDA';

export interface TomaMascota extends Sincronizable {
  /** Determinista: `<tratamiento>@<AAAA-MM-DDTHH:mm>`. */
  id: string;
  tratamientoId: string;
  petId: string;
  memberId: string;
  programadaEn: string;
  estado: EstadoToma;
  aplicadaEn?: string | null;
}

export const idDeToma = (tratamientoId: string, programadaEn: string) => `${tratamientoId}@${programadaEn}`;

export function validarTratamiento(t: Partial<TratamientoMascota>): Problema[] {
  const p: Problema[] = [];
  if (!(t.nombre ?? '').trim()) p.push({ campo: 'nombre', mensaje: 'Indica el medicamento.' });
  if (!(typeof t.dosisValor === 'number' && Number.isFinite(t.dosisValor) && t.dosisValor > 0)) p.push({ campo: 'dosisValor', mensaje: 'La dosis debe ser un número mayor que cero.' });
  if (!esFecha(t.fechaInicio)) p.push({ campo: 'fechaInicio', mensaje: 'Indica la fecha de inicio.' });
  if (!/^\d{2}:\d{2}$/.test(t.horaInicio ?? '')) p.push({ campo: 'horaInicio', mensaje: 'Indica la hora de la primera toma.' });
  if (t.fechaFin && (!esFecha(t.fechaFin) || (esFecha(t.fechaInicio) && t.fechaFin < t.fechaInicio))) {
    p.push({ campo: 'fechaFin', mensaje: 'La fecha de fin no puede ser anterior al inicio.' });
  }
  return p;
}

const PASO_HORAS: Partial<Record<FrecuenciaTratamiento, number>> = { CADA_8H: 8, CADA_12H: 12, CADA_24H: 24, SEMANAL: 168 };

/** Máximo de tomas que se calculan de una pauta (≈ 4 meses cada 8 h). */
export const MAXIMO_TOMAS = 366;

function localAIso(fecha: string, hora: string) {
  return `${fecha}T${hora}`;
}

/**
 * Pauta de tomas en hora local, de inicio a fin (o a `hasta` si no tiene
 * fin). Sin zona horaria: «a las 8» son las 8 de quien cuida a la mascota.
 */
export function pautaDeTomas(t: Pick<TratamientoMascota, 'fechaInicio' | 'horaInicio' | 'fechaFin' | 'frecuencia'>, hasta: string): string[] {
  if (!esFecha(t.fechaInicio) || !/^\d{2}:\d{2}$/.test(t.horaInicio)) return [];
  const fin = t.fechaFin && esFecha(t.fechaFin) ? (t.fechaFin < hasta ? t.fechaFin : hasta) : hasta;
  const tomas: string[] = [];
  if (t.frecuencia === 'MENSUAL') {
    for (let i = 0; i < MAXIMO_TOMAS; i++) {
      const f = sumarMeses(t.fechaInicio, i);
      if (f > fin) break;
      tomas.push(localAIso(f, t.horaInicio));
    }
    return tomas;
  }
  const paso = PASO_HORAS[t.frecuencia] ?? 24;
  const [hh, mm] = t.horaInicio.split(':').map(Number);
  const base = Date.UTC(...(t.fechaInicio.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]), hh, mm);
  const limite = Date.parse(`${fin}T23:59:59Z`);
  for (let i = 0; i < MAXIMO_TOMAS; i++) {
    const instante = base + i * paso * 3_600_000;
    if (instante > limite) break;
    tomas.push(new Date(instante).toISOString().slice(0, 16));
  }
  return tomas;
}

export interface Cumplimiento {
  vencidas: number;
  aplicadas: number;
  omitidas: number;
  pendientes: number;
  /** Aplicadas / vencidas, en %; null si aún no venció ninguna. */
  porcentaje: number | null;
  proxima: string | null;
}

/** `ahora` en hora local `AAAA-MM-DDTHH:mm`. */
export function cumplimiento(t: TratamientoMascota, tomas: TomaMascota[], ahora: string): Cumplimiento {
  const pauta = pautaDeTomas(t, sumarDias(ahora.slice(0, 10), 60));
  const marcadas = new Map(tomas.filter((x) => x.tratamientoId === t.id && !x.deletedAt).map((x) => [x.programadaEn, x.estado]));
  let vencidas = 0, aplicadas = 0, omitidas = 0, pendientes = 0;
  let proxima: string | null = null;
  for (const momento of pauta) {
    const estado = marcadas.get(momento);
    if (momento <= ahora) {
      vencidas++;
      if (estado === 'APLICADA') aplicadas++;
      else if (estado === 'OMITIDA') omitidas++;
      else pendientes++;
    } else if (!proxima && t.estado === 'ACTIVO' && !estado) {
      proxima = momento;
    }
  }
  return { vencidas, aplicadas, omitidas, pendientes, porcentaje: vencidas ? Math.round((aplicadas / vencidas) * 100) : null, proxima };
}

/** Tomas vencidas sin marcar (las más recientes primero), para marcarlas. */
export function tomasPorMarcar(t: TratamientoMascota, tomas: TomaMascota[], ahora: string, limite = 6): string[] {
  if (t.estado !== 'ACTIVO') return [];
  const marcadas = new Set(tomas.filter((x) => x.tratamientoId === t.id && !x.deletedAt).map((x) => x.programadaEn));
  return pautaDeTomas(t, ahora.slice(0, 10)).filter((m) => m <= ahora && !marcadas.has(m)).reverse().slice(0, limite);
}

// ─── Gastos ────────────────────────────────────────────────────────────────

export interface FilaGasto { mes: string; categoria: string; total: number; registros: number }

export interface ConCosto { fecha: string; costo?: number | null; categoria: string; deletedAt?: string | null }

/** Totales por mes (AAAA-MM) y categoría, del más reciente al más antiguo. */
export function resumenGastos(registros: ConCosto[]): { filas: FilaGasto[]; totalPorMes: Record<string, number>; total: number } {
  const m = new Map<string, FilaGasto>();
  const totalPorMes: Record<string, number> = {};
  let total = 0;
  for (const r of registros) {
    if (r.deletedAt || !r.costo || r.costo <= 0 || !esFecha(r.fecha)) continue;
    const mes = r.fecha.slice(0, 7);
    const clave = `${mes}|${r.categoria}`;
    const f = m.get(clave) ?? { mes, categoria: r.categoria, total: 0, registros: 0 };
    f.total += r.costo;
    f.registros++;
    m.set(clave, f);
    totalPorMes[mes] = (totalPorMes[mes] ?? 0) + r.costo;
    total += r.costo;
  }
  const filas = [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes) || b.total - a.total);
  return { filas, totalPorMes, total };
}

// ─── Recordatorios ─────────────────────────────────────────────────────────

export type TipoRecordatorioMascota = 'VACUNA' | 'PREVENTIVO' | 'MEDICAMENTO' | 'BANO' | 'PESO' | 'CUMPLEANOS';
export const NOMBRE_TIPO_RECORDATORIO: Record<TipoRecordatorioMascota, string> = {
  VACUNA: 'Refuerzo de vacuna', PREVENTIVO: 'Salud preventiva', MEDICAMENTO: 'Toma de medicamento',
  BANO: 'Baño', PESO: 'Control de peso', CUMPLEANOS: 'Cumpleaños',
};

export interface EstadoRecordatorioMascota extends Sincronizable {
  /** Determinista: `recpet:<petId>:<clave>`. */
  id: string;
  petId: string;
  memberId: string;
  clave: string;
  tipo: TipoRecordatorioMascota;
  titulo: string;
  estado: 'COMPLETADO' | 'POSPUESTO';
  /** Para POSPUESTO, la nueva fecha. */
  fecha: string;
}

export const idDeRecordatorio = (petId: string, clave: string) => `recpet:${petId}:${clave}`;

export interface RecordatorioMascota {
  clave: string;
  tipo: TipoRecordatorioMascota;
  titulo: string;
  fecha: string;
  /** Fecha original, antes de posponer. */
  fechaOriginal: string;
  pospuesto: boolean;
  urgencia: 'VENCIDO' | 'HOY' | 'PROXIMO';
}

export const VENTANA_RECORDATORIOS_DIAS = 30;

export interface EntradaMotor {
  petId: string;
  nombre: string;
  fechaNacimiento?: string | null;
  nacimientoAproximado?: boolean | null;
  activo: boolean;
  banoCadaDias?: number | null;
  vacunas: Array<{ vacuna: string; fecha: string; proximaDosis?: string | null; deletedAt?: string | null }>;
  cuidados: CuidadoMascota[];
  tratamientos: TratamientoMascota[];
  tomas: TomaMascota[];
  pesos: Array<{ fecha: string; deletedAt?: string | null }>;
  estados: EstadoRecordatorioMascota[];
}

/**
 * Lo que hay que recordar para una mascota en los próximos 30 días (y lo ya
 * vencido). Se calcula de los datos; solo «completar» y «posponer» se guardan.
 * La clave lleva la fecha debida, así que completar un ciclo no tapa el
 * siguiente.
 */
export function recordatoriosMascota(e: EntradaMotor, hoy: string, ahora: string = `${hoy}T23:59`): RecordatorioMascota[] {
  if (!e.activo) return [];
  const brutos: Array<Omit<RecordatorioMascota, 'urgencia' | 'pospuesto' | 'fechaOriginal'>> = [];

  // Vacunas: el último registro de cada vacuna manda.
  const ultimaVacuna = new Map<string, { fecha: string; proximaDosis?: string | null }>();
  for (const v of e.vacunas) {
    if (v.deletedAt) continue;
    const k = v.vacuna.trim().toLowerCase();
    const p = ultimaVacuna.get(k);
    if (!p || v.fecha > p.fecha) ultimaVacuna.set(k, v);
  }
  for (const [k, v] of ultimaVacuna) {
    if (v.proximaDosis && esFecha(v.proximaDosis)) {
      const original = e.vacunas.find((x) => x.vacuna.trim().toLowerCase() === k)?.vacuna ?? k;
      brutos.push({ clave: `VACUNA:${k}:${v.proximaDosis}`, tipo: 'VACUNA', titulo: `Refuerzo: ${original}`, fecha: v.proximaDosis });
    }
  }

  // Preventivos: la última aplicación de cada categoría con próxima fecha.
  for (const [cat, c] of ultimosPorCategoria(e.cuidados, e.petId)) {
    if (cat === 'BANO_ESTETICA') continue; // lo cubre la rutina de baño
    if (c.proxima && esFecha(c.proxima)) {
      brutos.push({ clave: `PREVENTIVO:${cat}:${c.proxima}`, tipo: 'PREVENTIVO', titulo: CUIDADOS[cat].nombre, fecha: c.proxima });
    }
  }

  // Baño: la rutina manda; si no hay rutina, la próxima del último baño.
  const ultimoBano = ultimosPorCategoria(e.cuidados, e.petId).get('BANO_ESTETICA');
  const proximoBano = e.banoCadaDias && ultimoBano ? sumarDias(ultimoBano.fecha, e.banoCadaDias) : ultimoBano?.proxima ?? null;
  if (proximoBano) brutos.push({ clave: `BANO:${proximoBano}`, tipo: 'BANO', titulo: 'Próximo baño', fecha: proximoBano });

  // Medicamentos: la próxima toma (o la vencida sin marcar) de cada tratamiento activo.
  for (const t of e.tratamientos) {
    if (t.petId !== e.petId || t.deletedAt || t.estado !== 'ACTIVO') continue;
    const sinMarcar = tomasPorMarcar(t, e.tomas, ahora, 1)[0];
    const momento = sinMarcar ?? cumplimiento(t, e.tomas, ahora).proxima;
    if (momento) {
      brutos.push({ clave: `MEDICAMENTO:${t.id}:${momento}`, tipo: 'MEDICAMENTO', titulo: `${t.nombre} · ${momento.slice(11)}`, fecha: momento.slice(0, 10) });
    }
  }

  // Peso: un control al mes desde el último pesaje.
  const ultimoPeso = e.pesos.filter((p) => !p.deletedAt).map((p) => p.fecha).sort().pop();
  if (ultimoPeso) {
    const f = sumarMeses(ultimoPeso, 1);
    brutos.push({ clave: `PESO:${f}`, tipo: 'PESO', titulo: 'Control de peso mensual', fecha: f });
  }

  // Cumpleaños: solo con fecha real, no estimada.
  if (e.fechaNacimiento && esFecha(e.fechaNacimiento) && !e.nacimientoAproximado) {
    const [, m, d] = e.fechaNacimiento.split('-');
    let f = `${hoy.slice(0, 4)}-${m}-${d === '29' && m === '02' ? '28' : d}`;
    if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}-${m}-${d === '29' && m === '02' ? '28' : d}`;
    const anios = Number(f.slice(0, 4)) - Number(e.fechaNacimiento.slice(0, 4));
    if (anios > 0) brutos.push({ clave: `CUMPLEANOS:${f}`, tipo: 'CUMPLEANOS', titulo: `${e.nombre} cumple ${anios} ${anios === 1 ? 'año' : 'años'}`, fecha: f });
  }

  const estados = new Map(e.estados.filter((s) => s.petId === e.petId && !s.deletedAt).map((s) => [s.clave, s]));
  const limite = sumarDias(hoy, VENTANA_RECORDATORIOS_DIAS);
  const salida: RecordatorioMascota[] = [];
  for (const r of brutos) {
    const s = estados.get(r.clave);
    if (s?.estado === 'COMPLETADO') continue;
    const fecha = s?.estado === 'POSPUESTO' && esFecha(s.fecha) ? s.fecha : r.fecha;
    if (fecha > limite) continue;
    salida.push({
      ...r,
      fecha,
      fechaOriginal: r.fecha,
      pospuesto: s?.estado === 'POSPUESTO',
      urgencia: fecha < hoy ? 'VENCIDO' : fecha === hoy ? 'HOY' : 'PROXIMO',
    });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));
}
