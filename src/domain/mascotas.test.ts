import { describe, it, expect } from 'vitest';
import {
  ESPECIES,
  PESO_MAXIMO_KG,
  PESO_MINIMO_KG,
  SEXOS,
  TIPOS_HISTORIAL,
  esEspecie,
  esPesoValido,
  esSexo,
  hoyLocal,
  mascotasDe,
  primerProblema,
  validarHistorialVet,
  validarMascota,
  validarPeso,
  validarVacunaMascota,
  type Pet,
} from './mascotas';

const AHORA = new Date(2026, 8, 9, 12, 0); // 9 de septiembre de 2026

/** Borrador válido mínimo. Ningún dato corresponde a un animal real. */
const MASCOTA = {
  nombre: 'MASCOTA-SINTETICA',
  especie: 'PERRO' as const,
  sexo: 'MACHO' as const,
  memberId: 'm1',
};

const problemasDe = (v: ReturnType<typeof validarMascota>) =>
  v.valido ? [] : v.problemas.map((p) => p.campo);

describe('catálogos', () => {
  it('reconocen lo que está en la lista y rechazan lo demás', () => {
    for (const e of ESPECIES) expect(esEspecie(e)).toBe(true);
    for (const s of SEXOS) expect(esSexo(s)).toBe(true);

    for (const malo of ['perro', 'DINOSAURIO', '', null, undefined, 42, {}]) {
      expect(esEspecie(malo), String(malo)).toBe(false);
    }
  });

  it('no tienen entradas repetidas', () => {
    expect(new Set(ESPECIES).size).toBe(ESPECIES.length);
    expect(new Set(TIPOS_HISTORIAL).size).toBe(TIPOS_HISTORIAL.length);
  });
});

describe('esPesoValido', () => {
  it('acepta desde un pájaro hasta un mastín', () => {
    expect(esPesoValido(0.02)).toBe(true); // jilguero
    expect(esPesoValido(4.3)).toBe(true); // gato
    expect(esPesoValido(85)).toBe(true); // mastín
  });

  it('rechaza cero, negativos y lo que se sale de la horquilla', () => {
    expect(esPesoValido(0)).toBe(false);
    expect(esPesoValido(-3)).toBe(false);
    expect(esPesoValido(PESO_MINIMO_KG / 2)).toBe(false);
    expect(esPesoValido(PESO_MAXIMO_KG + 1)).toBe(false);
  });

  it('rechaza lo que no es un número, NaN e infinito incluidos', () => {
    // `Number('abc')` es NaN, y un NaN guardado rompe la gráfica de D2 sin
    // decir por qué.
    expect(esPesoValido(NaN)).toBe(false);
    expect(esPesoValido(Infinity)).toBe(false);
    expect(esPesoValido('4.3')).toBe(false);
    expect(esPesoValido(null)).toBe(false);
    expect(esPesoValido(undefined)).toBe(false);
  });

  it('4500 gramos escritos como kilos se rechaza: es un error de unidades', () => {
    expect(esPesoValido(4500)).toBe(false);
  });
});

