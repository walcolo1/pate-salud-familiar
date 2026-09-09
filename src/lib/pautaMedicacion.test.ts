import { describe, it, expect } from 'vitest';
import {
  AVISO_DESDE_DOSIS,
  MAXIMO_DOSIS,
  aMarcaLocal,
  calcularMomentos,
  estimarDosis,
  generarDosis,
  idDeDosis,
  reprogramarDosis,
  type ContextoDosis,
  type Pauta,
} from './pautaMedicacion';
import type { MedicationDoseReminder } from '../domain/models';

/** Ningún dato de aquí corresponde a un tratamiento real. */
const CONTEXTO: ContextoDosis = {
  prescriptionId: 'p1',
  memberId: 'm1',
  medicationName: 'MEDICAMENTO-SINTETICO',
  dose: '1 tableta',
  creadoEn: '2026-03-01T00:00:00.000Z',
};

const pauta = (over: Partial<Pauta> = {}): Pauta => ({
  startDate: '2026-03-10',
  endDate: '2026-03-12',
  frequencyType: 'TWICE_DAILY',
  ...over,
});

describe('calcularMomentos · frecuencias con nombre', () => {
  it('dos veces al día durante tres días son seis tomas', () => {
    const r = calcularMomentos(pauta());
    expect(r.momentos).toHaveLength(6);
    expect(r.momentos[0]).toBe('2026-03-10T08:00');
    expect(r.momentos[1]).toBe('2026-03-10T20:00');
    expect(r.momentos[5]).toBe('2026-03-12T20:00');
  });

  it('una vez al día, y tres veces al día', () => {
    expect(calcularMomentos(pauta({ frequencyType: 'ONCE_DAILY' })).momentos).toHaveLength(3);
    expect(calcularMomentos(pauta({ frequencyType: 'THREE_TIMES_DAILY' })).momentos).toHaveLength(9);
  });

  it('las horas concretas se respetan y se ordenan', () => {
    const r = calcularMomentos(
      pauta({ frequencyType: 'SPECIFIC_TIMES', specificTimes: ['21:30', '07:15'] }),
    );
    expect(r.momentos.slice(0, 2)).toEqual(['2026-03-10T07:15', '2026-03-10T21:30']);
  });

  it('una hora mal escrita se descarta en vez de generar una toma imposible', () => {
    const r = calcularMomentos(
      pauta({ frequencyType: 'SPECIFIC_TIMES', specificTimes: ['08:00', 'mañana', ''] }),
    );
    expect(r.momentos).toHaveLength(3);
  });
});

describe('calcularMomentos · cada X horas', () => {
  it('empieza a las 08:00, no a medianoche', () => {
    const r = calcularMomentos(
      pauta({ endDate: '2026-03-10', frequencyType: 'EVERY_X_HOURS', frequencyIntervalHours: 8 }),
    );
    expect(r.momentos).toEqual(['2026-03-10T08:00', '2026-03-10T16:00']);
  });

  it('cruza la medianoche sin perderse', () => {
    const r = calcularMomentos(
      pauta({ endDate: '2026-03-11', frequencyType: 'EVERY_X_HOURS', frequencyIntervalHours: 12 }),
    );
    expect(r.momentos).toEqual([
      '2026-03-10T08:00',
      '2026-03-10T20:00',
      '2026-03-11T08:00',
      '2026-03-11T20:00',
    ]);
  });
});

describe('calcularMomentos · fechas imposibles', () => {
  it('un fin anterior al inicio no genera nada', () => {
    expect(calcularMomentos(pauta({ startDate: '2026-03-12', endDate: '2026-03-10' })).momentos).toEqual([]);
  });

  it('una fecha ilegible no genera nada', () => {
    expect(calcularMomentos(pauta({ startDate: '2026-13-40' })).momentos).toEqual([]);
    expect(calcularMomentos(pauta({ startDate: 'mañana' })).momentos).toEqual([]);
  });

  it('el mismo día de inicio y fin sí genera', () => {
    expect(calcularMomentos(pauta({ endDate: '2026-03-10' })).momentos).toHaveLength(2);
  });
});

describe('el tope existe y se declara', () => {
  it('un año cada cuatro horas se recorta, y lo dice', () => {
    const r = calcularMomentos(
      pauta({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        frequencyType: 'EVERY_X_HOURS',
        frequencyIntervalHours: 4,
      }),
    );
    expect(r.momentos).toHaveLength(MAXIMO_DOSIS);
    expect(r.truncado).toBe(true);
    expect(
      r.totalSinTope,
      'hay que poder decir cuántas habrían salido, no solo cuántas hay',
    ).toBeGreaterThan(MAXIMO_DOSIS);
  });

  it('lo que cabe no se marca como truncado', () => {
    const r = calcularMomentos(pauta());
    expect(r.truncado).toBe(false);
    expect(r.totalSinTope).toBe(6);
  });

  it('estimarDosis permite avisar ANTES de guardar', () => {
    const r = estimarDosis(
      pauta({ startDate: '2026-01-01', endDate: '2026-06-30', frequencyType: 'THREE_TIMES_DAILY' }),
    );
    expect(r.totalSinTope).toBeGreaterThan(AVISO_DESDE_DOSIS);
  });

  it('un intervalo absurdo no cuelga el navegador', () => {
    const r = calcularMomentos(
      pauta({
        startDate: '2026-01-01',
        endDate: '2035-12-31',
        frequencyType: 'EVERY_X_HOURS',
        frequencyIntervalHours: 1,
      }),
    );
    expect(r.momentos).toHaveLength(MAXIMO_DOSIS);
  });
});

