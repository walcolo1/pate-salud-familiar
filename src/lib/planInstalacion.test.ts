import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARPETA_RAIZ,
  CLAVE_ID_HOJA,
  DISPARADORES,
  DIAS_RETENCION_TEMPORAL,
  FUNCION_MENU_SIMPLE,
  LIMITE_EJECUCION_MS,
  SEMILLA_CATALOGO_VACUNAS,
  SEMILLA_DOMINIOS,
  SUBCARPETAS,
  UMBRAL_ALERTA_MS,
  carpetasQueFaltan,
  encabezadosDe,
  filasCatalogoVacunas,
  filasDominios,
  pestanasQueFaltan,
  planDeDisparadores,
  veredictoDuracion,
} from './planInstalacion';
import { NOMBRES_PESTANAS, pestanaPorNombre } from './esquemaHoja';

/**
 * Las decisiones del instalador, probadas sin abrir un navegador.
 *
 * Lo que estas pruebas NO pueden decir es si las llamadas a Google funcionan.
 * Eso lo dice una ejecución real, y por eso E2 tiene además una validación
 * manual con su guion. Aquí se fija lo que se puede fijar: que el plan sea
 * correcto antes de que alguien lo ejecute sobre su Drive.
 */

describe('pestañas que faltan', () => {
  it('en una hoja recién copiada, faltan las 21', () => {
    // Una hoja nueva trae «Hoja 1» y nada más.
    expect(pestanasQueFaltan(['Hoja 1'])).toHaveLength(21);
  });

  it('en una hoja ya instalada, no falta ninguna', () => {
    expect(pestanasQueFaltan(NOMBRES_PESTANAS)).toEqual([]);
  });

  it('una instalación a medias se completa con lo que falte', () => {
    const aMedias = NOMBRES_PESTANAS.slice(0, 5);
    const faltan = pestanasQueFaltan(aMedias);
    expect(faltan).toHaveLength(16);
    expect(faltan).not.toContain(NOMBRES_PESTANAS[0]);
    expect(faltan[0]).toBe(NOMBRES_PESTANAS[5]);
  });

  it('respeta el orden del esquema, no el de la hoja', () => {
    // Si alguien reordenó las pestañas a mano, las que falten se crean donde
    // les toca por esquema, no al final de lo que hubiera.
    const desordenada = [...NOMBRES_PESTANAS].reverse().slice(0, 3);
    const faltan = pestanasQueFaltan(desordenada);
    const esperado = NOMBRES_PESTANAS.filter((n) => !desordenada.includes(n));
    expect(faltan).toEqual(esperado);
  });

  it('con una lista ausente no se rompe', () => {
    expect(pestanasQueFaltan(undefined as never)).toHaveLength(21);
  });
});

describe('encabezados de una pestaña', () => {
  it('devuelve los del esquema', () => {
    expect(encabezadosDe('ACCESO')).toEqual([...pestanaPorNombre('ACCESO')!.encabezados]);
  });

  it('devuelve una copia, no la lista viva', () => {
    // Un instalador que ordenara o recortara la lista devuelta corrompería el
    // esquema para todo lo que viniera después en la misma ejecución.
    const copia = encabezadosDe('ACCESO')!;
    copia.push('columna_intrusa');
    expect(encabezadosDe('ACCESO')).not.toContain('columna_intrusa');
  });

  it('con un nombre que no existe devuelve null, no una lista vacía', () => {
    // Vacío y «no existe» son cosas distintas: crear una pestaña sin
    // encabezados por una errata en el nombre es peor que fallar.
    expect(encabezadosDe('PESTAÑA_INVENTADA')).toBeNull();
  });
});

describe('árbol de Drive', () => {
  it('son tres carpetas, con nombres estables', () => {
    expect([...SUBCARPETAS]).toEqual(['Documentos', 'Respaldos', 'Temporal']);
    expect(CARPETA_RAIZ).toBe('Paté · Salud Familiar');
  });

  it('en un Drive limpio hay que crear las tres', () => {
    expect(carpetasQueFaltan([])).toHaveLength(3);
  });

  it('no recrea las que ya están', () => {
    expect(carpetasQueFaltan(['Documentos', 'Temporal'])).toEqual(['Respaldos']);
  });

  it('la carpeta Temporal tiene una política de vaciado, no solo un nombre', () => {
    // Una carpeta «temporal» sin retención escrita es donde se quedan
    // documentos de pacientes para siempre.
    expect(SUBCARPETAS).toContain('Temporal');
    expect(DIAS_RETENCION_TEMPORAL).toBeGreaterThan(0);
    expect(DIAS_RETENCION_TEMPORAL).toBeLessThanOrEqual(30);
  });
});

