import { describe, expect, it } from 'vitest';
import {
  buscarAnalito,
  calcularTendencia,
  codigoCanonico,
  construirComparativo,
  describirDelta,
  detectarEspecie,
  especieIncompatible,
  estadoFrenteARango,
  extraerFechaInforme,
  extraerLaboratorio,
  filaAResultado,
  filaDesdeExtraida,
  filaVacia,
  formatearRango,
  normalizarUnidad,
  parsearInforme,
  parsearLinea,
  parsearNumero,
  parsearRango,
  validarFila,
  MARCA_VERIFICACION,
  CATALOGO_ANALITOS,
} from './resultadosLaboratorio';

const INFORME_COLOMBIANO = `
LABORATORIO CLÍNICO COLCAN
NIT 800.123.456-7   Tel 601 555 1234
Paciente: JUAN PÉREZ        Cédula: 79.123.456
Sexo: M   Edad: 52 años     EPS: SANITAS
Fecha de ingreso: 10/03/2025
Fecha toma de muestra: 11/03/2025 07:15
QUÍMICA SANGUÍNEA
EXAMEN                      RESULTADO   UNIDADES   VALORES DE REFERENCIA
GLICEMIA BASAL               104.0      mg/dL      70 - 100
COLESTEROL TOTAL             193.0      mg/dL      80 - 200
HDL COLESTEROL               48.0       mg/dL  *   55 - 85
COLESTEROL LDL (Calculado)   118,6      mg/dL      Menor de 130
TRIGLICERIDOS                132        mg/dL      < 150
CREATININA EN SUERO          0.98       mg/dL      0.7 - 1.3
ÁCIDO ÚRICO                  6.1        mg/dL      3.5 - 7.2
TSH                          2.35       mUI/L      0.27 - 4.2
HEMOGLOBINA GLICOSILADA      5.9        %          4.0 - 5.6
PSA TOTAL                    1.10       ng/mL      0 - 4
HEMOGRAMA
HEMOGLOBINA                  15.2       g/dL       13.5 - 17.5
LEUCOCITOS                   6.8        x10^3/µL   4.5 - 11.0
PLAQUETAS                    250.000    /mm3       150.000 - 450.000
VIH 1-2                      NO REACTIVO           No reactivo
Página 1 de 2
Validado por: Bacterióloga Ana Gómez
`;

describe('catálogo y normalización', () => {
  it('lleva los sinónimos al mismo código canónico', () => {
    expect(codigoCanonico('Glicemia basal')).toBe('GLUCOSA');
    expect(codigoCanonico('Glucosa en suero')).toBe('GLUCOSA');
    expect(codigoCanonico('GLUCOSA (Enzimático)')).toBe('GLUCOSA');
    expect(codigoCanonico('Colesterol LDL')).toBe('COLESTEROL_LDL');
    expect(codigoCanonico('LDL-C')).toBe('COLESTEROL_LDL');
    expect(codigoCanonico('HDL COLESTEROL')).toBe('COLESTEROL_HDL');
    expect(codigoCanonico('TGP')).toBe('ALT');
    expect(codigoCanonico('Antígeno prostático específico')).toBe('PSA_TOTAL');
  });

  it('el sinónimo más largo gana: la HbA1c no es hemoglobina', () => {
    expect(codigoCanonico('Hemoglobina glicosilada')).toBe('HBA1C');
    expect(codigoCanonico('Hemoglobina')).toBe('HEMOGLOBINA');
    expect(codigoCanonico('Relación colesterol total / HDL')).toBe('INDICE_CT_HDL');
  });

  it('un nombre desconocido se agrupa por sí mismo y nunca con otro', () => {
    expect(codigoCanonico('Homocisteína')).toBe('OTRO:homocisteina');
    expect(codigoCanonico('homocisteina ')).toBe('OTRO:homocisteina');
  });

  it('los sinónimos cortos no se cuelan dentro de una frase', () => {
    // «k» de potasio o «na» de sodio sueltos dentro de otra cosa.
    expect(buscarAnalito('vitamina k dependiente')).toBeNull();
  });

  it('respeta la especie: el PSA no existe para una mascota ni el SDMA para una persona', () => {
    expect(codigoCanonico('PSA', 'MASCOTA')).toBe('OTRO:psa');
    expect(codigoCanonico('SDMA', 'HUMANO')).toBe('OTRO:sdma');
    expect(codigoCanonico('SDMA', 'MASCOTA')).toBe('SDMA');
  });

  it('no hay sinónimos repetidos entre analitos distintos', () => {
    const dueno = new Map<string, string>();
    for (const a of CATALOGO_ANALITOS) {
      for (const s of a.sinonimos) {
        const previo = dueno.get(s);
        expect(previo === undefined || previo === a.codigo, `${s}: ${previo} y ${a.codigo}`).toBe(true);
        dueno.set(s, a.codigo);
      }
    }
  });

  it('normaliza unidades solo para comparar', () => {
    expect(normalizarUnidad('mg/dL')).toBe(normalizarUnidad('MG/DL'));
    expect(normalizarUnidad('µUI/mL')).toBe(normalizarUnidad('uUI/ml'));
    expect(normalizarUnidad('x10^3/µL')).toBe(normalizarUnidad('10³/mm³'));
    expect(normalizarUnidad('mg/dL')).not.toBe(normalizarUnidad('mmol/L'));
  });
});

