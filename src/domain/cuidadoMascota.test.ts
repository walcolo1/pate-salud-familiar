import { describe, expect, it } from 'vitest';
import {
  cumplimiento,
  idDeToma,
  pautaDeTomas,
  proximaAplicacion,
  proximaDosisPropuesta,
  recordatoriosMascota,
  resumenGastos,
  sumarMeses,
  tomasPorMarcar,
  validarCuidado,
  validarTratamiento,
  vacunasDeEspecie,
  type CuidadoMascota,
  type TratamientoMascota,
} from './cuidadoMascota';
import {
  codificarNotasMascota,
  decodificarNotasMascota,
  describirEdadMascota,
  etapaDeVida,
  evaluarPeso,
  mesesEntre,
  nacimientoDesdeEdad,
  validarFicha,
} from './fichaMascota';

describe('ficha ampliada · sobre en `notas`', () => {
  it('ida y vuelta, compacta lo vacío', () => {
    const ficha = { esterilizado: true, fechaEsterilizacion: '2024-02-01', microchip: '985112003456789', veterinario: { nombre: 'Dra. Ruiz', clinica: '' }, alimentacion: { presentacion: 'SECO' as const, vecesAlDia: 2 } };
    const celda = codificarNotasMascota('Le teme a la pólvora', ficha);
    const d = decodificarNotasMascota(celda);
    expect(d.notas).toBe('Le teme a la pólvora');
    expect(d.ficha).toEqual({ esterilizado: true, fechaEsterilizacion: '2024-02-01', microchip: '985112003456789', veterinario: { nombre: 'Dra. Ruiz' }, alimentacion: { presentacion: 'SECO', vecesAlDia: 2 } });
  });

  it('sin ficha, las notas siguen siendo texto plano (retrocompatible)', () => {
    expect(codificarNotasMascota('Solo notas', {})).toBe('Solo notas');
    expect(decodificarNotasMascota('Notas antiguas')).toEqual({ notas: 'Notas antiguas', ficha: {} });
    expect(decodificarNotasMascota('{no es json')).toEqual({ notas: '{no es json', ficha: {} });
    expect(decodificarNotasMascota('')).toEqual({ notas: null, ficha: {} });
  });

  it('conserva lo que trae un sobre más nuevo', () => {
    const futuro = JSON.stringify({ pate: 'ficha-mascota', v: 2, notas: 'x', ficha: { microchip: '123456789' }, seguro: { poliza: 'P1' } });
    const d = decodificarNotasMascota(futuro);
    expect(d.extra).toEqual({ seguro: { poliza: 'P1' } });
    expect(JSON.parse(codificarNotasMascota(d.notas, d.ficha, d.extra)).seguro).toEqual({ poliza: 'P1' });
  });
});

describe('edad, etapa y peso', () => {
  it('meses y descripción', () => {
    expect(mesesEntre('2020-05-20', '2026-10-18')).toBe(76);
    expect(describirEdadMascota(76)).toBe('6 años y 4 meses');
    expect(describirEdadMascota(5, true)).toBe('aprox. 5 meses');
  });
  it('etapa según especie y tamaño', () => {
    expect(etapaDeVida('PERRO', 6)).toBe('CACHORRO');
    expect(etapaDeVida('PERRO', 80, 'GRANDE')).toBe('SENIOR');
    expect(etapaDeVida('PERRO', 80, 'PEQUENO')).toBe('ADULTO');
    expect(etapaDeVida('GATO', 130)).toBe('SENIOR');
  });
  it('nacimiento estimado', () => {
    expect(nacimientoDesdeEdad(2, '2026-10-18')).toBe('2024-10-18');
    expect(nacimientoDesdeEdad(-1, '2026-10-18')).toBeNull();
  });
  it('alerta de peso a más de ±10 %', () => {
    expect(evaluarPeso(11.5, 10)).toEqual({ desviacion: 0.15, sentido: 'SOBRE' });
    expect(evaluarPeso(10.9, 10)?.sentido).toBe('EN_RANGO');
    expect(evaluarPeso(8.5, 10)?.sentido).toBe('BAJO');
    expect(evaluarPeso(8, null)).toBeNull();
  });
  it('valida la ficha', () => {
    const p = validarFicha({ esterilizado: false, fechaEsterilizacion: '2030-01-01', microchip: '12', contacto: { correo: 'x' }, alimentacion: { vecesAlDia: 0 } }, '2026-10-18');
    expect(p.map((x) => x.campo)).toEqual(['fechaEsterilizacion', 'esterilizado', 'microchip', 'correo', 'vecesAlDia']);
  });
});

