import { describe, it, expect } from 'vitest';
import {
  FILTRO_TODOS,
  agruparPorAnio,
  descripcionEntrada,
  esFechaUtil,
  filtrarPorTipo,
  historialDe,
  resumenHistorial,
} from './historialVet';
import { CUERPO_AVISO } from './avisosLocales';
import type { MedicalHistoryEntry } from '../domain/mascotas';

/** Ningún dato de aquí corresponde a un animal ni a una clínica reales. */
function entrada(over: Partial<MedicalHistoryEntry>): MedicalHistoryEntry {
  return {
    id: 'h1',
    petId: 'p1',
    memberId: 'm1',
    fecha: '2026-03-01',
    tipo: 'CONSULTA',
    diagnostico: 'DIAGNOSTICO-SINTETICO',
    tratamiento: null,
    veterinario: null,
    documentoId: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...over,
  } as MedicalHistoryEntry;
}

describe('esFechaUtil', () => {
  it('acepta una fecha completa y rechaza lo demás', () => {
    expect(esFechaUtil('2026-03-01')).toBe(true);
    expect(esFechaUtil('2026-3-1')).toBe(false);
    expect(esFechaUtil('marzo')).toBe(false);
    expect(esFechaUtil('')).toBe(false);
    expect(esFechaUtil(undefined)).toBe(false);
  });

  it('rechaza una fecha con el formato correcto pero imposible', () => {
    expect(esFechaUtil('2026-13-40')).toBe(false);
  });
});

