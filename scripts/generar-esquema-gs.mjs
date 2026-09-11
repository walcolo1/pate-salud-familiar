/**
 * Genera `apps-script/plantilla/Esquema.gs` desde `src/lib/esquemaHoja.ts`.
 *
 * POR QUÉ UN GENERADOR Y NO DOS FICHEROS
 * ──────────────────────────────────────
 * El instalador de Apps Script y la PWA necesitan la misma estructura de
 * pestañas, y no comparten ejecución: uno corre en los servidores de Google y
 * el otro en un navegador. Dos copias de una estructura de 21 tablas divergen;
 * no es una posibilidad, es cuestión de tiempo.
 *
 * Así que hay una definición —la de TypeScript, que se puede probar— y el `.gs`
 * se deriva. `esquemaHoja.test.ts` comprueba que el fichero generado coincide
 * con lo que este script produciría hoy: si alguien edita el `.gs` a mano o
 * cambia el `.ts` sin regenerar, la prueba lo dice.
 *
 *   node scripts/generar-esquema-gs.mjs            escribe el fichero
 *   node scripts/generar-esquema-gs.mjs --revisar  solo comprueba, sin escribir
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ORIGEN = join(RAIZ, 'src', 'lib', 'esquemaHoja.ts');
const DESTINO = join(RAIZ, 'apps-script', 'plantilla', 'Esquema.gs');

/**
 * Lee la definición sin compilar TypeScript.
 *
 * El fichero de origen es deliberadamente declarativo —literales, sin lógica—
 * así que basta con recortar los tipos. Evita meter un compilador en la cadena
 * de construcción para generar un fichero de texto.
 */
async function leerEsquema() {
  const fuente = readFileSync(ORIGEN, 'utf8');
  const js = fuente
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export interface[\s\S]*?^}\n/gm, '')
    .replace(/:\s*readonly string\[\]/g, '')
    .replace(/:\s*readonly DefinicionPestana\[\]/g, '')
    .replace(/:\s*DefinicionPestana \| null/g, '')
    .replace(/\(nombre: string\)/g, '(nombre)')
    .replace(/\(\.\.\.campos: string\[\]\)/g, '(...campos)')
    .replace(/ as const/g, '')
    .replace(/^export /gm, '');

  const modulo = `${js}\nexport { PESTANAS, COLUMNAS_SINCRONIZACION, VERSION_ESQUEMA };`;
  const url = `data:text/javascript;base64,${Buffer.from(modulo, 'utf8').toString('base64')}`;
  return import(url);
}

function generar({ PESTANAS, COLUMNAS_SINCRONIZACION, VERSION_ESQUEMA }) {
  const lineas = [];
  lineas.push('/**');
  lineas.push(' * Esquema de la hoja del titular — GENERADO, NO EDITAR A MANO.');
  lineas.push(' *');
  lineas.push(' * Origen:  src/lib/esquemaHoja.ts');
  lineas.push(' * Genera:  node scripts/generar-esquema-gs.mjs');
  lineas.push(' *');
  lineas.push(' * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí');
  lineas.push(' * hace que la próxima ejecución del generador lo pise sin avisar.');
  lineas.push(' */');
  lineas.push('');
  lineas.push(`var VERSION_ESQUEMA = ${VERSION_ESQUEMA};`);
  lineas.push('');
  lineas.push('/** Columnas de cierre, iguales en toda tabla de datos. */');
  lineas.push(
    `var COLUMNAS_SINCRONIZACION = [${COLUMNAS_SINCRONIZACION.map((c) => `'${c}'`).join(', ')}];`,
  );
  lineas.push('');
  lineas.push('/** Las pestañas, en el orden en que se crean. */');
  lineas.push('var PESTANAS = [');

  for (const p of PESTANAS) {
    lineas.push('  {');
    lineas.push(`    nombre: '${p.nombre}',`);
    lineas.push(`    // ${p.descripcion}`);
    lineas.push('    encabezados: [');
    for (const h of p.encabezados) lineas.push(`      '${h}',`);
    lineas.push('    ],');
    lineas.push('  },');
  }

  lineas.push('];');
  lineas.push('');
  lineas.push('/** Los nombres, en el mismo orden. */');
  lineas.push('function nombresDePestanas() {');
  lineas.push('  return PESTANAS.map(function (p) { return p.nombre; });');
  lineas.push('}');
  lineas.push('');
  lineas.push('/** La definición de una pestaña, o null si no existe. */');
  lineas.push('function pestanaPorNombre(nombre) {');
  lineas.push('  for (var i = 0; i < PESTANAS.length; i++) {');
  lineas.push('    if (PESTANAS[i].nombre === nombre) return PESTANAS[i];');
  lineas.push('  }');
  lineas.push('  return null;');
  lineas.push('}');
  lineas.push('');

  return lineas.join('\n');
}

const esquema = await leerEsquema();
const contenido = generar(esquema);

if (process.argv.includes('--revisar')) {
  let actual = '';
  try {
    actual = readFileSync(DESTINO, 'utf8');
  } catch {
    console.error('generar-esquema-gs: el fichero generado no existe todavía.');
    process.exit(1);
  }
  if (actual !== contenido) {
    console.error(
      'generar-esquema-gs: Esquema.gs NO coincide con esquemaHoja.ts. Ejecuta `node scripts/generar-esquema-gs.mjs`.',
    );
    process.exit(1);
  }
  console.log('generar-esquema-gs: Esquema.gs está al día.');
} else {
  writeFileSync(DESTINO, contenido, 'utf8');
  console.log(`generar-esquema-gs: escrito ${DESTINO} (${esquema.PESTANAS.length} pestañas).`);
}

export { generar, leerEsquema };
