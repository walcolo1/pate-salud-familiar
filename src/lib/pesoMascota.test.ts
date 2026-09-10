import { describe, it, expect } from 'vitest';
import {
  LIENZO,
  UMBRAL_ADVERTENCIA,
  UMBRAL_ALERTA,
  calcularDesviacion,
  construirGrafica,
  descripcionPunto,
  fechaCorta,
  resumenDePeso,
  serieDePesos,
  trazo,
  ultimoPeso,
  variacionUltima,
} from './pesoMascota';
import type { Pet, WeightEntry } from '../domain/mascotas';

/** Ningún dato de aquí corresponde a un animal real. */
function peso(over: Partial<WeightEntry>): WeightEntry {
  return {
    id: 'w1',
    petId: 'p1',
    memberId: 'm1',
    fecha: '2026-03-01',
    pesoKg: 4,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...over,
  } as WeightEntry;
}

const mascota = (over: Partial<Pet> = {}): Pet =>
  ({
    id: 'p1',
    familyId: 'f1',
    memberId: 'm1',
    nombre: 'MASCOTA-SINTETICA',
    especie: 'GATO',
    sexo: 'HEMBRA',
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Pet;

describe('calcularDesviacion', () => {
  it('sin peso ideal NO inventa una referencia', () => {
    const d = calcularDesviacion(4.5, null);
    expect(d.nivel).toBe('sin-referencia');
    expect(d.porcentaje).toBeNull();
    expect(d.mensaje).toContain('Sin peso ideal');
  });

  it('sin peso actual tampoco compara', () => {
    expect(calcularDesviacion(null, 4).nivel).toBe('sin-referencia');
    expect(calcularDesviacion(undefined, 4).nivel).toBe('sin-referencia');
  });

  it('un peso ideal de cero no divide entre cero', () => {
    const d = calcularDesviacion(4, 0);
    expect(d.nivel).toBe('sin-referencia');
    expect(d.porcentaje).toBeNull();
  });

  it('NaN e Infinity no producen una alerta absurda', () => {
    expect(calcularDesviacion(NaN, 4).nivel).toBe('sin-referencia');
    expect(calcularDesviacion(4, Infinity).nivel).toBe('sin-referencia');
  });

  it('coincidir con el ideal es normal, y lo dice', () => {
    const d = calcularDesviacion(4, 4);
    expect(d.nivel).toBe('normal');
    expect(d.direccion).toBe('igual');
    expect(d.porcentaje).toBe(0);
    expect(d.mensaje).toContain('coincide');
  });

  it('por debajo del umbral de advertencia sigue siendo normal', () => {
    // 4,3 sobre 4,0 son 7,5 %.
    const d = calcularDesviacion(4.3, 4);
    expect(d.nivel).toBe('normal');
    expect(d.porcentaje).toBe(7.5);
  });

  it('a partir del 10 % avisa, por arriba y por abajo', () => {
    const arriba = calcularDesviacion(4.4, 4); // +10 %
    expect(arriba.nivel).toBe('advertencia');
    expect(arriba.direccion).toBe('encima');

    const abajo = calcularDesviacion(3.6, 4); // −10 %
    expect(abajo.nivel).toBe('advertencia');
    expect(abajo.direccion).toBe('debajo');
  });

  it('a partir del 20 % es alerta', () => {
    expect(calcularDesviacion(4.8, 4).nivel).toBe('alerta'); // +20 %
    expect(calcularDesviacion(3.2, 4).nivel).toBe('alerta'); // −20 %
    expect(calcularDesviacion(6, 4).nivel).toBe('alerta'); // +50 %
  });

  it('el umbral es inclusivo: exactamente el 10 % ya avisa', () => {
    expect(Math.abs(calcularDesviacion(4.4, 4).porcentaje!)).toBe(UMBRAL_ADVERTENCIA);
    expect(Math.abs(calcularDesviacion(4.8, 4).porcentaje!)).toBe(UMBRAL_ALERTA);
  });

  it('el mensaje dice el número y la dirección, no solo que hay un problema', () => {
    const d = calcularDesviacion(4.6, 4); // +15 %
    expect(d.mensaje).toContain('15');
    expect(d.mensaje).toContain('encima');
  });

  it('el porcentaje se redondea a un decimal, sin colas infinitas', () => {
    const d = calcularDesviacion(4.13, 3.7);
    expect(String(d.porcentaje).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('serieDePesos', () => {
  it('ordena del más antiguo al más nuevo', () => {
    const lista = [
      peso({ id: 'b', fecha: '2026-03-05' }),
      peso({ id: 'a', fecha: '2026-03-01' }),
      peso({ id: 'c', fecha: '2026-03-10' }),
    ];
    expect(serieDePesos(lista, 'p1').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('con la misma fecha, el orden es estable', () => {
    const lista = [peso({ id: 'b' }), peso({ id: 'a' })];
    expect(serieDePesos(lista, 'p1').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('deja fuera lo borrado y lo de otra mascota', () => {
    const lista = [
      peso({ id: 'a' }),
      peso({ id: 'b', deletedAt: '2026-03-02T00:00:00.000Z' }),
      peso({ id: 'c', petId: 'p2' }),
    ];
    expect(serieDePesos(lista, 'p1').map((p) => p.id)).toEqual(['a']);
  });

  it('con una lista ausente no se rompe', () => {
    expect(serieDePesos(undefined as never, 'p1')).toEqual([]);
  });
});

describe('ultimoPeso y variacionUltima', () => {
  it('el último es el más reciente, no el último añadido', () => {
    const lista = [peso({ id: 'nuevo', fecha: '2026-03-10' }), peso({ id: 'viejo', fecha: '2026-03-01' })];
    expect(ultimoPeso(lista, 'p1')?.id).toBe('nuevo');
  });

  it('con un solo pesaje NO hay tendencia', () => {
    expect(variacionUltima([peso({})], 'p1')).toBeNull();
  });

  it('la variación lleva signo', () => {
    const lista = [peso({ id: 'a', fecha: '2026-03-01', pesoKg: 4 }), peso({ id: 'b', fecha: '2026-03-10', pesoKg: 4.5 })];
    expect(variacionUltima(lista, 'p1')).toBe(0.5);
    const bajando = [peso({ id: 'a', fecha: '2026-03-01', pesoKg: 4.5 }), peso({ id: 'b', fecha: '2026-03-10', pesoKg: 4 })];
    expect(variacionUltima(bajando, 'p1')).toBe(-0.5);
  });

  it('sin pesajes no hay último ni variación', () => {
    expect(ultimoPeso([], 'p1')).toBeNull();
    expect(variacionUltima([], 'p1')).toBeNull();
  });
});

describe('construirGrafica', () => {
  const serie = [
    peso({ id: 'a', fecha: '2026-03-01', pesoKg: 4 }),
    peso({ id: 'b', fecha: '2026-03-10', pesoKg: 4.5 }),
    peso({ id: 'c', fecha: '2026-03-20', pesoKg: 5 }),
  ];

  it('coloca un punto por pesaje, dentro del lienzo', () => {
    const g = construirGrafica(serie, 4.5);
    expect(g.puntos).toHaveLength(3);
    for (const p of g.puntos) {
      expect(p.x).toBeGreaterThanOrEqual(LIENZO.margen.izquierda);
      expect(p.x).toBeLessThanOrEqual(LIENZO.ancho - LIENZO.margen.derecha);
      expect(p.y).toBeGreaterThanOrEqual(LIENZO.margen.arriba);
      expect(p.y).toBeLessThanOrEqual(LIENZO.alto - LIENZO.margen.abajo);
    }
  });

  it('más peso queda MÁS ARRIBA: en SVG la y crece hacia abajo', () => {
    const g = construirGrafica(serie, null);
    expect(g.puntos[2].y).toBeLessThan(g.puntos[0].y);
  });

  it('el primero va a la izquierda y el último a la derecha', () => {
    const g = construirGrafica(serie, null);
    expect(g.puntos[0].x).toBeLessThan(g.puntos[2].x);
  });

  it('UN SOLO punto se centra en vez de dividir entre cero', () => {
    const g = construirGrafica([peso({})], null);
    expect(g.puntos).toHaveLength(1);
    expect(Number.isFinite(g.puntos[0].x)).toBe(true);
    expect(g.puntos[0].x).toBeCloseTo(
      LIENZO.margen.izquierda + (LIENZO.ancho - LIENZO.margen.izquierda - LIENZO.margen.derecha) / 2,
      0,
    );
  });

  it('TODOS los pesos iguales no dejan la línea pegada a un borde', () => {
    const planos = [
      peso({ id: 'a', fecha: '2026-03-01', pesoKg: 4 }),
      peso({ id: 'b', fecha: '2026-03-10', pesoKg: 4 }),
    ];
    const g = construirGrafica(planos, null);
    for (const p of g.puntos) {
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeGreaterThan(LIENZO.margen.arriba);
      expect(p.y).toBeLessThan(LIENZO.alto - LIENZO.margen.abajo);
    }
    // Y los dos a la misma altura, que es la verdad del dato.
    expect(g.puntos[0].y).toBe(g.puntos[1].y);
  });

  it('sin pesajes ni ideal devuelve una gráfica vacía, no NaN', () => {
    const g = construirGrafica([], null);
    expect(g.puntos).toEqual([]);
    expect(g.yIdeal).toBeNull();
    expect(g.marcasY).toEqual([]);
  });

  it('el peso ideal entra en la escala aunque quede fuera de la serie', () => {
    const g = construirGrafica(serie, 12);
    expect(g.maximo).toBeGreaterThanOrEqual(12);
    expect(g.yIdeal).not.toBeNull();
    expect(Number.isFinite(g.yIdeal as number)).toBe(true);
  });

  it('sin peso ideal no hay línea de referencia', () => {
    expect(construirGrafica(serie, null).yIdeal).toBeNull();
    expect(construirGrafica(serie, 0).yIdeal).toBeNull();
  });

  it('la escala nunca baja de cero: un peso negativo no existe', () => {
    const g = construirGrafica([peso({ pesoKg: 0.05 })], null);
    expect(g.minimo).toBeGreaterThanOrEqual(0);
  });

  it('las marcas del eje van de mayor a menor', () => {
    const g = construirGrafica(serie, null);
    expect(g.marcasY).toHaveLength(3);
    expect(g.marcasY[0].valor).toBeGreaterThan(g.marcasY[2].valor);
  });
});

describe('trazo', () => {
  it('empieza con M y sigue con L', () => {
    const g = construirGrafica(
      [peso({ id: 'a', fecha: '2026-03-01' }), peso({ id: 'b', fecha: '2026-03-02', pesoKg: 5 })],
      null,
    );
    const d = trazo(g.puntos);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
  });

  it('sin puntos no dibuja nada', () => {
    expect(trazo([])).toBe('');
  });
});

describe('fechaCorta y descripcionPunto', () => {
  it('la fecha se acorta sin pasar por UTC', () => {
    expect(fechaCorta('2026-03-01')).toBe('1 mar');
    expect(fechaCorta('2026-12-31')).toBe('31 dic');
  });

  it('una fecha ilegible se devuelve tal cual en vez de romper', () => {
    expect(fechaCorta('mañana')).toBe('mañana');
  });

  it('el nombre de un punto dice cuándo y cuánto', () => {
    const g = construirGrafica([peso({ pesoKg: 4.3, fecha: '2026-03-01' })], null);
    expect(descripcionPunto(g.puntos[0])).toBe('1 mar: 4.3 kg');
  });

  it('y añade la nota cuando la hay', () => {
    const g = construirGrafica([peso({ pesoKg: 4.3, fecha: '2026-03-01', nota: 'Tras la dieta' })], null);
    expect(descripcionPunto(g.puntos[0])).toContain('Tras la dieta');
  });
});

describe('resumenDePeso', () => {
  it('compara el último PESAJE, no el campo pesoActualKg', () => {
    // `pesoActualKg` es un reflejo y puede quedarse atrás.
    const p = mascota({ pesoActualKg: 4, pesoIdealKg: 4 });
    const pesos = [peso({ fecha: '2026-03-10', pesoKg: 5 })];
    const r = resumenDePeso(p, pesos);
    expect(r.desviacion.nivel).toBe('alerta');
    expect(r.ultimo?.pesoKg).toBe(5);
  });

  it('sin pesajes cae al campo de la mascota', () => {
    const p = mascota({ pesoActualKg: 4.4, pesoIdealKg: 4 });
    const r = resumenDePeso(p, []);
    expect(r.ultimo).toBeNull();
    expect(r.desviacion.nivel).toBe('advertencia');
  });

  it('sin nada que comparar, no hay alerta', () => {
    expect(resumenDePeso(mascota(), []).desviacion.nivel).toBe('sin-referencia');
  });
});
