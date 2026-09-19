import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ORDEN_CONSOLIDADO,
  colisiones,
  consolidar,
  desajustesDeOrden,
  nombresGlobales,
  type FicheroGs,
} from './consolidarPlantilla';

const PLANTILLA = join(process.cwd(), 'apps-script', 'plantilla');

function leerPlantilla(): FicheroGs[] {
  return readdirSync(PLANTILLA)
    .filter((n) => n.endsWith('.gs'))
    .map((nombre) => ({ nombre, codigo: readFileSync(join(PLANTILLA, nombre), 'utf8') }));
}

describe('nombresGlobales', () => {
  it('coge var, let, const y function en la primera columna', () => {
    const codigo = ['var UNO = 1;', 'const DOS = 2;', 'let TRES;', 'function cuatro() {}'].join(
      '\n',
    );
    expect(nombresGlobales(codigo)).toEqual(['UNO', 'DOS', 'TRES', 'cuatro']);
  });

  it('lo indentado NO cuenta: vive dentro de una función y no colisiona', () => {
    const codigo = ['function f() {', '  var interna = 1;', '  function otra() {}', '}'].join('\n');
    expect(nombresGlobales(codigo)).toEqual(['f']);
  });

  it('no confunde un nombre que empieza igual', () => {
    expect(nombresGlobales('variable_suelta = 1;')).toEqual([]);
    expect(nombresGlobales('functionary();')).toEqual([]);
  });
});

describe('colisiones', () => {
  it('encuentra el mismo nombre en dos ficheros', () => {
    // Este es el fallo que ya apareció dos veces en el bloque E: dos `var` con
    // el mismo nombre en ficheros distintos NO dan error en Apps Script. Gana
    // el último que se cargue, en silencio.
    const choque = colisiones([
      { nombre: 'A.gs', codigo: 'var ROLES = 1;' },
      { nombre: 'B.gs', codigo: 'var ROLES = 2;' },
    ]);
    expect(choque).toEqual([{ nombre: 'ROLES', ficheros: ['A.gs', 'B.gs'] }]);
  });

  it('también dentro de un mismo fichero', () => {
    expect(colisiones([{ nombre: 'A.gs', codigo: 'var X = 1;\nvar X = 2;' }])).toHaveLength(1);
  });

  it('una función y una variable con el mismo nombre también chocan', () => {
    const choque = colisiones([
      { nombre: 'A.gs', codigo: 'function alcanza() {}' },
      { nombre: 'B.gs', codigo: 'var alcanza = 1;' },
    ]);
    expect(choque.map((c) => c.nombre)).toEqual(['alcanza']);
  });

  it('sin repetidos, no dice nada', () => {
    expect(
      colisiones([
        { nombre: 'A.gs', codigo: 'var UNO = 1;' },
        { nombre: 'B.gs', codigo: 'var DOS = 2;' },
      ]),
    ).toEqual([]);
  });
});

describe('desajustesDeOrden', () => {
  it('avisa del fichero nuevo que nadie añadió al orden', () => {
    const r = desajustesDeOrden([...ORDEN_CONSOLIDADO, 'Nuevo.gs']);
    expect(r.sinOrden).toEqual(['Nuevo.gs']);
    expect(r.faltan).toEqual([]);
  });

  it('avisa del que falta', () => {
    const r = desajustesDeOrden(ORDEN_CONSOLIDADO.slice(1));
    expect(r.faltan).toEqual([ORDEN_CONSOLIDADO[0]]);
  });
});

describe('consolidar', () => {
  it('mete todos los cuerpos y dice que está generado', () => {
    const salida = consolidar(
      [
        { nombre: 'A.gs', codigo: 'var UNO = 1;' },
        { nombre: 'B.gs', codigo: 'var DOS = 2;' },
      ],
      '2026-09-19',
    );
    expect(salida).toMatch(/GENERADO\. No se edita aquí\./);
    expect(salida).toContain('var UNO = 1;');
    expect(salida).toContain('var DOS = 2;');
    expect(salida.indexOf('var UNO')).toBeLessThan(salida.indexOf('var DOS'));
  });

  it('cada cuerpo lleva el nombre del fichero del que salió', () => {
    // Sin esto, un error en la línea 900 del consolidado no se sabe de dónde
    // viene, y el editor de Apps Script solo da el número de línea.
    const salida = consolidar([{ nombre: 'Router.gs', codigo: 'var X = 1;' }], '2026-09-19');
    expect(salida).toMatch(/\/\/ Router\.gs/);
  });
});

describe('la plantilla real', () => {
  it('no tiene NINGÚN nombre global declarado dos veces', () => {
    // El trinquete. Dos `var` iguales en Apps Script no fallan: uno pisa al
    // otro según el orden de carga, y el síntoma aparece lejos de la causa.
    const choques = colisiones(leerPlantilla());
    const descripcion = choques.map((c) => `${c.nombre} en ${c.ficheros.join(' y ')}`).join('; ');
    expect(choques, `nombres declarados más de una vez: ${descripcion}`).toEqual([]);
  });

  it('el orden de consolidación nombra exactamente los ficheros que hay', () => {
    // Si alguien añade un `.gs` y no lo mete en el orden, el consolidado sale
    // sin él y el despliegue se queda a medias sin que nada falle aquí.
    const r = desajustesDeOrden(leerPlantilla().map((f) => f.nombre));
    expect(r.faltan, `faltan en la carpeta: ${r.faltan.join(', ')}`).toEqual([]);
    expect(r.sinOrden, `sin sitio en ORDEN_CONSOLIDADO: ${r.sinOrden.join(', ')}`).toEqual([]);
  });

  it('define doPost una sola vez, y es la única puerta', () => {
    const globales = leerPlantilla().flatMap((f) => nombresGlobales(f.codigo));
    expect(globales.filter((n) => n === 'doPost')).toHaveLength(1);
  });
});
