import { describe, it, expect } from 'vitest';
import { puede, MATRIZ_PERMISOS } from './permisos';
import { verboDeTabla } from './router';
import { DESCRIPTORES } from './descriptores';
import type { Acceso } from './acceso';

/**
 * G4b · lo que el repositorio escribe, el router tiene que dejarlo escribir.
 *
 * Dos piezas probadas por separado y nunca juntas. E5 decide qué verbo exige
 * cada pestaña; G0 decide qué pestaña escribe cada colección y con qué
 * especie. La validación en vivo de G4b encontró el hueco entre las dos:
 *
 *   `HISTORIAL` exigía `ESCRIBIR_HISTORIAL_VET`, un verbo **solo para
 *   mascotas** —el Bloque D era el único que escribía historial—, y G0 mapeó
 *   el historial de las personas a esa misma pestaña. `puede()` comprueba la
 *   especie antes de mirar el rol, así que se denegaba **también al titular**.
 *
 * Esta prueba cruza las dos: para cada pestaña que escribe el repositorio,
 * pregunta al `puede()` de verdad si el titular podría escribir ahí sobre una
 * persona. Una pestaña nueva mal emparejada se pone roja aquí, y no con datos
 * clínicos de alguien desapareciendo de la pantalla.
 */

const titular: Acceso = {
  email: 'titular@ejemplo.test',
  rol: 'TITULAR',
  estado: 'ACTIVO',
  // Tal cual la fila 2 de ACCESO en la hoja de pruebas: `*` y sin paciente
  // propio. Se probó así a propósito, porque se sospechó de lo segundo.
  alcanceTotal: true,
  pacientesPermitidos: [],
  pacientePropio: null,
  version: 1,
} as Acceso;

const PESTANAS = [...new Set(Object.values(DESCRIPTORES).flat().map((d) => d.pestana))];

describe('el titular puede escribir todo lo que el repositorio escribe', () => {
  it('hay pestañas que mirar', () => {
    expect(PESTANAS.length).toBeGreaterThan(10);
  });

  for (const pestana of PESTANAS) {
    it(`${pestana} · sobre una persona recién creada`, () => {
      const verbo = verboDeTabla(pestana);
      expect(verbo, `${pestana} no tiene verbo: el router la rechazaría entera`).not.toBe(null);
      expect(
        puede(titular, verbo!, 'paciente-recien-creado', 'HUMANO'),
        `\nel titular no puede escribir en ${pestana} (verbo ${verbo}) sobre una persona.\n` +
          'El repositorio escribe ahí con especie HUMANO: el lote entero se rechazaría.\n',
      ).toBe(true);
    });
  }
});

describe('un paciente_propio vacío no le quita nada al titular', () => {
  it('con alcance `*`, cualquier paciente está en su alcance', () => {
    // Se sospechó en la validación en vivo, con buen criterio: la fila del
    // titular tiene `paciente_propio` vacío. No importa: con alcance total,
    // `alcanza()` no lo consulta.
    for (const pestana of PESTANAS) {
      expect(puede(titular, verboDeTabla(pestana)!, 'otro-paciente-cualquiera', 'HUMANO'), pestana).toBe(
        true,
      );
    }
  });
});

describe('el historial ya no distingue especie, y nadie gana permisos por ello', () => {
  it('el verbo del historial vale para personas y mascotas', () => {
    const verbo = verboDeTabla('HISTORIAL')!;
    expect(puede(titular, verbo, 'p1', 'HUMANO')).toBe(true);
    expect(puede(titular, verbo, 'm1', 'MASCOTA')).toBe(true);
  });

  it('lo tienen exactamente los roles que tenían el veterinario', () => {
    // Cuidador y miembro podían escribir historial de mascotas; ahora de
    // cualquiera. Los dos ya podían crear citas, controles y vacunas de
    // personas, que es más que apuntar lo que pasó. El lector sigue sin
    // escribir nada.
    const verbo = verboDeTabla('HISTORIAL')!;
    expect(MATRIZ_PERMISOS.CUIDADOR).toContain(verbo);
    expect(MATRIZ_PERMISOS.MIEMBRO).toContain(verbo);
    expect(MATRIZ_PERMISOS.LECTOR).not.toContain(verbo);
  });
});