describe('números y rangos', () => {
  it('coma o punto decimal', () => {
    expect(parsearNumero('5,6')).toBe(5.6);
    expect(parsearNumero('5.6')).toBe(5.6);
    expect(parsearNumero('1.234,5')).toBe(1234.5);
    expect(parsearNumero('1,234.5')).toBe(1234.5);
    expect(parsearNumero('abc')).toBeNull();
  });

  it('separador de miles solo en recuentos', () => {
    expect(parsearNumero('250.000', true)).toBe(250000);
    expect(parsearNumero('1.200', false)).toBe(1.2);
    expect(parsearNumero('1.234.567')).toBe(1234567);
  });

  it('formas de rango de los informes', () => {
    expect(parsearRango('70 - 100')).toEqual({ min: 70, max: 100 });
    expect(parsearRango('(0.7-1.3)')).toEqual({ min: 0.7, max: 1.3 });
    expect(parsearRango('3,5 a 7,2')).toEqual({ min: 3.5, max: 7.2 });
    expect(parsearRango('< 150')).toEqual({ min: null, max: 150 });
    expect(parsearRango('Menor de 130')).toEqual({ min: null, max: 130 });
    expect(parsearRango('Hasta 5')).toEqual({ min: null, max: 5 });
    expect(parsearRango('> 40')).toEqual({ min: 40, max: null });
    expect(parsearRango('Mayor a 40')).toEqual({ min: 40, max: null });
    expect(parsearRango('Negativo')).toEqual({ min: null, max: null });
    expect(parsearRango('100 - 70')).toEqual({ min: null, max: null });
  });

  it('formatea el rango canónico y vuelve a leerlo igual', () => {
    for (const [min, max] of [[70, 100], [null, 200], [40, null]] as const) {
      expect(parsearRango(formatearRango(min, max))).toEqual({ min, max });
    }
    expect(formatearRango(null, null)).toBe('');
  });

  it('estado frente al rango, extremos incluidos', () => {
    expect(estadoFrenteARango(69.9, 70, 100)).toBe('BAJO');
    expect(estadoFrenteARango(70, 70, 100)).toBe('NORMAL');
    expect(estadoFrenteARango(100, 70, 100)).toBe('NORMAL');
    expect(estadoFrenteARango(100.1, 70, 100)).toBe('ALTO');
    expect(estadoFrenteARango(210, null, 200)).toBe('ALTO');
    expect(estadoFrenteARango(30, 40, null)).toBe('BAJO');
    expect(estadoFrenteARango(5, null, null)).toBe('SIN_RANGO');
    expect(estadoFrenteARango(null, null, null, 'No reactivo', 'No reactivo')).toBe('NORMAL');
    expect(estadoFrenteARango(null, null, null, 'Positivo', 'Negativo')).toBe('FUERA');
  });
});

