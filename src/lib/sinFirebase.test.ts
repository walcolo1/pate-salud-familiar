import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * G4 · que Firebase no vuelva a entrar.
 *
 * Retirarlo fue el objetivo del bloque entero: un servicio central donde los
 * expedientes clínicos de varias familias se tocaban. Ahora cada familia tiene
 * su hoja, su despliegue y su Drive, y **nada se toca con nada**.
 *
 * Lo que esta prueba impide no es que alguien lo añada a propósito —eso sería
 * una decisión, y las decisiones se discuten—: es que vuelva **sin que nadie se
 * dé cuenta**, arrastrado por una dependencia transitiva o por un ejemplo
 * copiado. El Bloque A encontró una regla de Firestore que concedía acceso
 * cuando faltaba el documento; esa clase de fallo no puede volver por descuido.
 *
 * LA EXCEPCIÓN, Y POR QUÉ EXISTE
 * ──────────────────────────────
 * `purgaFirestore.ts` habla de Firebase porque **borra lo que Firebase dejó**:
 * la caché de IndexedDB con el expediente completo sigue en el disco de quien
 * usó la versión anterior. Borrar el SDK no la borra.
 */

const RAIZ = join(process.cwd(), 'src');

/**
 * Los ficheros a los que se les permite nombrar a Firebase, y por qué.
 *
 * Es una lista corta a propósito. Si crece, la pregunta no es cómo ampliarla.
 */
const PERMITIDOS: Record<string, string> = {
  'lib/purgaFirestore.ts': 'borra la caché que Firebase dejó en el disco de quien ya usó la app',
  'lib/purgaFirestore.test.ts': 'las pruebas de lo anterior',
  'lib/sinFirebase.test.ts': 'esta misma prueba',
  'lib/purgaLocal.ts': 'la purga general la invoca al cerrar sesión',
  'lib/contratoRepositorio.ts': 'cuenta la historia de las escrituras mudas de G1',
  'lib/contratoRepositorio.test.ts': 'la prueba de esa historia: nombra la implementación que G4 borró',
  'lib/tiposAcceso.ts': 'explica de dónde vienen los nombres que se conservaron',
  'lib/dataRepository.ts': 'explica que hubo dos implementaciones y por qué queda una',
  'lib/mapeoFilas.ts': 'los descartes citan el andamiaje de Firestore que reemplazaron',
  'lib/sesionGoogle.ts': 'explica qué sustituye a la sesión que guardaba Firebase Auth',
  'lib/identidadGis.test.ts': 'comprueba que la sesión ya no depende de Firebase Auth',
  'lib/cabecerasSeguridad.test.ts': 'la CSP nombra dominios que ya no se usan; se revisa aparte',
  'lib/configuracionEntorno.test.ts': 'comprueba que las variables retiradas no hagan falta',
  'context/AppContext.tsx': 'los comentarios dicen qué había en cada sitio del que se quitó',
  'lib/purgaLocal.test.ts': 'comprueba que el cierre de sesión dispara la purga de la caché',
  'app/settings/page.tsx': 'el botón de salud de Firebase se fue; queda la mención en un comentario',
};

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficheros(ruta));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** Fuera comentarios: nombrar a Firebase al explicar algo no es usarlo. */
function codigo(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

describe('Firebase no está', () => {
  const todos = ficheros(RAIZ).map((ruta) => ({
    nombre: relative(RAIZ, ruta).replace(/\\/g, '/'),
    fuente: readFileSync(ruta, 'utf8'),
  }));

  it('hay ficheros que mirar, o esta prueba no vigila nada', () => {
    expect(todos.length).toBeGreaterThan(30);
  });

  it('nadie importa el SDK', () => {
    // Lo que de verdad importa: una importación es uso, y un uso nuevo tiene
    // que doler aquí antes de llegar a producción.
    const culpables = todos
      .filter(({ fuente }) => /from ['"]firebase/.test(codigo(fuente)))
      .map(({ nombre }) => nombre);

    expect(culpables, `\nimportan el SDK de Firebase: ${culpables.join(', ')}\n`).toEqual([]);
  });

  it('nadie nombra a Firebase en el código, salvo los que tienen motivo', () => {
    const culpables = todos
      .filter(({ nombre }) => !(nombre in PERMITIDOS))
      .filter(({ fuente }) => /firebase|firestore/i.test(codigo(fuente)))
      .map(({ nombre }) => nombre);

    expect(
      culpables,
      `\nnombran a Firebase sin estar en la lista: ${culpables.join(', ')}\n` +
        'Si hay un motivo, escríbelo en PERMITIDOS. Si no, quítalo.\n',
    ).toEqual([]);
  });

  it('cada excepción explica por qué lo es', () => {
    for (const [fichero, motivo] of Object.entries(PERMITIDOS)) {
      expect(motivo.length, `${fichero} no explica por qué se le permite`).toBeGreaterThan(10);
    }
  });

  it('la lista de excepciones no crece sola', () => {
    // Dieciséis el 22 de septiembre de 2026. Que suba es una decisión, no un
    // descuido, y debería costar tocar este número.
    expect(Object.keys(PERMITIDOS).length).toBeLessThanOrEqual(16);
  });

  it('la dependencia ya no está en package.json', () => {
    const paquete = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(paquete.dependencies ?? {}).not.toHaveProperty('firebase');
    expect(paquete.devDependencies ?? {}).not.toHaveProperty('firebase');
  });
});