describe('vacunas y preventivos', () => {
  it('catálogo por especie con esenciales y opcionales', () => {
    const perro = vacunasDeEspecie('PERRO');
    expect(perro.filter((v) => v.tipo === 'CORE').map((v) => v.nombre)).toEqual(['Polivalente (DHPPi)', 'Rabia']);
    expect(vacunasDeEspecie('GATO').some((v) => v.nombre.includes('Leucemia') && v.tipo === 'NO_CORE')).toBe(true);
    expect(vacunasDeEspecie('PEZ')).toEqual([]);
  });
  it('próxima dosis y próxima aplicación', () => {
    expect(proximaDosisPropuesta('PERRO', 'Rabia', '2026-01-31')).toBe('2027-01-31');
    expect(proximaDosisPropuesta('PERRO', 'Desconocida', '2026-01-31')).toBeNull();
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(proximaAplicacion('2026-10-01', 3)).toBe('2027-01-01');
    expect(proximaAplicacion('2026-10-01', null)).toBeNull();
  });
  it('valida un preventivo', () => {
    expect(validarCuidado({ categoria: 'ANTIPULGAS', fecha: '2026-10-01' }, '2026-10-18').map((p) => p.campo)).toEqual(['producto']);
    expect(validarCuidado({ categoria: 'GASTO', fecha: '2026-10-01' }, '2026-10-18').map((p) => p.campo)).toEqual(['costo']);
    expect(validarCuidado({ categoria: 'CONSULTA', fecha: '2026-11-01' }, '2026-10-18').map((p) => p.campo)).toEqual(['fecha']);
  });
});

const trat = (o: Partial<TratamientoMascota> = {}): TratamientoMascota => ({
  id: 't1', petId: 'p1', memberId: 'm1', nombre: 'Amoxicilina', tipo: 'ANTIBIOTICO', dosisValor: 250, dosisUnidad: 'mg',
  frecuencia: 'CADA_12H', via: 'ORAL', fechaInicio: '2026-10-15', horaInicio: '08:00', fechaFin: '2026-10-19', estado: 'ACTIVO', ...o,
});

describe('tratamientos y tomas', () => {
  it('pauta cada 12 h hasta el fin', () => {
    const p = pautaDeTomas(trat(), '2026-12-31');
    expect(p[0]).toBe('2026-10-15T08:00');
    expect(p[1]).toBe('2026-10-15T20:00');
    expect(p).toHaveLength(10);
    expect(p.at(-1)).toBe('2026-10-19T20:00');
  });
  it('mensual y semanal', () => {
    expect(pautaDeTomas(trat({ frecuencia: 'MENSUAL', fechaFin: '2027-01-31', fechaInicio: '2026-10-31' }), '2030-01-01')).toEqual([
      '2026-10-31T08:00', '2026-11-30T08:00', '2026-12-31T08:00', '2027-01-31T08:00',
    ]);
    expect(pautaDeTomas(trat({ frecuencia: 'SEMANAL', fechaFin: '2026-10-29' }), '2030-01-01')).toHaveLength(3);
  });
  it('cumplimiento y tomas por marcar', () => {
    const tomas = [
      { id: idDeToma('t1', '2026-10-15T08:00'), tratamientoId: 't1', petId: 'p1', memberId: 'm1', programadaEn: '2026-10-15T08:00', estado: 'APLICADA' as const },
      { id: idDeToma('t1', '2026-10-15T20:00'), tratamientoId: 't1', petId: 'p1', memberId: 'm1', programadaEn: '2026-10-15T20:00', estado: 'OMITIDA' as const },
    ];
    const c = cumplimiento(trat(), tomas, '2026-10-16T09:00');
    expect(c).toEqual({ vencidas: 3, aplicadas: 1, omitidas: 1, pendientes: 1, porcentaje: 33, proxima: '2026-10-16T20:00' });
    expect(tomasPorMarcar(trat(), tomas, '2026-10-16T09:00')).toEqual(['2026-10-16T08:00']);
    expect(tomasPorMarcar(trat({ estado: 'SUSPENDIDO' }), tomas, '2026-10-16T09:00')).toEqual([]);
  });
  it('valida', () => {
    expect(validarTratamiento({ nombre: '', dosisValor: 0, fechaInicio: '2026-10-10', horaInicio: '8', fechaFin: '2026-10-01' }).map((p) => p.campo))
      .toEqual(['nombre', 'dosisValor', 'horaInicio', 'fechaFin']);
  });
});