describe('lector de informes', () => {
  it('lee el formato tabular habitual con marca de alerta', () => {
    const f = parsearLinea('HDL COLESTEROL 48.0 mg/dL * 55 - 85');
    expect(f).toMatchObject({
      codigo: 'COLESTEROL_HDL', valorNum: 48, unidad: 'mg/dL', rangoMin: 55, rangoMax: 85, confianza: 'ALTA',
    });
    expect(parsearLinea('COLESTEROL TOTAL 193.0 mg/dL 80 - 200')).toMatchObject({
      codigo: 'COLESTEROL_TOTAL', valorNum: 193, rangoMin: 80, rangoMax: 200,
    });
  });

  it('nombres con dígitos y con dos puntos', () => {
    expect(parsearLinea('T4 LIBRE 1.2 ng/dL 0.8 - 1.8')).toMatchObject({ codigo: 'T4_LIBRE', valorNum: 1.2 });
    expect(parsearLinea('Glucosa: 95 mg/dL (70-100)')).toMatchObject({ codigo: 'GLUCOSA', valorNum: 95, rangoMax: 100 });
    expect(parsearLinea('Vitamina B12 350 pg/mL 200 - 900')).toMatchObject({ codigo: 'VITAMINA_B12', valorNum: 350 });
  });

  it('descarta líneas que no son resultados', () => {
    expect(parsearLinea('Edad: 52 años')).toBeNull();
    expect(parsearLinea('Tel 601 555 1234')).toBeNull();
    expect(parsearLinea('Página 1 de 2')).toBeNull();
    expect(parsearLinea('Fecha toma de muestra: 11/03/2025')).toBeNull();
  });

  it('un nombre desconocido solo entra con unidad Y rango, y con confianza baja', () => {
    expect(parsearLinea('HOMOCISTEINA 9.1 umol/L 5 - 15')).toMatchObject({ codigo: null, confianza: 'BAJA' });
    expect(parsearLinea('Consultorio 302 piso 4')).toBeNull();
  });

  it('valores cualitativos', () => {
    // «VIH» no está en el catálogo: no se inventa.
    expect(parsearLinea('VIH 1-2 NO REACTIVO No reactivo')).toBeNull();
  });

  it('lee un informe colombiano completo', () => {
    const inf = parsearInforme(INFORME_COLOMBIANO, 'HUMANO');
    const por = Object.fromEntries(inf.filas.map((f) => [f.codigo, f]));
    expect(Object.keys(por)).toEqual(expect.arrayContaining([
      'GLUCOSA', 'COLESTEROL_TOTAL', 'COLESTEROL_HDL', 'COLESTEROL_LDL', 'TRIGLICERIDOS',
      'CREATININA', 'ACIDO_URICO', 'TSH', 'HBA1C', 'PSA_TOTAL', 'HEMOGLOBINA', 'LEUCOCITOS', 'PLAQUETAS',
    ]));
    expect(por.GLUCOSA).toMatchObject({ valorNum: 104, rangoMin: 70, rangoMax: 100 });
    expect(por.COLESTEROL_LDL).toMatchObject({ valorNum: 118.6, rangoMin: null, rangoMax: 130 });
    expect(por.HBA1C).toMatchObject({ valorNum: 5.9, unidad: '%' });
    expect(por.LEUCOCITOS).toMatchObject({ valorNum: 6.8, rangoMin: 4.5, rangoMax: 11 });
    expect(por.PLAQUETAS).toMatchObject({ valorNum: 250000, rangoMin: 150000, rangoMax: 450000 });
    expect(por.TSH).toMatchObject({ unidad: 'mUI/L' });
    expect(inf.fecha).toBe('2025-03-11');
    expect(inf.laboratorio).toBe('LABORATORIO CLÍNICO COLCAN');
    expect(inf.especieDetectada).toBe('HUMANO');
    expect(inf.avisos).toEqual([]);
  });

  it('el mismo texto da siempre las mismas filas', () => {
    expect(parsearInforme(INFORME_COLOMBIANO)).toEqual(parsearInforme(INFORME_COLOMBIANO));
  });

  it('formato de Sanidad Militar con fecha en letras', () => {
    const texto = [
      'DIRECCIÓN DE SANIDAD EJÉRCITO',
      'Establecimiento de Sanidad Militar 5001',
      'Fecha de toma: 3 de febrero de 2026',
      'GLUCOSA EN SUERO        88        mg/dl     74 - 106',
      'CREATININA              1,05      mg/dl     0,67 - 1,17',
    ].join('\n');
    const inf = parsearInforme(texto);
    expect(inf.fecha).toBe('2026-02-03');
    expect(inf.laboratorio).toMatch(/SANIDAD/);
    expect(inf.filas.map((f) => [f.codigo, f.valorNum])).toEqual([['GLUCOSA', 88], ['CREATININA', 1.05]]);
  });

  it('prefiere la fecha de toma de muestra a la de impresión', () => {
    expect(extraerFechaInforme('Fecha de impresión: 2025-04-01\nFecha de toma: 28/03/2025')).toBe('2025-03-28');
    expect(extraerFechaInforme('Fecha: 12-MAR-2025')).toBe('2025-03-12');
    expect(extraerFechaInforme('Fecha: 31/02/2025')).toBeNull();
  });

  it('laboratorio por etiqueta', () => {
    expect(extraerLaboratorio('Laboratorio: Synlab Colombia\nGLUCOSA 90 mg/dL')).toBe('Synlab Colombia');
  });

  it('sin resultados lo dice en vez de devolver una lista vacía muda', () => {
    const inf = parsearInforme('Gracias por su visita');
    expect(inf.filas).toEqual([]);
    expect(inf.avisos.join(' ')).toMatch(/No se reconoció/);
  });
});

