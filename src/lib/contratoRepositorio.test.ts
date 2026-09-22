import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  METODOS_ESCRITURA,
  METODOS_SOLO_LECTURA,
  escriturasMudas,
  esCuerpoMudo,
  informeDeMudas,
  nombresDelContrato,
} from './contratoRepositorio';
import { RepositorioBackend } from './repositorioBackend';

/**
 * G1 · la red antes del salto.
 *
 * El Bloque G cambia el backend de datos girando una bandera. Eso solo es
 * seguro si las implementaciones se comportan igual, y hay una forma de
 * incumplirlo que **no rompe nada**: implementar un método de escritura con
 * el cuerpo vacío. Compila, satisface el contrato, resuelve la promesa, y el
 * dato clínico desaparece sin excepción ni aviso.
 *
 * No es hipotético. Al escribir esto, `SheetsRepository` tenía **las 31
 * escrituras mudas**, y `getDataRepository()` lo devuelve siempre que la
 * bandera no diga `firebase` — incluido cuando la variable de entorno falta.
 */

const RAIZ = process.cwd();
const LINEA_BASE = JSON.parse(
  readFileSync(join(RAIZ, 'scripts', 'escrituras-mudas.json'), 'utf8'),
) as Record<string, string[]>;

describe('el catálogo cubre el contrato entero', () => {
  it('cada método declarado está clasificado, y una sola vez', () => {
    // Una interfaz de TypeScript no existe en ejecución, así que la lista se
    // escribe a mano. Esto es lo que impide que se quede atrás: un método
    // nuevo sin clasificar se colaría como si no escribiera nada.
    const declarados = nombresDelContrato(
      readFileSync(join(RAIZ, 'src', 'lib', 'dataRepository.ts'), 'utf8'),
    );
    const clasificados = [...METODOS_ESCRITURA, ...METODOS_SOLO_LECTURA];

    expect(declarados.length, 'no se leyó el contrato').toBeGreaterThan(30);
    expect([...clasificados].sort()).toEqual([...declarados].sort());
    expect(new Set(clasificados).size).toBe(clasificados.length);
  });

  it('lo que solo lee puede no hacer nada; escribir, no', () => {
    // `watchAll` sin eventos en tiempo real devuelve un desuscriptor vacío, y
    // eso es una respuesta legítima. Por eso la comprobación separa los dos.
    expect(METODOS_SOLO_LECTURA).toContain('watchAll');
    expect(METODOS_ESCRITURA).not.toContain('watchAll');
  });

  it('nombresDelContrato no se inventa nada si el fichero cambia de forma', () => {
    expect(nombresDelContrato('')).toEqual([]);
    expect(nombresDelContrato('export interface Otra { x(): void }')).toEqual([]);
  });
});

describe('esCuerpoMudo', () => {
  it('un cuerpo vacío es mudo: es el caso que existe de verdad', () => {
    expect(esCuerpoMudo('async saveMember(_ctx, _m) {}')).toBe(true);
    expect(esCuerpoMudo('async saveMember(_ctx, _m) {   }')).toBe(true);
  });

  it('un cuerpo que solo tiene comentarios también', () => {
    expect(esCuerpoMudo('save(a) { /* pendiente */ }')).toBe(true);
    expect(esCuerpoMudo('save(a) {\n  // se hará en otra fase\n}')).toBe(true);
  });

  it('un comentario que parece código no salva a nadie', () => {
    // Desnudar antes de mirar: si no, `// await guardar()` haría pasar por
    // vivo un método que no hace nada.
    expect(esCuerpoMudo('save(a) { // await guardar(a)\n }')).toBe(true);
    expect(esCuerpoMudo("save(a) { /* this.x = 1 */ }")).toBe(true);
  });

  it('una cadena que parece código, tampoco', () => {
    expect(esCuerpoMudo("save(a) { 'await guardar(a)'; }")).toBe(true);
  });

  it('llamar a algo NO es mudo', () => {
    expect(esCuerpoMudo('save(a) { this.guardar(a); }')).toBe(false);
  });

  it('esperar algo, asignar algo o lanzar algo, tampoco', () => {
    expect(esCuerpoMudo('async save(a) { await this.x; }')).toBe(false);
    expect(esCuerpoMudo('save(a) { this.pendiente = a; }')).toBe(false);
    expect(esCuerpoMudo('save(a) { throw new Error("x"); }')).toBe(false);
  });

  it('una comparación no es una asignación', () => {
    // `===`, `!=`, `=>` y `<=` no hacen nada por sí solos. Confundirlos con
    // una asignación dejaría pasar cuerpos que sí son mudos.
    expect(esCuerpoMudo('save(a) { a === 1; }')).toBe(true);
    expect(esCuerpoMudo('save(a) { a !== 1; }')).toBe(true);
    expect(esCuerpoMudo('save(a) { a <= 1; }')).toBe(true);
  });

  it('lanzar «no implementado» NO cuenta como mudo', () => {
    // Y es la diferencia que importa: un método que lanza avisa. El problema
    // es el que calla.
    expect(esCuerpoMudo('async save(a) { throw new Error("NO_IMPLEMENTADO"); }')).toBe(false);
  });
});

