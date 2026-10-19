/**
 * Codificación de los módulos de mascota hacia y desde las filas (Bloque O).
 *
 * El descriptor mapea campo → columna uno a uno. Lo que no tiene columna
 * propia viaja en un sobre JSON dentro de `notas` (o del campo `detalle` del
 * descriptor, que apunta a `notas`). Aquí se arma y se desarma ese sobre, y se
 * pone/quita el prefijo `VET_` del tipo de control. Puro: sin red ni hoja.
 */

import { codificarNotasMascota, decodificarNotasMascota } from '../domain/fichaMascota';
import type { Pet, VaccineEntry } from '../domain/mascotas';
import {
  CATEGORIAS_CUIDADO,
  PREFIJO_TIPO_CUIDADO,
  type CategoriaCuidado,
  type CuidadoMascota,
  type EstadoRecordatorioMascota,
  type TomaMascota,
  type TratamientoMascota,
} from '../domain/cuidadoMascota';

/** Las cuatro colecciones nuevas, agrupadas en el estado de la aplicación. */
export interface ModulosMascota {
  cuidados: CuidadoMascota[];
  tratamientos: TratamientoMascota[];
  tomas: TomaMascota[];
  recordatorios: EstadoRecordatorioMascota[];
}

export const MODULOS_VACIOS = (): ModulosMascota => ({ cuidados: [], tratamientos: [], tomas: [], recordatorios: [] });

/** Colección del repositorio para cada módulo. */
export const COLECCION_DE_MODULO = {
  cuidados: 'petCare',
  tratamientos: 'petTreatments',
  tomas: 'petDoses',
  recordatorios: 'petReminderStates',
} as const;
export type ModuloMascota = keyof typeof COLECCION_DE_MODULO;
export type RegistroDeModulo<M extends ModuloMascota> = ModulosMascota[M][number];

const SOBRE = 'pate';

function sobre(tipo: string, datos: Record<string, unknown>): string {
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) continue;
    limpio[k] = v;
  }
  return Object.keys(limpio).length ? JSON.stringify({ [SOBRE]: tipo, ...limpio }) : '';
}

function abrir(tipo: string, crudo: unknown): Record<string, unknown> {
  const t = typeof crudo === 'string' ? crudo.trim() : '';
  if (!t.startsWith('{')) return t ? { notas: t } : {};
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (o && o[SOBRE] === tipo) {
      const { [SOBRE]: _x, ...resto } = o;
      void _x;
      return resto;
    }
  } catch {
    /* texto que empieza por «{» */
  }
  return { notas: t };
}

// ── Mascota ──

export function petAFila(p: Pet): Record<string, unknown> {
  return { ...p, notas: codificarNotasMascota(p.notas, p.ficha, p.notasExtra ?? undefined) };
}

export function petDesdeFila<T extends Record<string, unknown>>(r: T): T & Pick<Pet, 'notas' | 'ficha' | 'notasExtra'> {
  const d = decodificarNotasMascota(r.notas);
  return { ...r, notas: d.notas, ficha: d.ficha, notasExtra: d.extra ?? null };
}

// ── Vacuna ──

export function vacunaAFila(v: VaccineEntry): Record<string, unknown> {
  return { ...v, detalle: sobre('vacuna-mascota', { tipo: v.tipo, certificadoDocId: v.certificadoDocId, costo: v.costo }) };
}

export function vacunaDesdeFila<T extends Record<string, unknown>>(r: T): T {
  const d = abrir('vacuna-mascota', r.detalle);
  const { detalle: _d, ...resto } = r;
  void _d;
  return { ...resto, tipo: d.tipo ?? null, certificadoDocId: d.certificadoDocId ?? null, costo: typeof d.costo === 'number' ? d.costo : null } as unknown as T;
}

// ── Módulos ──

export function moduloAFila(modulo: ModuloMascota, r: Record<string, unknown>): Record<string, unknown> {
  switch (modulo) {
    case 'cuidados': {
      const c = r as unknown as CuidadoMascota;
      return {
        ...c,
        tipo: `${PREFIJO_TIPO_CUIDADO}${c.categoria}`,
        detalle: sobre('cuidado-mascota', { producto: c.producto, dosis: c.dosis, via: c.via, costo: c.costo, notas: c.notas }),
      };
    }
    case 'tratamientos': {
      const t = r as unknown as TratamientoMascota;
      return { ...t, detalle: sobre('tratamiento-mascota', { tipo: t.tipo, via: t.via, efectosSecundarios: t.efectosSecundarios }) };
    }
    default:
      return r;
  }
}

export function categoriaDeTipo(tipo: unknown): CategoriaCuidado | null {
  const t = String(tipo ?? '');
  if (!t.startsWith(PREFIJO_TIPO_CUIDADO)) return null;
  const c = t.slice(PREFIJO_TIPO_CUIDADO.length) as CategoriaCuidado;
  return CATEGORIAS_CUIDADO.includes(c) ? c : null;
}

export function moduloDesdeFila(modulo: ModuloMascota, r: Record<string, unknown>): Record<string, unknown> | null {
  switch (modulo) {
    case 'cuidados': {
      const categoria = categoriaDeTipo(r.tipo);
      if (!categoria) return null;
      const d = abrir('cuidado-mascota', r.detalle);
      const { detalle: _d, tipo: _t, ...resto } = r;
      void _d; void _t;
      return {
        ...resto,
        categoria,
        producto: d.producto ?? null,
        dosis: d.dosis ?? null,
        via: d.via ?? null,
        costo: typeof d.costo === 'number' ? d.costo : null,
        notas: d.notas ?? null,
      };
    }
    case 'tratamientos': {
      const d = abrir('tratamiento-mascota', r.detalle);
      const { detalle: _d, ...resto } = r;
      void _d;
      return { ...resto, tipo: d.tipo ?? 'OTRO', via: d.via ?? 'ORAL', efectosSecundarios: d.efectosSecundarios ?? null };
    }
    default:
      return r;
  }
}

/** Un estado guardado de antes del Bloque O no trae módulos: se rellenan vacíos. */
export function normalizarModulos(m: Partial<ModulosMascota> | null | undefined): ModulosMascota {
  const base = MODULOS_VACIOS();
  if (!m || typeof m !== 'object') return base;
  return {
    cuidados: Array.isArray(m.cuidados) ? m.cuidados : base.cuidados,
    tratamientos: Array.isArray(m.tratamientos) ? m.tratamientos : base.tratamientos,
    tomas: Array.isArray(m.tomas) ? m.tomas : base.tomas,
    recordatorios: Array.isArray(m.recordatorios) ? m.recordatorios : base.recordatorios,
  };
}