describe('especie', () => {
  const VETERINARIO = [
    'CLÍNICA VETERINARIA HUELLITAS',
    'Paciente: Toby   Especie: Canino   Raza: Beagle',
    'Propietario: Laura',
    'GLUCOSA 98 mg/dL 74 - 143',
    'SDMA 12 ug/dL 0 - 14',
  ].join('\n');

  it('detecta el informe veterinario', () => {
    expect(detectarEspecie(VETERINARIO).especie).toBe('MASCOTA');
    expect(detectarEspecie(INFORME_COLOMBIANO).especie).toBe('HUMANO');
  });

  it('un informe veterinario no puede ir a la ficha de una persona', () => {
    const inf = parsearInforme(VETERINARIO, 'HUMANO');
    expect(especieIncompatible(inf, 'HUMANO')).toBe(true);
    expect(inf.avisos.join(' ')).toMatch(/veterinario/);
    // El SDMA es solo de mascotas: no se propone para una persona.
    expect(inf.filas.some((f) => f.analito.toUpperCase() === 'SDMA')).toBe(false);
  });

  it('en la ficha de la mascota sí entra', () => {
    const inf = parsearInforme(VETERINARIO, 'MASCOTA');
    expect(especieIncompatible(inf, 'MASCOTA')).toBe(false);
    expect(inf.filas.map((f) => f.codigo)).toEqual(['GLUCOSA', 'SDMA']);
  });
});

describe('bandeja de verificación', () => {
  it('convierte una fila extraída y la guarda en el formato de la hoja', () => {
    const extraida = parsearLinea('HDL COLESTEROL 48.0 mg/dL * 55 - 85')!;
    const fila = filaDesdeExtraida(extraida, 'f1');
    expect(fila).toMatchObject({ analito: 'HDL COLESTEROL', valor: '48', unidad: 'mg/dL', min: '55', max: '85', origen: 'ALTA' });
    const r = filaAResultado(fila, '2026-10-18');
    expect(r).toEqual({
      parameterName: 'HDL COLESTEROL',
      value: '48',
      unit: 'mg/dL',
      referenceRange: '55 - 85',
      isAbnormal: true,
      extractionConfidence: 'ALTA',
      verifiedBy: `${MARCA_VERIFICACION}:2026-10-18`,
    });
  });

  it('una fila corregida a mano lo deja dicho', () => {
    const fila = { ...filaDesdeExtraida(parsearLinea('GLUCOSA 95 mg/dL 70 - 100')!, 'f'), valor: '59', editada: true };
    expect(filaAResultado(fila, 'x')).toMatchObject({ value: '59', isAbnormal: true, extractionConfidence: 'CORREGIDO' });
  });

  it('una fila manual con valor cualitativo', () => {
    const fila = { ...filaVacia('m'), analito: 'Antígeno de superficie', valor: 'Negativo', min: 'Negativo' };
    expect(validarFila(fila)).toEqual({ estado: 'NORMAL', errores: [] });
    expect(filaAResultado(fila, 'x')).toMatchObject({ referenceRange: 'Negativo', isAbnormal: false, extractionConfidence: 'MANUAL' });
  });

  it('señala lo que impide guardar', () => {
    expect(validarFila(filaVacia('v')).errores).toEqual(['Falta el analito.', 'Falta el valor.']);
    const sinUnidad = { ...filaVacia('u'), analito: 'Glucosa', valor: '90' };
    expect(validarFila(sinUnidad).errores.join(' ')).toMatch(/unidad/);
    const alReves = { ...filaVacia('r'), analito: 'Glucosa', valor: '90', unidad: 'mg/dL', min: '100', max: '70' };
    expect(validarFila(alReves).errores.join(' ')).toMatch(/mínimo es mayor/);
  });
});

