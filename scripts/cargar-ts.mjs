/**
 * Carga un módulo de TypeScript desde un guion de Node, sin compilar el proyecto.
 *
 * POR QUÉ NO SE COPIA EL CÓDIGO
 * ─────────────────────────────
 * Los guiones de esta carpeta necesitan lógica que está en `src/lib`, y esa
 * lógica es la que tiene las pruebas. Copiarla aquí crearía una segunda versión
 * que diverge; es lo mismo que evita `generar-gs.mjs`, y con la misma
 * herramienta: transpilar de verdad con el compilador, no recortar tipos con
 * expresiones regulares.
 *
 * El resultado se importa como un módulo de datos, así que no se escribe nada
 * en el disco ni queda un artefacto que alguien pueda editar por error.
 *
 * LÍMITE: el módulo cargado **no puede importar otros ficheros**. Aquí solo se
 * usa con módulos que no lo hacen, a propósito.
 */

import { readFileSync } from 'node:fs';
import ts from 'typescript';

export async function cargarModuloTs(ruta) {
  const fuente = readFileSync(ruta, 'utf8');

  const { outputText } = ts.transpileModule(fuente, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    fileName: ruta,
  });

  const url = 'data:text/javascript;base64,' + Buffer.from(outputText, 'utf8').toString('base64');
  return import(url);
}