describe('historialDe', () => {
  it('ordena de la más reciente a la más antigua', () => {
    const lista = [
      entrada({ id: 'a', fecha: '2024-01-01' }),
      entrada({ id: 'b', fecha: '2026-03-01' }),
      entrada({ id: 'c', fecha: '2025-06-15' }),
    ];
    expect(historialDe(lista, 'p1').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('dos atenciones el mismo día se desempatan por cuándo se apuntaron', () => {
    // Una urgencia y la consulta de seguimiento el mismo día es corriente. Sin
    // desempate, el orden dependería de cómo llegara el array.
    const lista = [
      entrada({ id: 'primera', createdAt: '2026-03-01T09:00:00.000Z' }),
      entrada({ id: 'segunda', createdAt: '2026-03-01T18:00:00.000Z' }),
    ];
    expect(historialDe(lista, 'p1').map((e) => e.id)).toEqual(['segunda', 'primera']);
  });

  it('deja fuera lo borrado y lo de otra mascota', () => {
    const lista = [
      entrada({ id: 'a' }),
      entrada({ id: 'b', deletedAt: '2026-03-02T00:00:00.000Z' }),
      entrada({ id: 'c', petId: 'p2' }),
    ];
    expect(historialDe(lista, 'p1').map((e) => e.id)).toEqual(['a']);
  });

  it('una fecha ilegible NO desaparece: va al final', () => {
    // Perder una cirugía porque su fecha venía rota de un respaldo sería peor
    // que enseñarla sin fecha.
    const lista = [
      entrada({ id: 'rota', fecha: 'el invierno pasado' }),
      entrada({ id: 'vieja', fecha: '2020-01-01' }),
    ];
    expect(historialDe(lista, 'p1').map((e) => e.id)).toEqual(['vieja', 'rota']);
  });

  it('con una lista ausente no se rompe', () => {
    expect(historialDe(undefined as never, 'p1')).toEqual([]);
  });
});

describe('filtrarPorTipo', () => {
  const lista = [
    entrada({ id: 'a', tipo: 'CONSULTA' }),
    entrada({ id: 'b', tipo: 'CIRUGIA' }),
    entrada({ id: 'c', tipo: 'CONSULTA' }),
  ];

  it('«todos» no filtra nada', () => {
    expect(filtrarPorTipo(lista, FILTRO_TODOS)).toHaveLength(3);
  });

  it('un tipo concreto deja solo ese', () => {
    expect(filtrarPorTipo(lista, 'CONSULTA').map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('un tipo sin entradas devuelve una lista vacía, no todo', () => {
    expect(filtrarPorTipo(lista, 'URGENCIA')).toEqual([]);
  });
});

describe('agruparPorAnio', () => {
  it('agrupa conservando el orden que recibe', () => {
    const lista = historialDe(
      [
        entrada({ id: 'a', fecha: '2026-03-01' }),
        entrada({ id: 'b', fecha: '2026-01-10' }),
        entrada({ id: 'c', fecha: '2024-08-08' }),
      ],
      'p1',
    );
    const grupos = agruparPorAnio(lista);
    expect(grupos.map((g) => g.anio)).toEqual([2026, 2024]);
    expect(grupos[0].entradas.map((e) => e.id)).toEqual(['a', 'b']);
    expect(grupos[0].etiqueta).toBe('2026');
  });

  it('el año sale del texto, nunca de un Date', () => {
    // `new Date('2026-01-01')` es medianoche UTC: al oeste de Greenwich cae en
    // 2025, y el grupo saldría con el año anterior.
    expect(agruparPorAnio([entrada({ fecha: '2026-01-01' })])[0].anio).toBe(2026);
  });

  it('lo ilegible tiene su propio grupo, y se dice', () => {
    const grupos = agruparPorAnio([entrada({ fecha: 'no me acuerdo' })]);
    expect(grupos[0].anio).toBeNull();
    expect(grupos[0].etiqueta).toContain('Sin fecha');
  });

  it('sin entradas no hay grupos', () => {
    expect(agruparPorAnio([])).toEqual([]);
  });
});

describe('resumenHistorial', () => {
  it('cuenta las vivas y solo los tipos presentes', () => {
    const resumen = resumenHistorial([
      entrada({ id: 'a', tipo: 'CONSULTA' }),
      entrada({ id: 'b', tipo: 'CONSULTA' }),
      entrada({ id: 'c', tipo: 'CIRUGIA' }),
      entrada({ id: 'd', tipo: 'URGENCIA', deletedAt: '2026-03-05T00:00:00.000Z' }),
    ]);
    expect(resumen.total).toBe(3);
    expect(resumen.tipos.map((t) => [t.tipo, t.total])).toEqual([
      ['CONSULTA', 2],
      ['CIRUGIA', 1],
    ]);
    expect(resumen.tipos[0].nombre).toBe('Consulta');
  });

  it('un empate se ordena por nombre, para que no dependa del recorrido', () => {
    const resumen = resumenHistorial([
      entrada({ id: 'a', tipo: 'REVISION' }),
      entrada({ id: 'b', tipo: 'CIRUGIA' }),
    ]);
    expect(resumen.tipos.map((t) => t.tipo)).toEqual(['CIRUGIA', 'REVISION']);
  });

  it('«la última» es la de fecha más reciente, no la apuntada al final', () => {
    // Se puede registrar hoy una consulta del mes pasado.
    const resumen = resumenHistorial([
      entrada({ id: 'antigua', fecha: '2026-01-01', createdAt: '2026-03-09T00:00:00.000Z' }),
      entrada({ id: 'reciente', fecha: '2026-02-20', createdAt: '2026-02-20T00:00:00.000Z' }),
    ]);
    expect(resumen.ultima?.id).toBe('reciente');
  });

  it('si ninguna fecha se entiende, no se inventa una última', () => {
    const resumen = resumenHistorial([entrada({ fecha: 'hace tiempo' })]);
    expect(resumen.ultima).toBeNull();
    expect(resumen.total).toBe(1);
  });

  it('sin entradas el resumen está vacío pero es válido', () => {
    expect(resumenHistorial([])).toEqual({ total: 0, ultima: null, tipos: [] });
  });
});

describe('descripcionEntrada', () => {
  it('junta el tipo y la fecha en español', () => {
    expect(descripcionEntrada(entrada({ tipo: 'CIRUGIA', fecha: '2026-01-03' }))).toBe(
      'Cirugía · 3 de enero de 2026',
    );
  });

  it('con una fecha ilegible lo dice en vez de callarlo', () => {
    expect(descripcionEntrada(entrada({ fecha: 'ni idea' }))).toContain('no reconocible');
  });
});

describe('el historial no avisa de nada', () => {
  it('D4 no añadió ningún tipo de aviso', () => {
    // El historial registra lo que ya pasó: no hay nada que recordar. Este
    // recuento es el pestillo — si algún día aparece un aviso de historial,
    // esta prueba lo saca a la luz antes que un usuario con el móvil bloqueado.
    expect(Object.keys(CUERPO_AVISO).sort()).toEqual([
      'cita',
      'control',
      'medicacion',
      'otro',
      'vacuna-mascota',
    ]);
  });
});
