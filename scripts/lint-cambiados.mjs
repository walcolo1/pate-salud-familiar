/**
 * Lint dirigido, con línea base por archivo.
 *
 * EL PROBLEMA QUE RESUELVE
 * ────────────────────────
 * El proyecto arrastra deuda de ESLint documentada en la auditoría (P2-1):
 * 83 errores en `AppContext.tsx` y 15 en `settings/page.tsx`. Un `eslint .`
 * fallaría siempre, y un comando que siempre falla deja de significar algo.
 *
 * CÓMO FUNCIONA
 * ─────────────
 * Analiza solo los archivos que este cambio toca —modificados frente a
 * `origin/main`, en el índice, o sin seguimiento— y compara el número de
 * errores de cada uno con `scripts/lint-baseline.json`.
 *
 *   · Archivo nuevo o sin línea base  → se exige CERO errores.
 *   · Archivo con deuda registrada    → falla solo si EMPEORA.
 *   · Archivo que mejora              → se avisa para bajar la línea base.
 *
 * Así un fallo significa siempre "esta tarea introdujo un problema".
 * La deuda de fondo se ataca en el bloque C (tarea C7); cuando eso ocurra,
 * las líneas base bajan a 0 y este archivo puede desaparecer.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const RUTA_BASE = 'scripts/lint-baseline.json';
const actualizar = process.argv.includes('--actualizar-linea-base');

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const base = git(['merge-base', 'origin/main', 'HEAD']) || 'HEAD';
const archivos = [
  ...new Set(
    [
      ...git(['diff', '--name-only', base]).split('\n'),
      ...git(['diff', '--name-only', '--cached']).split('\n'),
      ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
    ]
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => /\.(ts|tsx|mts|mjs)$/.test(f))
      .filter((f) => existsSync(f)),
  ),
];

if (archivos.length === 0) {
  console.log('lint-cambiados: no hay archivos TypeScript modificados. Nada que revisar.');
  process.exit(0);
}

const lineaBase = existsSync(RUTA_BASE) ? JSON.parse(readFileSync(RUTA_BASE, 'utf8')) : {};

let salida = '';
try {
  salida = execFileSync('npx', ['eslint', '--format', 'json', ...archivos], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  salida = e.stdout ?? '';
}

let informes;
try {
  informes = JSON.parse(salida);
} catch {
  console.error('lint-cambiados: no se pudo interpretar la salida de ESLint.');
  process.exit(1);
}

const nuevas = {};
// Archivos realmente analizados aquí: son los únicos que pueden PERDER su
// anotación al actualizar la línea base.
const analizadas = new Set();
let empeora = false;
let mejora = false;

console.log(`lint-cambiados: ${archivos.length} archivo(s) analizados\n`);
for (const inf of informes) {
  const ruta = relative(resolve('.'), inf.filePath).replace(/\\/g, '/');
  const errores = inf.messages.filter((m) => m.severity === 2).length;
  const avisos = inf.messages.filter((m) => m.severity === 1).length;
  const permitidos = lineaBase[ruta] ?? 0;
  analizadas.add(ruta);
  if (errores > 0) nuevas[ruta] = errores;

  let estado;
  if (errores > permitidos) {
    estado = `EMPEORA (+${errores - permitidos})`;
    empeora = true;
  } else if (errores < permitidos) {
    estado = `mejora (-${permitidos - errores}) — baja la línea base`;
    mejora = true;
  } else if (permitidos > 0) {
    estado = 'deuda preexistente, sin cambio';
  } else {
    estado = 'limpio';
  }
  console.log(
    `  ${errores > permitidos ? '✗' : '·'} ${ruta}\n` +
      `      errores=${errores} (permitidos=${permitidos}) avisos=${avisos} → ${estado}`,
  );
}

if (actualizar) {
  // Solo se analizan los archivos TOCADOS en esta rama, así que `nuevas` no
  // es la línea base completa: es un parche sobre ella. Escribirla tal cual
  // borra las anotaciones de todo lo que no se haya tocado hoy, que es justo
  // lo que pasó en C1.3a y costó recuperar siete entradas a mano.
  const fusionada = { ...lineaBase, ...nuevas };
  // Un archivo que quedó limpio pierde su anotación: la deuda no vuelve sola.
  for (const ruta of analizadas) if (!nuevas[ruta]) delete fusionada[ruta];
  const ordenada = Object.fromEntries(
    Object.keys(fusionada).sort().map((k) => [k, fusionada[k]]),
  );
  writeFileSync(RUTA_BASE, `${JSON.stringify(ordenada, null, 2)}\n`, 'utf8');
  console.log(
    `\nlint-cambiados: línea base actualizada en ${RUTA_BASE} ` +
      `(${Object.keys(ordenada).length} entradas).`,
  );
  process.exit(0);
}

if (empeora) {
  console.error(
    '\nlint-cambiados: FALLA. Algún archivo tiene más errores que su línea base.\n' +
      'Corrígelos, o si el aumento es deliberado y está justificado, actualiza la\n' +
      'línea base con: npm run lint:cambiados -- --actualizar-linea-base',
  );
  process.exit(1);
}

if (mejora) console.log('\nlint-cambiados: algún archivo mejoró. Considera bajar su línea base.');
console.log('\nlint-cambiados: sin regresiones.');
process.exit(0);
