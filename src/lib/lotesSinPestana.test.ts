/**
 * Bloque L · ningún lote mezcla una colección sin pestaña con otra que sí la tiene.
 *
 * Lo que no tiene dónde guardarse lanza `NO_HAY_DONDE_ESCRIBIRLO`, y
 * `persistirPorMutacion` lo trata como pérdida conocida: se calla. Si en el
 * mismo lote iba una cita, la cita se callaba con él y se quedaba solo en el
 * dispositivo. Esta prueba lee el contexto y lo impide.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIN_PESTANA = ['saveAppointmentCandidate', 'saveGmailSource', 'darDeBajaGmailSource', 'saveSettings'];

function bloques(fuente: string): string[] {
  const salida: string[] = [];
  let i = fuente.indexOf('persistirPorMutacion(async');
  while (i !== -1) {
    // Hasta el cierre del callback: el primer `});` con el mismo sangrado.
    const inicioLinea = fuente.lastIndexOf('\n', i) + 1;
    const sangria = fuente.slice(inicioLinea, i).match(/^\s*/)?.[0] ?? '';
    const fin = fuente.indexOf('\n' + sangria + '});', i);
    salida.push(fuente.slice(i, fin === -1 ? undefined : fin));
    i = fuente.indexOf('persistirPorMutacion(async', i + 1);
  }
  return salida;
}

describe('lotes y colecciones sin pestaña', () => {
  it('una colección sin pestaña va siempre sola en su lote', () => {
    const fuente = readFileSync(join(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
    const todos = bloques(fuente);
    expect(todos.length).toBeGreaterThan(10);
    for (const b of todos) {
      const llamadas = [...b.matchAll(/repo\.(\w+)\(/g)].map((m) => m[1]);
      if (!llamadas.some((n) => SIN_PESTANA.includes(n))) continue;
      expect(llamadas.filter((n) => !SIN_PESTANA.includes(n)), b.slice(0, 200)).toEqual([]);
    }
  });
});
