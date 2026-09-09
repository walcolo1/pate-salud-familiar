import { describe, it, expect } from 'vitest';
import {
  ESTADOS_ABIERTOS,
  agruparPorDia,
  construirAgenda,
  diasDelMes,
  diasDeLaSemana,
  filtrarAgenda,
  normalizarCita,
  normalizarControl,
  normalizarDosis,
  rangoMes,
  rangoSemana,
  type EventoCalendario,
} from './agenda';

/** Ninguno de estos datos corresponde a una persona ni a un tratamiento real. */
const FAMILIARES = [
  { id: 'm1', fullName: 'Familiar Uno' },
  { id: 'm2', fullName: 'Familiar Dos' },
];

const CITA = {
  id: 'c1',
  memberId: 'm1',
  doctorName: 'Profesional Sintetico',
  specialty: 'Medicina General',
  scheduledAt: '2026-03-10T08:30',
  reason: 'Control',
  status: 'SCHEDULED' as const,
  documentIds: [],
};

const DOSIS = {
  id: 'd1',
  prescriptionId: 'p1',
  memberId: 'm1',
  medicationName: 'MEDICAMENTO-SINTETICO',
  dose: '1 tableta',
  scheduledAt: '2026-03-10T20:00',
  status: 'PENDING' as const,
  createdAt: '2026-03-01T00:00',
  updatedAt: '2026-03-01T00:00',
};

const CONTROL = {
  id: 'k1',
  memberId: 'm2',
  checkupType: 'Odontológico',
  scheduledDate: '2026-03-12',
  status: 'SCHEDULED' as const,
};

describe('normalizar · los tres orígenes al mismo tipo', () => {
  it('una cita conserva fecha y hora por separado', () => {
    const e = normalizarCita(CITA, FAMILIARES);
    expect(e.tipo).toBe('cita');
    expect(e.fecha).toBe('2026-03-10');
    expect(e.hora).toBe('08:30');
    expect(e.familiarNombre).toBe('Familiar Uno');
  });

  it('un control no tiene hora, y eso se dice con null, no con las 00:00', () => {
    const e = normalizarControl(CONTROL, FAMILIARES);
    expect(e.tipo).toBe('control');
    expect(e.fecha).toBe('2026-03-12');
    expect(
      e.hora,
      'inventar las 00:00 lo colocaría de madrugada en cualquier vista por horas',
    ).toBeNull();
  });

  it('una dosis lleva el medicamento en los metadatos, no en el título', () => {
    const e = normalizarDosis(DOSIS, FAMILIARES);
    expect(e.tipo).toBe('dosis');
    expect(e.hora).toBe('20:00');
    expect(e.metadatos.medicamento).toBe('MEDICAMENTO-SINTETICO');
  });

  it('los dos catálogos de estado distintos se traducen al mismo', () => {
    expect(normalizarCita({ ...CITA, status: 'COMPLETED' }, FAMILIARES).estado).toBe('hecho');
    expect(normalizarCita({ ...CITA, status: 'CANCELLED' }, FAMILIARES).estado).toBe('cancelado');
    expect(normalizarCita({ ...CITA, status: 'OVERDUE' }, FAMILIARES).estado).toBe('vencido');
    // El catálogo de las dosis es OTRO: PENDING/TAKEN/MISSED/SKIPPED.
    expect(normalizarDosis({ ...DOSIS, status: 'TAKEN' }, FAMILIARES).estado).toBe('hecho');
    expect(normalizarDosis({ ...DOSIS, status: 'MISSED' }, FAMILIARES).estado).toBe('vencido');
    expect(normalizarDosis({ ...DOSIS, status: 'SKIPPED' }, FAMILIARES).estado).toBe('cancelado');
  });

  it('un familiar que ya no está no deja el evento sin nombre', () => {
    const e = normalizarCita({ ...CITA, memberId: 'fantasma' }, FAMILIARES);
    expect(e.familiarNombre).toBeTruthy();
  });
});

describe('construirAgenda', () => {
  const agenda = construirAgenda(
    { citas: [CITA], dosis: [DOSIS], controles: [CONTROL] },
    FAMILIARES,
  );

  it('reúne los tres orígenes', () => {
    expect(agenda).toHaveLength(3);
    expect(new Set(agenda.map((e) => e.tipo))).toEqual(new Set(['cita', 'dosis', 'control']));
  });

  it('ordena por fecha y, dentro del día, por hora', () => {
    expect(agenda.map((e) => e.id)).toEqual(['cita:c1', 'dosis:d1', 'control:k1']);
  });

  it('los identificadores llevan el origen, para que dos no choquen', () => {
    const chocan = construirAgenda(
      { citas: [{ ...CITA, id: 'x' }], dosis: [{ ...DOSIS, id: 'x' }], controles: [] },
      FAMILIARES,
    );
    expect(new Set(chocan.map((e) => e.id)).size).toBe(2);
  });

  it('descarta lo borrado, en los tres orígenes', () => {
    const a = construirAgenda(
      {
        citas: [{ ...CITA, deletedAt: '2026-03-01T00:00' }],
        dosis: [{ ...DOSIS, deletedAt: '2026-03-01T00:00' }],
        controles: [{ ...CONTROL, deletedAt: '2026-03-01T00:00' }],
      },
      FAMILIARES,
    );
    expect(a).toHaveLength(0);
  });

  it('descarta lo que no tiene fecha en vez de colocarlo en un día inventado', () => {
    const a = construirAgenda(
      { citas: [{ ...CITA, scheduledAt: '' }], dosis: [], controles: [] },
      FAMILIARES,
    );
    expect(a).toHaveLength(0);
  });
});

