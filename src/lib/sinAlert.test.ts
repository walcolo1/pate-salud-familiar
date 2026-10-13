import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Bloque J · ningún `alert()` del navegador.
 *
 * Bloquean la pestaña, no se pueden leer bien con lector de pantalla —roban
 * el foco con un diálogo del sistema que no es de la aplicación— y no siguen
 * el tono ni el idioma del resto. El sistema de avisos (`useAviso`) los
 * sustituye: una región `role="status"` que se anuncia sin robar el foco.
 */

const RAIZ = join(process.cwd(), 'src');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e) ? [ruta] : [];
  });
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('sin alert()', () => {
  it('ningún fichero de la aplicación llama a alert()', () => {
    const donde = ficheros(RAIZ)
      .filter((f) => /(^|[^\w.])(window\.)?alert\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));
    expect(donde).toEqual([]);
  });
});