describe('generarDosis · identificadores', () => {
  it('son deterministas y no chocan', () => {
    const r = generarDosis(
      pauta({ startDate: '2026-01-01', endDate: '2026-06-30', frequencyType: 'THREE_TIMES_DAILY' }),
      CONTEXTO,
    );
    const ids = new Set(r.dosis.map((d) => d.id));
    expect(
      ids.size,
      'con `Date.now()` + azar, 400 tomas chocaban con una probabilidad altísima',
    ).toBe(r.dosis.length);
  });

  it('generar dos veces lo mismo da los mismos identificadores', () => {
    const a = generarDosis(pauta(), CONTEXTO);
    const b = generarDosis(pauta(), CONTEXTO);
    expect(a.dosis.map((d) => d.id)).toEqual(b.dosis.map((d) => d.id));
  });

  it('cada toma nace pendiente y con los datos del tratamiento', () => {
    const [primera] = generarDosis(pauta(), CONTEXTO).dosis;
    expect(primera.status).toBe('PENDING');
    expect(primera.prescriptionId).toBe('p1');
    expect(primera.medicationName).toBe('MEDICAMENTO-SINTETICO');
    expect(primera.id).toBe(idDeDosis('p1', 0));
  });
});

/** Una toma cualquiera, para las pruebas de reprogramación. */
function dosis(over: Partial<MedicationDoseReminder>): MedicationDoseReminder {
  return {
    id: 'd0',
    prescriptionId: 'p1',
    memberId: 'm1',
    medicationName: 'MEDICAMENTO-SINTETICO',
    dose: '1 tableta',
    scheduledAt: '2026-03-10T08:00',
    status: 'PENDING',
    createdAt: '2026-03-01T00:00',
    updatedAt: '2026-03-01T00:00',
    ...over,
  };
}

const AHORA = new Date(2026, 2, 11, 12, 0); // 11 de marzo, mediodía

describe('reprogramarDosis · el historial no se toca', () => {
  it('conserva lo ya tomado', () => {
    const previas = [
      dosis({ id: 'd1', scheduledAt: '2026-03-10T08:00', status: 'TAKEN' }),
      dosis({ id: 'd2', scheduledAt: '2026-03-10T20:00', status: 'MISSED' }),
    ];
    const r = reprogramarDosis(pauta({ endDate: '2026-03-14' }), CONTEXTO, previas, AHORA);
    expect(r.conservadas.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(r.retiradas).toBe(0);
  });

  it('conserva una toma pendiente que ya venció: que nadie la marcara no la borra', () => {
    const previas = [dosis({ id: 'd3', scheduledAt: '2026-03-11T08:00', status: 'PENDING' })];
    const r = reprogramarDosis(pauta({ endDate: '2026-03-14' }), CONTEXTO, previas, AHORA);
    expect(r.conservadas.map((d) => d.id)).toEqual(['d3']);
  });

  it('retira solo lo que aún no ha llegado', () => {
    const previas = [
      dosis({ id: 'd1', scheduledAt: '2026-03-10T08:00', status: 'TAKEN' }),
      dosis({ id: 'd4', scheduledAt: '2026-03-12T08:00', status: 'PENDING' }),
      dosis({ id: 'd5', scheduledAt: '2026-03-12T20:00', status: 'PENDING' }),
    ];
    const r = reprogramarDosis(pauta({ endDate: '2026-03-14' }), CONTEXTO, previas, AHORA);
    expect(r.retiradas).toBe(2);
    expect(r.conservadas.map((d) => d.id)).toEqual(['d1']);
  });

  it('la pauta nueva solo genera a futuro', () => {
    const r = reprogramarDosis(pauta({ endDate: '2026-03-13' }), CONTEXTO, [], AHORA);
    expect(r.dosis.every((d) => d.scheduledAt > '2026-03-11T12:00')).toBe(true);
  });

  it('no duplica un momento que ya está registrado en el historial', () => {
    // Una toma futura ya TOMADA por adelantado: no debe generarse otra igual.
    const previas = [dosis({ id: 'dx', scheduledAt: '2026-03-12T08:00', status: 'TAKEN' })];
    const r = reprogramarDosis(pauta({ endDate: '2026-03-12' }), CONTEXTO, previas, AHORA);
    expect(r.dosis.map((d) => d.scheduledAt)).not.toContain('2026-03-12T08:00');
  });

  it('los identificadores nuevos no pisan los del historial', () => {
    const previas = [
      dosis({ id: idDeDosis('p1', 0), scheduledAt: '2026-03-10T08:00', status: 'TAKEN' }),
      dosis({ id: idDeDosis('p1', 1), scheduledAt: '2026-03-10T20:00', status: 'TAKEN' }),
    ];
    const r = reprogramarDosis(pauta({ endDate: '2026-03-14' }), CONTEXTO, previas, AHORA);
    const idsPrevios = new Set(previas.map((d) => d.id));
    for (const d of r.dosis) {
      expect(idsPrevios.has(d.id), `el id ${d.id} pisa una toma del historial`).toBe(false);
    }
  });

  it('ignora las tomas de OTRO tratamiento', () => {
    const previas = [dosis({ id: 'ajena', prescriptionId: 'p2', status: 'TAKEN' })];
    const r = reprogramarDosis(pauta(), CONTEXTO, previas, AHORA);
    expect(r.conservadas).toEqual([]);
  });

  it('ignora las ya borradas', () => {
    const previas = [dosis({ id: 'db', status: 'TAKEN', deletedAt: '2026-03-05T00:00' })];
    const r = reprogramarDosis(pauta(), CONTEXTO, previas, AHORA);
    expect(r.conservadas).toEqual([]);
  });
});

describe('aMarcaLocal', () => {
  it('no pasa por UTC: la marca es la hora que se ve en el reloj', () => {
    expect(aMarcaLocal(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01T00:30');
    expect(aMarcaLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31T23:59');
  });
});