describe('rangos de fechas · sin desplazamientos de zona horaria', () => {
  it('el mes empieza el 1 y termina el último día, con hora local', () => {
    const { desde, hasta } = rangoMes(2026, 2); // marzo, índice 2
    expect(desde).toBe('2026-03-01');
    expect(hasta).toBe('2026-03-31');
  });

  it('febrero bisiesto no se queda corto', () => {
    expect(rangoMes(2024, 1).hasta).toBe('2024-02-29');
    expect(rangoMes(2026, 1).hasta).toBe('2026-02-28');
  });

  it('la semana empieza en lunes, también cuando el día es domingo', () => {
    // 2026-03-15 es domingo.
    expect(rangoSemana('2026-03-15')).toEqual({ desde: '2026-03-09', hasta: '2026-03-15' });
    // 2026-03-09 es lunes: la semana es la suya.
    expect(rangoSemana('2026-03-09')).toEqual({ desde: '2026-03-09', hasta: '2026-03-15' });
  });

  it('una semana a caballo entre dos meses no se parte', () => {
    // 2026-04-01 es miércoles: su semana empieza el 30 de marzo.
    expect(rangoSemana('2026-04-01')).toEqual({ desde: '2026-03-30', hasta: '2026-04-05' });
  });

  it('diasDelMes cubre el mes entero y nada más', () => {
    const dias = diasDelMes(2026, 1);
    expect(dias).toHaveLength(28);
    expect(dias[0]).toBe('2026-02-01');
    expect(dias[27]).toBe('2026-02-28');
  });

  it('diasDeLaSemana devuelve siete días consecutivos', () => {
    const dias = diasDeLaSemana('2026-03-15');
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe('2026-03-09');
    expect(dias[6]).toBe('2026-03-15');
  });

  it('el cambio de año no rompe el mes ni la semana', () => {
    expect(rangoMes(2025, 11)).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    // 2026-01-01 es jueves.
    expect(rangoSemana('2026-01-01')).toEqual({ desde: '2025-12-29', hasta: '2026-01-04' });
  });
});

describe('filtrarAgenda', () => {
  const agenda = construirAgenda(
    { citas: [CITA], dosis: [DOSIS], controles: [CONTROL] },
    FAMILIARES,
  );

  it('sin filtros devuelve todo', () => {
    expect(filtrarAgenda(agenda, {})).toHaveLength(3);
  });

  it('por familiar deja solo los suyos', () => {
    expect(filtrarAgenda(agenda, { familiarId: 'm2' }).map((e) => e.tipo)).toEqual(['control']);
  });

  it('por rango excluye lo de fuera, incluyendo los extremos', () => {
    const r = filtrarAgenda(agenda, { desde: '2026-03-10', hasta: '2026-03-10' });
    expect(r).toHaveLength(2);
    const solo11 = filtrarAgenda(agenda, { desde: '2026-03-11', hasta: '2026-03-11' });
    expect(solo11).toHaveLength(0);
  });

  it('por tipo combina con los demás filtros', () => {
    const r = filtrarAgenda(agenda, { familiarId: 'm1', tipos: ['dosis'] });
    expect(r.map((e) => e.id)).toEqual(['dosis:d1']);
  });

  it('un filtro sin resultados devuelve una lista vacía, no todo', () => {
    expect(filtrarAgenda(agenda, { familiarId: 'nadie' })).toEqual([]);
  });
});

describe('agruparPorDia', () => {
  it('junta los eventos del mismo día y respeta el orden', () => {
    const agenda = construirAgenda(
      { citas: [CITA], dosis: [DOSIS], controles: [CONTROL] },
      FAMILIARES,
    );
    const porDia = agruparPorDia(agenda);
    expect(porDia['2026-03-10'].map((e) => e.hora)).toEqual(['08:30', '20:00']);
    expect(porDia['2026-03-12']).toHaveLength(1);
  });

  it('un día sin eventos no aparece en el mapa', () => {
    const porDia = agruparPorDia([] as EventoCalendario[]);
    expect(Object.keys(porDia)).toEqual([]);
  });
});

describe('ESTADOS_ABIERTOS', () => {
  it('lo pendiente y lo vencido siguen abiertos; lo hecho y lo cancelado no', () => {
    expect(ESTADOS_ABIERTOS).toContain('pendiente');
    expect(ESTADOS_ABIERTOS).toContain('vencido');
    expect(ESTADOS_ABIERTOS).not.toContain('hecho');
    expect(ESTADOS_ABIERTOS).not.toContain('cancelado');
  });
});
