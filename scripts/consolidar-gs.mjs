/**
 * Junta los `.gs` de la plantilla en un solo fichero para pegar en el editor.
 *
 *   node scripts/consolidar-gs.mjs
 *
 * Escribe `apps-script/dist/Pate.gs`, que **no se versiona**: es una derivada
 * de ficheros que sí están en el repositorio, y versionarla solo crearía una
 * copia que se queda atrás.
 *
 * Antes de escribir nada comprueba que no haya dos declaraciones globales con
 * el mismo nombre. En Apps Script eso no da error: gana la última que se cargue
 * y el fallo aparece lejos de la causa. Ya ocurrió dos veces en este bloque.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarModuloTs } from './cargar-ts.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const PLANTILLA = join(RAIZ, 'apps-script', 'plantilla');
const DESTINO = join(RAIZ, 'apps-script', 'dist');

const { ORDEN_CONSOLIDADO, colisiones, consolidar, desajustesDeOrden } = await cargarModuloTs(
  join(RAIZ, 'src', 'lib', 'consolidarPlantilla.ts'),
);

const presentes = readdirSync(PLANTILLA).filter((n) => n.endsWith('.gs'));

const desajuste = desajustesDeOrden(presentes);
if (desajuste.faltan.length > 0 || desajuste.sinOrden.length > 0) {
  console.error('consolidar-gs: la carpeta y ORDEN_CONSOLIDADO no coinciden.');
  if (desajuste.faltan.length > 0) console.error(`  faltan en la carpeta: ${desajuste.faltan.join(', ')}`);
  if (desajuste.sinOrden.length > 0) console.error(`  sin sitio en el orden: ${desajuste.sinOrden.join(', ')}`);
  process.exit(1);
}

const ficheros = ORDEN_CONSOLIDADO.map((nombre) => ({
  nombre,
  codigo: readFileSync(join(PLANTILLA, nombre), 'utf8'),
}));

const choques = colisiones(ficheros);
if (choques.length > 0) {
  console.error('consolidar-gs: hay nombres globales declarados más de una vez.');
  console.error('En Apps Script esto NO falla: gana el último fichero que se cargue.');
  for (const c of choques) console.error(`  ${c.nombre} → ${c.ficheros.join(', ')}`);
  process.exit(1);
}

const fecha = new Date().toISOString().slice(0, 10);
const salida = join(DESTINO, 'Pate.gs');

mkdirSync(DESTINO, { recursive: true });
writeFileSync(salida, consolidar(ficheros, fecha), 'utf8');

const lineas = readFileSync(salida, 'utf8').split('\n').length;
console.log(`consolidar-gs: ${ficheros.length} ficheros → ${salida} (${lineas} líneas)`);
console.log('consolidar-gs: sin colisiones de nombres globales.');
console.log('');
console.log('En el editor de Apps Script: borra TODOS los .gs del proyecto, crea uno');
console.log('llamado «Pate» y pega este contenido. El manifiesto va aparte.');
