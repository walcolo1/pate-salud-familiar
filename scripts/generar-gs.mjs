/**
 * Genera los ficheros `.gs` de la plantilla desde sus fuentes de TypeScript.
 *
 * POR QUÉ UN GENERADOR Y NO DOS COPIAS
 * ────────────────────────────────────
 * El instalador de Apps Script y la PWA necesitan la misma estructura de 21
 * tablas y las mismas decisiones de instalación, y no comparten ejecución: uno
 * corre en los servidores de Google y el otro en un navegador. Dos copias
 * divergen; no es una posibilidad, es cuestión de tiempo.
 *
 * Así que la definición vive en TypeScript —donde se puede probar— y el `.gs`
 * se deriva. Una prueba compara lo generado con lo que este script produciría
 * hoy: si alguien edita un `.gs` a mano o cambia el `.ts` sin regenerar, se
 * pone roja.
 *
 * POR QUÉ EL COMPILADOR Y NO UNAS EXPRESIONES REGULARES
 * ─────────────────────────────────────────────────────
 * La primera versión recortaba los tipos a mano. Funcionaba con literales
 * simples y se habría roto con el primer genérico. Aquí transpila TypeScript de
 * verdad y solo se tocan los `import`/`export` del resultado, que es JavaScript
 * predecible. Un generador frágil convierte una prueba verde en una coartada.
 *
 *   node scripts/generar-gs.mjs            escribe los ficheros
 *   node scripts/generar-gs.mjs --revisar  solo comprueba, sin escribir
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const DESTINO = join(RAIZ, 'apps-script', 'plantilla');

/** Qué se genera desde dónde. El orden importa: Apps Script los concatena. */
const FICHEROS = [
  {
    origen: join(RAIZ, 'src', 'lib', 'esquemaHoja.ts'),
    destino: join(DESTINO, 'Esquema.gs'),
    titulo: 'Esquema de la hoja del titular',
    fuente: 'src/lib/esquemaHoja.ts',
  },
  {
    origen: join(RAIZ, 'src', 'lib', 'planInstalacion.ts'),
    destino: join(DESTINO, 'Instalacion.gs'),
    titulo: 'Decisiones de la instalación',
    fuente: 'src/lib/planInstalacion.ts',
  },
];

function cabecera(titulo, fuente) {
  return [
    '/**',
    ` * ${titulo} — GENERADO, NO EDITAR A MANO.`,
    ' *',
    ` * Origen:  ${fuente}`,
    ' * Genera:  node scripts/generar-gs.mjs',
    ' *',
    ' * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí',
    ' * hace que la próxima ejecución del generador lo pise sin avisar.',
    ' */',
    '',
    '',
  ].join('\n');
}

/**
 * TypeScript → JavaScript de Apps Script.
 *
 * Tres retoques sobre la salida del compilador, y ninguno adivina nada:
 *
 *   · Los `import` sobran: Apps Script concatena todos los ficheros en un mismo
 *     ámbito, así que lo que exporta uno ya es visible en el siguiente.
 *   · Los `export` sobran por lo mismo.
 *   · `const` y `let` de primer nivel pasan a `var`. Con V8 funcionarían, pero
 *     `var` es lo que el resto del proyecto usa y lo que aparece en cualquier
 *     ejemplo de Apps Script: no vale la pena ser original aquí.
 */
function transpilar(rutaOrigen) {
  const fuente = readFileSync(rutaOrigen, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(fuente, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    },
    reportDiagnostics: true,
  });

  if (diagnostics && diagnostics.length > 0) {
    const mensajes = diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, ' '),
    );
    throw new Error(`No se pudo transpilar ${rutaOrigen}: ${mensajes.join(' | ')}`);
  }

  return outputText
    .split('\n')
    .filter((linea) => !/^import\s/.test(linea))
    .map((linea) => linea.replace(/^export\s+/, ''))
    .map((linea) => linea.replace(/^(const|let)\s/, 'var '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

const revisar = process.argv.includes('--revisar');
let hayDeriva = false;

for (const f of FICHEROS) {
  const contenido = cabecera(f.titulo, f.fuente) + transpilar(f.origen);

  if (!revisar) {
    writeFileSync(f.destino, contenido, 'utf8');
    console.log(`generar-gs: escrito ${f.destino}`);
    continue;
  }

  let actual = '';
  try {
    actual = readFileSync(f.destino, 'utf8');
  } catch {
    console.error(`generar-gs: falta ${f.destino}.`);
    hayDeriva = true;
    continue;
  }
  if (actual !== contenido) {
    console.error(`generar-gs: ${f.destino} NO coincide con ${f.fuente}.`);
    hayDeriva = true;
  }
}

if (revisar) {
  if (hayDeriva) {
    console.error('generar-gs: ejecuta `node scripts/generar-gs.mjs`.');
    process.exit(1);
  }
  console.log('generar-gs: los ficheros generados están al día.');
}
