import { describe, it, expect } from 'vitest';
import {
  VENTANA_PROXIMA_DIAS,
  diasEntre,
  estadoDeVacuna,
  fechaLarga,
  vacunasDe,
  vacunasPendientes,
} from './vacunasMascota';
import type { VaccineEntry } from '../domain/mascotas';

const AHORA = new Date(2026, 8, 9, 12, 0); // 9 de septiembre de 2026

/** Ningún dato de aquí corresponde a un animal real. */
function vacuna(over: Partial<VaccineEntry>): VaccineEntry {
  return {
    id: 'v1',
    petId: 'p1',
    memberId: 'm1',
    vacuna: 'VACUNA-SINTETICA',
    fecha: '2026-09-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as VaccineEntry;
}

describe('diasEntre', () => {
  it('cuenta los días con signo', () => {
    expect(diasEntre('2026-09-09', '2026-09-19')).toBe(10);
    expect(diasEntre('2026-09-09', '2026-09-01')).toBe(-8);
    expect(diasEntre('2026-09-09', '2026-09-09')).toBe(0);
  });

  it('cruza meses y años sin perderse', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(diasEntre('2024-02-28', '2024-03-01')).toBe(2); // bisiesto
  });

  it('con una fecha ilegible devuelve null en vez de un número inventado', () => {
    expect(diasEntre('mañana', '2026-09-09')).toBeNull();
    expect(diasEntre('2026-09-09', '')).toBeNull();
  });
});

describe('estadoDeVacuna', () => {
  it('sin refuerzo no hay nada que vigilar', () => {
    const e = estadoDeVacuna(vacuna({ proximaDosis: null }), AHORA);
    expect(e.estado).toBe('sin-refuerzo');
    expect(e.dias).toBeNull();
  });

  it('un refuerzo lejano está al día, y dice cuándo toca', () => {
    const e = estadoDeVacuna(vacuna({ proximaDosis: '2027-01-01' }), AHORA);
    expect(e.estado).toBe('al-dia');
    expect(e.mensaje).toContain('Al día');
    expect(e.mensaje).toContain('enero');
  });

  it('dentro de la ventana es «próxima», con los días que faltan', () => {
    const e = estadoDeVacuna(vacuna({ proximaDosis: '2026-09-19' }), AHORA);
    expect(e.estado).toBe('proxima');
    expect(e.dias).toBe(10);
    expect(e.mensaje).toContain('10 días');
  });

  it('el borde de la ventana todavía cuenta como próxima', () => {
    const limite = new Date(AHORA.getTime() + VENTANA_PROXIMA_DIAS * 86_400_000);
    const dd = (n: number) => String(n).padStart(2, '0');
    const fecha = `${limite.getFullYear()}-${dd(limite.getMonth() + 1)}-${dd(limite.getDate())}`;
    expect(estadoDeVacuna(vacuna({ proximaDosis: fecha }), AHORA).estado).toBe('proxima');
  });

  it('un día más allá ya está al día', () => {
    const fuera = new Date(AHORA.getTime() + (VENTANA_PROXIMA_DIAS + 1) * 86_400_000);
    const dd = (n: number) => String(n).padStart(2, '0');
    const fecha = `${fuera.getFullYear()}-${dd(fuera.getMonth() + 1)}-${dd(fuera.getDate())}`;
    expect(estadoDeVacuna(vacuna({ proximaDosis: fecha }), AHORA).estado).toBe('al-dia');
  });

  it('hoy mismo es próxima, y lo dice sin hablar de días', () => {
    const e = estadoDeVacuna(vacuna({ proximaDosis: '2026-09-09' }), AHORA);
    expect(e.estado).toBe('proxima');
    expect(e.dias).toBe(0);
    expect(e.mensaje).toContain('hoy');
  });

  it('pasada la fecha está vencida, y dice desde cuándo', () => {
    const e = estadoDeVacuna(vacuna({ proximaDosis: '2026-09-01' }), AHORA);
    expect(e.estado).toBe('vencida');
    expect(e.dias).toBe(-8);
    expect(e.mensaje).toContain('Vencida');
    expect(e.mensaje).toContain('8 días');
  });

  it('un solo día de atraso se dice en singular', () => {
    expect(estadoDeVacuna(vacuna({ proximaDosis: '2026-09-08' }), AHORA).mensaje).toContain('1 día');
  });

  it('una fecha de refuerzo ilegible NO se da por buena', () => {
    // Decir «al día» sobre algo que nadie pudo comprobar es peor que no decir
    // nada: da por vacunado a un animal que quizá no lo esté.
    const e = estadoDeVacuna(vacuna({ proximaDosis: 'el mes que viene' }), AHORA);
    expect(e.estado).not.toBe('al-dia');
    expect(e.mensaje).toContain('no se entiende');
  });
});

describe('vacunasDe', () => {
  it('ordena de la más reciente a la más antigua', () => {
    const lista = [
      vacuna({ id: 'a', fecha: '2025-01-01' }),
      vacuna({ id: 'b', fecha: '2026-09-01' }),
      vacuna({ id: 'c', fecha: '2026-01-01' }),
    ];
    expect(vacunasDe(lista, 'p1').map((v) => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('deja fuera lo borrado y lo de otra mascota', () => {
    const lista = [
      vacuna({ id: 'a' }),
      vacuna({ id: 'b', deletedAt: '2026-09-02T00:00:00.000Z' }),
      vacuna({ id: 'c', petId: 'p2' }),
    ];
    expect(vacunasDe(lista, 'p1').map((v) => v.id)).toEqual(['a']);
  });

  it('con una lista ausente no se rompe', () => {
    expect(vacunasDe(undefined as never, 'p1')).toEqual([]);
  });
});

describe('vacunasPendientes', () => {
  it('recoge las vencidas y las próximas, y deja fuera el resto', () => {
    const lista = [
      vacuna({ id: 'vencida', proximaDosis: '2026-09-01' }),
      vacuna({ id: 'proxima', proximaDosis: '2026-09-19' }),
      vacuna({ id: 'lejana', proximaDosis: '2027-06-01' }),
      vacuna({ id: 'sin-refuerzo', proximaDosis: null }),
    ];
    expect(vacunasPendientes(lista, AHORA).map((p) => p.vacuna.id)).toEqual(['vencida', 'proxima']);
  });

  it('lo más urgente va primero', () => {
    const lista = [
      vacuna({ id: 'proxima', proximaDosis: '2026-09-19' }),
      vacuna({ id: 'muy-vencida', proximaDosis: '2026-06-01' }),
      vacuna({ id: 'poco-vencida', proximaDosis: '2026-09-05' }),
    ];
    expect(vacunasPendientes(lista, AHORA).map((p) => p.vacuna.id)).toEqual([
      'muy-vencida',
      'poco-vencida',
      'proxima',
    ]);
  });

  it('lo borrado no reclama atención', () => {
    const lista = [vacuna({ proximaDosis: '2026-09-01', deletedAt: '2026-09-02T00:00:00.000Z' })];
    expect(vacunasPendientes(lista, AHORA)).toEqual([]);
  });

  it('sin vacunas no hay nada pendiente', () => {
    expect(vacunasPendientes([], AHORA)).toEqual([]);
  });
});

describe('fechaLarga', () => {
  it('se escribe en español y sin pasar por UTC', () => {
    expect(fechaLarga('2026-01-01')).toBe('1 de enero de 2026');
    expect(fechaLarga('2026-12-31')).toBe('31 de diciembre de 2026');
  });

  it('una fecha ilegible se devuelve tal cual', () => {
    expect(fechaLarga('pronto')).toBe('pronto');
  });
});
