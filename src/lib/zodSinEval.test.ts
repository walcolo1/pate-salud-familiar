import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'zod';
import './zodSinEval';

/**
 * A7 · que no vuelva a aparecer una violación de CSP inofensiva.
 *
 * Zod 4 tantea con `new Function` si el entorno le deja compilar validadores.
 * Lo captura, así que no rompe nada — pero el navegador dispara
 * `securitypolicyviolation` **antes** del `catch`, y el trinquete de A7 exige
 * cero.
 *
 * Una violación permanente e inofensiva es peor que ninguna: enseña a ignorar
 * el informe, y el día que aparezca una de verdad estará en la misma lista que
 * el ruido. Apareció en G3b, cuando `/login` empezó a cargar zod por la cadena
 * de la identidad, y tumbó tres pruebas a la vez.
 */

const RAIZ = join(process.cwd(), 'src', 'lib');

describe('zod no tantea `eval`', () => {
  it('la configuración queda en `jitless`', () => {
    expect(config().jitless).toBe(true);
  });
});

describe('quien use zod lo apaga antes', () => {
  /** Los módulos que importan zod, buscados y no listados a mano. */
  const conZod = readdirSync(RAIZ)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && n !== 'zodSinEval.ts')
    .map((n) => ({ nombre: n, fuente: readFileSync(join(RAIZ, n), 'utf8') }))
    .filter(({ fuente }) => /^import .*from 'zod'/m.test(fuente));

  it('hay al menos uno, o esta prueba no está mirando nada', () => {
    expect(conZod.length).toBeGreaterThan(0);
  });

  for (const { nombre, fuente } of conZod) {
    it(`${nombre} · importa zodSinEval, y ANTES que zod`, () => {
      // El orden es la mitad del arreglo: el tanteo es perezoso, pero una
      // validación anterior a esa línea ya lo habría disparado.
      const apagado = fuente.indexOf("import './zodSinEval'");
      const zod = fuente.search(/^import .*from 'zod'/m);

      expect(apagado, `${nombre} usa zod sin apagar el tanteo`).toBeGreaterThan(-1);
      expect(apagado, `${nombre} apaga el tanteo después de importar zod`).toBeLessThan(zod);
    });
  }
});
