import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESCRIPTORES, MODELO_DE_COLECCION, SIN_PESTANA } from './descriptores';
import {
  COLUMNAS_DEL_ROUTER,
  DESCARTADOS,
  DESCARTADOS_POR_COLECCION,
  estaDescartado,
} from './mapeoFilas';
import { encabezadosDe } from './planInstalacion';
import { PESTANAS } from './esquemaHoja';

/**
 * G0 · nadie se queda por el camino.
 *
 * La regla: **todo campo de cada modelo está mapeado o declarado como
 * descartado por escrito**. No hay tercera opción, y por eso un olvido se
 * convierte en una prueba roja en vez de en un dato que desaparece.
 *
 * Es la misma idea que el trinquete de escrituras mudas de G1, una capa más
 * arriba: allí no se podía guardar sin hacer nada; aquí no se puede traducir
 * dejándose algo.
 */

const MODELOS = readFileSync(join(process.cwd(), 'src', 'domain', 'models.ts'), 'utf8');

function camposDelModelo(nombre: string): string[] {
  const i = MODELOS.indexOf(`export interface ${nombre} {`);
  if (i === -1) return [];
  const cuerpo = MODELOS.slice(i, MODELOS.indexOf('\n}', i));
  return [...cuerpo.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]);
}

const camposMapeados = (coleccion: string): Set<string> =>
  new Set((DESCRIPTORES[coleccion] ?? []).flatMap((d) => Object.keys(d.campos)));

describe('cobertura: ningún campo se pierde en silencio', () => {
  it('cada modelo existe y tiene campos', () => {
    for (const [coleccion, modelo] of Object.entries(MODELO_DE_COLECCION)) {
      expect(camposDelModelo(modelo).length, `${coleccion} → ${modelo}`).toBeGreaterThan(0);
    }
  });

  for (const [coleccion, modelo] of Object.entries(MODELO_DE_COLECCION)) {
    it(`${coleccion} · todo campo está mapeado o descartado por escrito`, () => {
      const mapeados = camposMapeados(coleccion);
      const huerfanos = camposDelModelo(modelo).filter(
        (campo) => !mapeados.has(campo) && !estaDescartado(coleccion, campo),
      );

      expect(
        huerfanos,
        `\n${modelo} tiene campos sin columna y sin descartar: ${huerfanos.join(', ')}\n` +
          'Mapéalos en descriptores.ts, o decláralos en DESCARTADOS con su motivo.\n',
      ).toEqual([]);
    });
  }
});

describe('los descartes están razonados, no solo listados', () => {
  it('cada motivo dice algo', () => {
    // Un descarte con el motivo «no aplica» es un descarte sin decidir.
    for (const [campo, motivo] of Object.entries(DESCARTADOS)) {
      expect(motivo.length, `${campo} no explica por qué se descarta`).toBeGreaterThan(15);
    }
    for (const [coleccion, campos] of Object.entries(DESCARTADOS_POR_COLECCION)) {
      for (const [campo, motivo] of Object.entries(campos)) {
        expect(motivo.length, `${coleccion}.${campo}`).toBeGreaterThan(15);
      }
    }
  });

  it('un descarte por colección NO se aplica a las demás', () => {
    // `status` no se guarda en vacunas —se calcula (D3)— y sí en todas las
    // demás. Un descarte global lo habría tirado en media docena de sitios.
    expect(estaDescartado('vaccines', 'status')).toBe(true);
    expect(estaDescartado('appointments', 'status')).toBe(false);
    expect(camposMapeados('appointments').has('status')).toBe(true);
  });

  it('las colecciones sin pestaña dicen por qué, y son pocas', () => {
    for (const [coleccion, motivo] of Object.entries(SIN_PESTANA)) {
      expect(motivo.length, coleccion).toBeGreaterThan(30);
      expect(DESCRIPTORES[coleccion], `${coleccion} no puede tener descriptor`).toBeUndefined();
    }
  });
});

describe('los descriptores hablan del esquema de verdad', () => {
  it('toda pestaña citada existe', () => {
    const conocidas = new Set(PESTANAS.map((p) => p.nombre));
    for (const [coleccion, lista] of Object.entries(DESCRIPTORES)) {
      for (const d of lista) {
        expect(conocidas.has(d.pestana), `${coleccion} → ${d.pestana}`).toBe(true);
      }
    }
  });

  it('toda columna citada existe en su pestaña', () => {
    // Una columna mal escrita escribiría en el vacío: `aplicar()` coloca los
    // valores por nombre, así que un nombre que no está simplemente no se
    // escribe. Sin error.
    for (const [coleccion, lista] of Object.entries(DESCRIPTORES)) {
      for (const d of lista) {
        const columnas = new Set(encabezadosDe(d.pestana) ?? []);
        for (const { columna } of Object.values(d.campos)) {
          expect(columnas.has(columna), `${coleccion}: ${d.pestana}.${columna} no existe`).toBe(
            true,
          );
        }
      }
    }
  });

  it('ningún descriptor escribe las columnas que sella el router', () => {
    // `creado_en`, `actualizado_en` y `borrado_en` las pone el backend. Que el
    // cliente pudiera escribirlas convertiría la marca de tiempo en una
    // opinión suya.
    for (const [coleccion, lista] of Object.entries(DESCRIPTORES)) {
      for (const d of lista) {
        for (const { columna } of Object.values(d.campos)) {
          expect(COLUMNAS_DEL_ROUTER, `${coleccion} escribe ${columna}`).not.toContain(columna);
        }
      }
    }
  });

  it('dos campos de la misma colección no apuntan a la misma columna', () => {
    // Dos campos en una celda: el segundo pisa al primero y el dato del
    // primero deja de existir.
    for (const [coleccion, lista] of Object.entries(DESCRIPTORES)) {
      for (const d of lista) {
        const columnas = Object.values(d.campos).map((x) => x.columna);
        expect(new Set(columnas).size, `${coleccion} → ${d.pestana} repite columna`).toBe(
          columnas.length,
        );
      }
    }
  });

  it('cada fila dice a qué paciente pertenece, salvo las que cuelgan de otra', () => {
    // Sin paciente, `aplicar()` no puede comprobar el alcance de quien escribe.
    // `examResults` es la excepción: cuelga de un examen, y el examen ya dice
    // de quién es.
    for (const [coleccion, lista] of Object.entries(DESCRIPTORES)) {
      if (coleccion === 'examResults') continue;
      for (const d of lista) {
        expect(d.pacienteDesde, `${coleccion} → ${d.pestana} no dice de quién es`).toBeTruthy();
      }
    }
  });
});