describe('gastos', () => {
  it('por mes y categoría', () => {
    const r = resumenGastos([
      { fecha: '2026-09-10', costo: 50000, categoria: 'CONSULTA' },
      { fecha: '2026-09-20', costo: 30000, categoria: 'CONSULTA' },
      { fecha: '2026-10-01', costo: 90000, categoria: 'GASTO' },
      { fecha: '2026-10-02', costo: 0, categoria: 'GASTO' },
      { fecha: '2026-10-03', costo: 10, categoria: 'GASTO', deletedAt: 'x' },
    ]);
    expect(r.total).toBe(170000);
    expect(r.totalPorMes).toEqual({ '2026-09': 80000, '2026-10': 90000 });
    expect(r.filas[0]).toEqual({ mes: '2026-10', categoria: 'GASTO', total: 90000, registros: 1 });
    expect(r.filas[1]).toEqual({ mes: '2026-09', categoria: 'CONSULTA', total: 80000, registros: 2 });
  });
});

describe('motor de recordatorios', () => {
  const cuidado = (o: Partial<CuidadoMascota>): CuidadoMascota => ({ id: 'c', petId: 'p1', memberId: 'm1', categoria: 'ANTIPULGAS', fecha: '2026-09-20', ...o });
  const base = {
    petId: 'p1', nombre: 'Nube', fechaNacimiento: '2020-11-02', activo: true, banoCadaDias: 30,
    vacunas: [
      { vacuna: 'Rabia', fecha: '2025-10-10', proximaDosis: '2026-10-10' },
      { vacuna: 'Polivalente (DHPPi)', fecha: '2026-01-05', proximaDosis: '2027-01-05' },
    ],
    cuidados: [cuidado({ id: 'c1', proxima: '2026-10-20' }), cuidado({ id: 'c2', categoria: 'BANO_ESTETICA', fecha: '2026-10-01' })],
    tratamientos: [trat()],
    tomas: [],
    pesos: [{ fecha: '2026-09-25' }],
    estados: [],
  };

  it('junta vacunas, preventivos, baño, medicamento, peso y cumpleaños de los próximos 30 días', () => {
    const r = recordatoriosMascota(base, '2026-10-18', '2026-10-18T09:00');
    expect(r.map((x) => [x.tipo, x.fecha, x.urgencia])).toEqual([
      ['VACUNA', '2026-10-10', 'VENCIDO'],
      ['MEDICAMENTO', '2026-10-18', 'HOY'],
      ['PREVENTIVO', '2026-10-20', 'PROXIMO'],
      ['PESO', '2026-10-25', 'PROXIMO'],
      ['BANO', '2026-10-31', 'PROXIMO'],
      ['CUMPLEANOS', '2026-11-02', 'PROXIMO'],
    ]);
    expect(r.find((x) => x.tipo === 'CUMPLEANOS')?.titulo).toBe('Nube cumple 6 años');
  });

  it('completar oculta ese ciclo; posponer mueve la fecha', () => {
    const r = recordatoriosMascota({
      ...base,
      estados: [
        { id: 'a', petId: 'p1', memberId: 'm1', clave: 'VACUNA:rabia:2026-10-10', tipo: 'VACUNA', titulo: '', estado: 'COMPLETADO', fecha: '2026-10-18' },
        { id: 'b', petId: 'p1', memberId: 'm1', clave: 'PREVENTIVO:ANTIPULGAS:2026-10-20', tipo: 'PREVENTIVO', titulo: '', estado: 'POSPUESTO', fecha: '2026-10-27' },
      ],
    }, '2026-10-18', '2026-10-18T09:00');
    expect(r.some((x) => x.tipo === 'VACUNA')).toBe(false);
    expect(r.find((x) => x.tipo === 'PREVENTIVO')).toMatchObject({ fecha: '2026-10-27', fechaOriginal: '2026-10-20', pospuesto: true });
  });

  it('una mascota inactiva no genera recordatorios; una edad estimada no tiene cumpleaños', () => {
    expect(recordatoriosMascota({ ...base, activo: false }, '2026-10-18')).toEqual([]);
    expect(recordatoriosMascota({ ...base, nacimientoAproximado: true }, '2026-10-18').some((x) => x.tipo === 'CUMPLEANOS')).toBe(false);
  });
});