describe('plan de disparadores', () => {
  it('son tres, y ninguno repite función', () => {
    // La cuota es de 20 por script. Tres fijos dejan sitio de sobra; un
    // disparador por orden médica no cabría.
    expect(DISPARADORES).toHaveLength(3);
    const funciones = DISPARADORES.map((d) => d.funcion);
    expect(new Set(funciones).size).toBe(3);
  });

  it('en un proyecto limpio no borra nada y crea los tres', () => {
    const plan = planDeDisparadores([]);
    expect(plan.aBorrar).toEqual([]);
    expect(plan.aCrear).toHaveLength(3);
  });

  it('reejecutar NO duplica: borra los suyos antes de crearlos', () => {
    // Es el criterio 4 que E0-bis traspasó a E2. Con tres disparadores ya
    // puestos, una segunda pasada los borra y vuelve a dejar tres.
    const yaPuestos = DISPARADORES.map((d) => d.funcion);
    const plan = planDeDisparadores(yaPuestos);
    expect(plan.aBorrar).toEqual(yaPuestos);
    expect(plan.aCrear).toHaveLength(3);
    const despues = yaPuestos.length - plan.aBorrar.length + plan.aCrear.length;
    expect(despues).toBe(3);
  });

  it('si una instalación anterior duplicó uno, esta pasada lo deja en uno', () => {
    const duplicado = ['tareaDiaria', 'tareaDiaria', 'tareaDiaria'];
    const plan = planDeDisparadores(duplicado);
    expect(plan.aBorrar).toHaveLength(3);
    expect(plan.aCrear.filter((d) => d.funcion === 'tareaDiaria')).toHaveLength(1);
  });

  it('no toca los disparadores que puso otra persona', () => {
    // Borrar un disparador ajeno es tomar una decisión sobre el proyecto de
    // alguien más. Se dejan, y se informa de ellos.
    const plan = planDeDisparadores(['tareaDiaria', 'miMacroPersonal']);
    expect(plan.aBorrar).toEqual(['tareaDiaria']);
    expect(plan.ajenos).toEqual(['miMacroPersonal']);
  });

  it('NO instala un disparador sobre `onOpen`', () => {
    // `Instalador.gs` ya define un `onOpen` simple que Apps Script ejecuta
    // solo. Un disparador instalable encima construiría el menú dos veces en
    // cada apertura.
    expect(DISPARADORES.map((d) => d.funcion)).not.toContain(FUNCION_MENU_SIMPLE);
  });

  it('el diario corre de madrugada, antes de que nadie abra la aplicación', () => {
    const diario = DISPARADORES.find((d) => d.tipo === 'DIARIO')!;
    expect(diario.hora).toBeGreaterThanOrEqual(0);
    expect(diario.hora).toBeLessThan(12);
  });

  it('cada disparador dice para qué está', () => {
    // Un disparador sin motivo escrito es un disparador que nadie se atreve a
    // borrar dentro de un año.
    for (const d of DISPARADORES) {
      expect(d.motivo.length, d.funcion).toBeGreaterThan(20);
    }
  });
});

describe('semillas', () => {
  it('los dominios se siembran activos y con etiqueta legible', () => {
    const filas = filasDominios('2026-09-11T00:00:00.000Z');
    expect(filas).toHaveLength(SEMILLA_DOMINIOS.length);
    expect(filas[0][3]).toBe('SI');
    expect(filas[0][2].length).toBeGreaterThan(0);
  });

  it('cada fila de semilla encaja con los encabezados de su pestaña', () => {
    // Sembrar una fila más corta o más larga que la cabecera desplaza columnas
    // en silencio, y el error aparece cuando alguien lee un dato en el sitio
    // de otro.
    expect(filasDominios('x')[0]).toHaveLength(encabezadosDe('DOMINIOS_AUTORIZADOS')!.length);
    expect(filasCatalogoVacunas()[0]).toHaveLength(encabezadosDe('CATALOGO_VACUNAS')!.length);
  });

  it('los identificadores de semilla son únicos y se reconocen como tales', () => {
    const ids = [...filasDominios('x'), ...filasCatalogoVacunas()].map((f) => f[0]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toContain('semilla');
  });

  it('el catálogo cubre perro y gato, y no declara nada obligatorio por su cuenta', () => {
    const especies = new Set(SEMILLA_CATALOGO_VACUNAS.map((v) => v[0]));
    expect(especies).toContain('PERRO');
    expect(especies).toContain('GATO');

    // El catálogo es una referencia para no escribir el nombre a mano, no una
    // pauta clínica. Quien decide es el veterinario.
    for (const fila of filasCatalogoVacunas()) {
      expect(fila[5]).toBe('NO');
    }
  });

  it('ninguna semilla trae datos de una familia real', () => {
    const texto = JSON.stringify([...SEMILLA_DOMINIOS, ...SEMILLA_CATALOGO_VACUNAS]);
    expect(texto).not.toContain('@gmail.com');
    expect(texto).not.toMatch(/\d{6,}/);
  });
});

describe('duración de la instalación', () => {
  it('el límite y el umbral están donde dice la cuota de Google', () => {
    expect(LIMITE_EJECUCION_MS).toBe(360_000);
    expect(UMBRAL_ALERTA_MS).toBeLessThan(LIMITE_EJECUCION_MS);
  });

  it('clasifica lo medido en tres tramos', () => {
    expect(veredictoDuracion(12_000)).toBe('HOLGADO');
    expect(veredictoDuracion(90_000)).toBe('ACEPTABLE');
    expect(veredictoDuracion(200_000)).toBe('PARTIR');
  });

  it('avisa mucho antes del límite, no cuando ya se pasó', () => {
    // Si el veredicto llegara a los 6 minutos, lo daría la familia que se
    // quedó a medias, no nosotros.
    expect(veredictoDuracion(LIMITE_EJECUCION_MS - 1)).toBe('PARTIR');
    expect(UMBRAL_ALERTA_MS).toBeLessThanOrEqual(LIMITE_EJECUCION_MS / 2);
  });
});

describe('el Instalacion.gs generado', () => {
  it('lleva las funciones que el instalador va a llamar', () => {
    const gs = readFileSync(
      join(__dirname, '..', '..', 'apps-script', 'plantilla', 'Instalacion.gs'),
      'utf8',
    );
    for (const fn of [
      'function pestanasQueFaltan',
      'function encabezadosDe',
      'function carpetasQueFaltan',
      'function planDeDisparadores',
      'function filasDominios',
      'function filasCatalogoVacunas',
      'function veredictoDuracion',
    ]) {
      expect(gs, fn).toContain(fn);
    }
    expect(gs).toContain(`var CLAVE_ID_HOJA = '${CLAVE_ID_HOJA}'`);
  });
});