describe('escriturasMudas', () => {
  it('encuentra las vacías y deja en paz las que hacen algo', () => {
    const doble = {
      saveMember() {},
      deleteMember() {
        this.x(1);
      },
      x(_n: number) {},
    };
    expect(escriturasMudas(doble, ['saveMember', 'deleteMember'])).toEqual(['saveMember']);
  });

  it('un método que NO existe cuenta como mudo', () => {
    // No implementarlo y no guardar tienen el mismo efecto para quien escribió
    // el dato.
    expect(escriturasMudas({}, ['saveMember'])).toEqual(['saveMember']);
  });

  it('el informe dice cuántas son y cuáles, no solo que hay', () => {
    const texto = informeDeMudas('X', ['saveMember', 'saveExam']);
    expect(texto).toContain('saveMember');
    expect(texto).toContain('se pierde sin error ni aviso');
    expect(informeDeMudas('X', [])).toContain('ninguna escritura muda');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El trinquete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La línea base recogía lo que había para que la suite no viviera en rojo, y
 * **solo podía menguar**. Llegó a cero en G0 y ahí se queda.
 *
 * `FirebaseRepository` quedaba fuera porque no se podía instanciar sin
 * credenciales. Ya no hace falta la excusa: **G4 lo borró**, y ahora la única
 * implementación del contrato es la que se comprueba aquí.
 */
describe('ninguna escritura nueva puede ser muda', () => {
  const implementaciones = [{ nombre: 'RepositorioBackend', objeto: new RepositorioBackend() }];

  for (const { nombre, objeto } of implementaciones) {
    const permitidas = new Set(LINEA_BASE[nombre] ?? []);
    const mudas = escriturasMudas(objeto);

    it(`${nombre} · sin mudas fuera de la línea base`, () => {
      const nuevas = mudas.filter((m) => !permitidas.has(m));
      expect(nuevas, `\n${informeDeMudas(nombre, nuevas)}\n`).toEqual([]);
    });

    it(`${nombre} · la línea base no apunta nada ya arreglado`, () => {
      // Sin esto, la lista se queda como está para siempre y deja de decir la
      // verdad. Cuando G0 implemente un método, esta prueba obliga a tacharlo.
      const yaArregladas = [...permitidas].filter((m) => !mudas.includes(m));
      expect(
        yaArregladas,
        `\nya no son mudas y siguen en scripts/escrituras-mudas.json: ${yaArregladas.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('la línea base está vacía: G0 la pagó entera', () => {
    // Era 31 el 20 de septiembre de 2026 y es 0 desde el 21. Ahora la
    // comprobación es exacta, no un techo: cualquier escritura muda nueva
    // —también una que alguien intentara «tolerar» apuntándola aquí— pone la
    // suite en rojo.
    const total = Object.values(LINEA_BASE)
      .filter(Array.isArray)
      .reduce((n, lista) => n + lista.length, 0);

    expect(total, 'la deuda de G0 está pagada: no se vuelve a abrir').toBe(0);
  });
});