describe('validarMascota', () => {
  it('acepta lo mínimo imprescindible', () => {
    expect(validarMascota(MASCOTA, AHORA).valido).toBe(true);
  });

  it('exige nombre, y no acepta espacios en blanco por nombre', () => {
    expect(problemasDe(validarMascota({ ...MASCOTA, nombre: '' }, AHORA))).toContain('nombre');
    expect(problemasDe(validarMascota({ ...MASCOTA, nombre: '   ' }, AHORA))).toContain('nombre');
  });

  it('corta los nombres desmedidos', () => {
    expect(problemasDe(validarMascota({ ...MASCOTA, nombre: 'x'.repeat(61) }, AHORA))).toContain('nombre');
  });

  it('exige una especie y un sexo del catálogo', () => {
    expect(
      problemasDe(validarMascota({ ...MASCOTA, especie: 'DRAGON' as never }, AHORA)),
    ).toContain('especie');
    expect(problemasDe(validarMascota({ ...MASCOTA, sexo: 'X' as never }, AHORA))).toContain('sexo');
  });

  it('exige un familiar responsable: es lo que decide quién puede verla', () => {
    expect(problemasDe(validarMascota({ ...MASCOTA, memberId: '' }, AHORA))).toContain('memberId');
  });

  it('la fecha de nacimiento es opcional: de un animal adoptado no se sabe', () => {
    expect(validarMascota({ ...MASCOTA, fechaNacimiento: null }, AHORA).valido).toBe(true);
    expect(validarMascota({ ...MASCOTA, fechaNacimiento: '2020-05-01' }, AHORA).valido).toBe(true);
  });

  it('pero si viene, tiene que ser una fecha y no del futuro', () => {
    expect(
      problemasDe(validarMascota({ ...MASCOTA, fechaNacimiento: '01/05/2020' }, AHORA)),
    ).toContain('fechaNacimiento');
    expect(
      problemasDe(validarMascota({ ...MASCOTA, fechaNacimiento: '2027-01-01' }, AHORA)),
    ).toContain('fechaNacimiento');
  });

  it('el día de hoy sí vale: un cachorro puede nacer esta mañana', () => {
    expect(validarMascota({ ...MASCOTA, fechaNacimiento: hoyLocal(AHORA) }, AHORA).valido).toBe(true);
  });

  it('los pesos son opcionales pero, si vienen, tienen que ser utilizables', () => {
    expect(validarMascota({ ...MASCOTA, pesoActualKg: null }, AHORA).valido).toBe(true);
    expect(problemasDe(validarMascota({ ...MASCOTA, pesoActualKg: 0 }, AHORA))).toContain('pesoActualKg');
    expect(problemasDe(validarMascota({ ...MASCOTA, pesoIdealKg: 4500 }, AHORA))).toContain('pesoIdealKg');
  });

  it('el mensaje de peso dice qué hacer, no solo que está mal', () => {
    const v = validarMascota({ ...MASCOTA, pesoActualKg: 4500 }, AHORA);
    expect(primerProblema(v)?.mensaje).toContain('gramos');
  });

  it('acumula todos los problemas, no solo el primero', () => {
    const campos = problemasDe(validarMascota({ nombre: '', memberId: '' }, AHORA));
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'especie', 'sexo', 'memberId']));
  });
});

describe('validarPeso', () => {
  const base = { petId: 'p1', fecha: '2026-09-01', pesoKg: 4.2 };

  it('acepta un pesaje razonable', () => {
    expect(validarPeso(base, AHORA).valido).toBe(true);
  });

  it('rechaza un pesaje del futuro', () => {
    const v = validarPeso({ ...base, fecha: '2026-12-01' }, AHORA);
    expect(v.valido).toBe(false);
    expect(primerProblema(v)?.campo).toBe('fecha');
  });

  it('rechaza pesos imposibles y fechas ilegibles', () => {
    expect(validarPeso({ ...base, pesoKg: 0 }, AHORA).valido).toBe(false);
    expect(validarPeso({ ...base, fecha: 'ayer' }, AHORA).valido).toBe(false);
  });

  it('exige saber de qué mascota es', () => {
    expect(validarPeso({ ...base, petId: '' }, AHORA).valido).toBe(false);
  });
});