describe('comparativo histórico', () => {
  const examenes = [
    { id: 'e1', memberId: 'm1', examName: 'Perfil lipídico', orderedDate: '2024-03-01' },
    { id: 'e2', memberId: 'm1', examName: 'Perfil lipídico', orderedDate: '2025-03-01', performedDate: '2025-03-11' },
    { id: 'e3', memberId: 'm1', examName: 'Control', orderedDate: '2026-02-03' },
    { id: 'eX', memberId: 'otro', examName: 'Ajeno', orderedDate: '2026-01-01' },
    { id: 'e0', memberId: 'm1', examName: 'Sin valores', orderedDate: '2026-05-01' },
  ];
  const r = (id: string, examId: string, parameterName: string, value: string, unit: string, referenceRange: string) =>
    ({ id, examId, parameterName, value, unit, referenceRange, verifiedBy: 'REVISION_HUMANA:2026-01-01' });
  const resultados = {
    e1: [r('1', 'e1', 'Colesterol total', '210', 'mg/dL', '< 200'), r('2', 'e1', 'Glicemia basal', '5.2', 'mmol/L', '3.9 - 5.6')],
    e2: [r('3', 'e2', 'COLESTEROL TOTAL', '193', 'mg/dl', '80 - 200'), r('4', 'e2', 'Glucosa en suero', '104', 'mg/dL', '70 - 100')],
    e3: [r('5', 'e3', 'Colesterol', '180', 'mg/dL', '< 200'), r('6', 'e3', 'Glucosa', '92', 'mg/dL', '70 - 100')],
    eX: [r('7', 'eX', 'Glucosa', '300', 'mg/dL', '70 - 100')],
    e0: [],
  };

  const comp = construirComparativo(examenes, resultados, 'm1');
  const serie = (clave: string) => comp.series.find((s) => s.clave === clave)!;

  it('columnas: solo exámenes del paciente con valores, del más antiguo al más reciente', () => {
    expect(comp.columnas.map((c) => [c.examId, c.fecha])).toEqual([
      ['e1', '2024-03-01'], ['e2', '2025-03-11'], ['e3', '2026-02-03'],
    ]);
  });

  it('agrupa por analito canónico y unidad; nunca cruza unidades', () => {
    expect(comp.series.map((s) => s.clave)).toEqual([
      'GLUCOSA|mg/dl', 'GLUCOSA|mmol/l', 'COLESTEROL_TOTAL|mg/dl',
    ]);
    const glucosaMg = serie('GLUCOSA|mg/dl');
    expect(glucosaMg.puntos.map((p) => p.valorNum)).toEqual([104, 92]);
    expect(glucosaMg.otrasUnidades).toEqual(['mmol/L']);
    // La serie en mmol/L tiene un único dato: sin Δ.
    expect(serie('GLUCOSA|mmol/l').delta).toBeNull();
    expect(serie('GLUCOSA|mmol/l').tendencia).toBe('INSUFICIENTE');
  });

  it('Δ, Δ %, cruce de rango y tendencia', () => {
    const glucosa = serie('GLUCOSA|mg/dl');
    expect(glucosa.delta).toBe(-12);
    expect(glucosa.deltaPct).toBeCloseTo(-11.5385, 3);
    expect(glucosa.cruce).toEqual({ de: 'ALTO', a: 'NORMAL' });
    expect(glucosa.tendencia).toBe('BAJANDO');

    const colesterol = serie('COLESTEROL_TOTAL|mg/dl');
    expect(colesterol.puntos.map((p) => p.estado)).toEqual(['ALTO', 'NORMAL', 'NORMAL']);
    expect(colesterol.delta).toBe(-13);
    expect(colesterol.cruce).toBeNull();
    expect(colesterol.tendencia).toBe('BAJANDO');
  });

  it('limita el número de exámenes al más reciente', () => {
    expect(construirComparativo(examenes, resultados, 'm1', { maxExamenes: 2 }).columnas.map((c) => c.examId))
      .toEqual(['e2', 'e3']);
  });

  it('tendencia determinista con umbral de estabilidad', () => {
    expect(calcularTendencia([100])).toBe('INSUFICIENTE');
    expect(calcularTendencia([100, 103])).toBe('ESTABLE');
    expect(calcularTendencia([100, 110])).toBe('SUBIENDO');
    expect(calcularTendencia([100, 104, 98, 101])).toBe('ESTABLE');
    expect(calcularTendencia([100, 120, 90, 101])).toBe('BAJANDO');
    expect(calcularTendencia([0, 0])).toBe('ESTABLE');
    expect(calcularTendencia([0, 1])).toBe('SUBIENDO');
  });

  it('describe el Δ con signo', () => {
    expect(describirDelta(-12, -11.5385)).toBe('−12 (−11,5 %)');
    expect(describirDelta(5, null)).toBe('+5');
    expect(describirDelta(null, null)).toBe('—');
  });
});