describe('validarVacunaMascota', () => {
  const base = { petId: 'p1', vacuna: 'VACUNA-SINTETICA', fecha: '2026-09-01' };

  it('acepta lo mínimo', () => {
    expect(validarVacunaMascota(base, AHORA).valido).toBe(true);
  });

  it('el refuerzo tiene que ser POSTERIOR a la dosis aplicada', () => {
    const v = validarVacunaMascota({ ...base, proximaDosis: '2026-08-01' }, AHORA);
    expect(v.valido).toBe(false);
    expect(primerProblema(v)?.campo).toBe('proximaDosis');
  });

  it('el mismo día NO vale: es un error de captura, no una pauta', () => {
    expect(validarVacunaMascota({ ...base, proximaDosis: '2026-09-01' }, AHORA).valido).toBe(false);
  });

  it('un refuerzo un día después sí vale', () => {
    expect(validarVacunaMascota({ ...base, proximaDosis: '2026-09-02' }, AHORA).valido).toBe(true);
  });

  it('una vacuna del pasado es legítima: se registra lo que ya se puso', () => {
    expect(validarVacunaMascota({ ...base, fecha: '2019-01-01' }, AHORA).valido).toBe(true);
  });

  it('una vacuna con fecha futura NO: eso es un plan, no un registro', () => {
    const v = validarVacunaMascota({ ...base, fecha: '2027-01-01' }, AHORA);
    expect(v.valido).toBe(false);
    expect(primerProblema(v)?.campo).toBe('fecha');
  });

  it('exige nombre de vacuna y fecha', () => {
    expect(validarVacunaMascota({ ...base, vacuna: '  ' }, AHORA).valido).toBe(false);
    expect(validarVacunaMascota({ ...base, fecha: '' }, AHORA).valido).toBe(false);
  });
});

describe('validarHistorialVet', () => {
  const base = { petId: 'p1', fecha: '2026-09-01', tipo: 'CONSULTA' as const, diagnostico: 'Revisión anual' };

  it('acepta una entrada completa', () => {
    expect(validarHistorialVet(base, AHORA).valido).toBe(true);
  });

  it('exige un tipo del catálogo', () => {
    expect(validarHistorialVet({ ...base, tipo: 'ALGO' as never }, AHORA).valido).toBe(false);
  });

  it('exige diagnóstico: una entrada sin motivo no dice nada', () => {
    expect(validarHistorialVet({ ...base, diagnostico: '' }, AHORA).valido).toBe(false);
  });

  it('rechaza una atención futura', () => {
    expect(validarHistorialVet({ ...base, fecha: '2027-01-01' }, AHORA).valido).toBe(false);
  });
});

describe('mascotasDe', () => {
  const pet = (over: Partial<Pet>): Pet =>
    ({
      id: 'p',
      familyId: 'f1',
      memberId: 'm1',
      nombre: 'Z',
      especie: 'PERRO',
      sexo: 'MACHO',
      activo: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...over,
    }) as Pet;

  it('devuelve solo las del familiar pedido', () => {
    const lista = [pet({ id: 'a' }), pet({ id: 'b', memberId: 'm2' })];
    expect(mascotasDe(lista, 'm1').map((p) => p.id)).toEqual(['a']);
  });

  it('deja fuera las borradas', () => {
    const lista = [pet({ id: 'a' }), pet({ id: 'b', deletedAt: '2026-02-01T00:00:00.000Z' })];
    expect(mascotasDe(lista, 'm1').map((p) => p.id)).toEqual(['a']);
  });

  it('CONSERVA las inactivas: se marcan, no se borran', () => {
    const lista = [pet({ id: 'a', activo: false, nombre: 'A' })];
    expect(mascotasDe(lista, 'm1')).toHaveLength(1);
  });

  it('ordena por nombre con criterio español', () => {
    const lista = [pet({ id: 'a', nombre: 'Zeus' }), pet({ id: 'b', nombre: 'Ámbar' })];
    expect(mascotasDe(lista, 'm1').map((p) => p.nombre)).toEqual(['Ámbar', 'Zeus']);
  });

  it('con una lista vacía o ausente no se rompe', () => {
    expect(mascotasDe([], 'm1')).toEqual([]);
    expect(mascotasDe(undefined as never, 'm1')).toEqual([]);
  });
});

describe('hoyLocal', () => {
  it('no pasa por UTC: el 1 de enero a las 00:30 sigue siendo el 1', () => {
    expect(hoyLocal(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(hoyLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
