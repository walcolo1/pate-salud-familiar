import { describe, it, expect } from 'vitest';
import {
  aFila,
  aModelo,
  celdaALista,
  celdaAValor,
  colapsar,
  estaDadaDeBaja,
  filaDeBaja,
  filaDesdeCeldas,
  listaACelda,
  valorACelda,
  type Descriptor,
} from './mapeoFilas';

/**
 * G0 · la traducción, mirada de cerca.
 *
 * `descriptores.test.ts` comprueba que **ningún campo se pierda**. Esto
 * comprueba lo otro: que el valor que llega a la celda sea el que había, y que
 * el que vuelve de la celda sea el que se guardó.
 *
 * El caso que lo justifica es el registro **solo-anexar** del router: cada
 * guardado añade una fila, nunca modifica la anterior. Leer bien no es leer la
 * fila: es colapsar todas las que hablan del mismo registro.
 */

const PACIENTE: Descriptor = {
  pestana: 'PACIENTES',
  pacienteDesde: 'id',
  constantes: { tipo: 'HUMANO' },
  campos: {
    id: { columna: 'id' },
    fullName: { columna: 'nombre' },
    notes: { columna: 'notas' },
  },
};

describe('valores sueltos', () => {
  it('una lista va con comas, no con JSON', () => {
    // La hoja la abre el titular. `["polen","penicilina"]` es una celda que no
    // se puede leer ni corregir desde la propia hoja, y poder hacerlo es media
    // razón de que esto sea una hoja.
    expect(listaACelda(['polen', 'penicilina'])).toBe('polen, penicilina');
    expect(listaACelda([' polen ', '', '  '])).toBe('polen');
    expect(listaACelda(null)).toBe('');
  });

  it('y vuelve como lista, sin huecos', () => {
    expect(celdaALista('polen, penicilina')).toEqual(['polen', 'penicilina']);
    expect(celdaALista('polen,,  ,penicilina')).toEqual(['polen', 'penicilina']);
    expect(celdaALista('')).toEqual([]);
    expect(celdaALista(null)).toEqual([]);
  });

  it('un booleano se escribe legible y se lee tolerante', () => {
    expect(valorACelda(true, 'booleano')).toBe('SI');
    expect(valorACelda(false, 'booleano')).toBe('NO');
    expect(celdaAValor('SI', 'booleano')).toBe(true);
    expect(celdaAValor(' si ', 'booleano')).toBe(true);
    expect(celdaAValor('NO', 'booleano')).toBe(false);
    expect(celdaAValor('', 'booleano')).toBe(false);
  });

  it('un número que no es un número no se inventa', () => {
    // Guardar `NaN` en una celda y leerlo luego como 0 sería peor que dejarla
    // vacía: un peso de 0 parece un dato.
    expect(valorACelda('abc', 'numero')).toBe('');
    expect(valorACelda(12, 'numero')).toBe(12);
    expect(celdaAValor('abc', 'numero')).toBe(null);
    expect(celdaAValor('12', 'numero')).toBe(12);
  });

  it('una celda vacía vuelve como null, no como cadena vacía', () => {
    expect(celdaAValor('', undefined)).toBe(null);
    expect(celdaAValor('  hola ', undefined)).toBe('  hola ');
  });
});

describe('aFila', () => {
  it('traduce solo los campos presentes', () => {
    // Un campo ausente no es un campo vacío: mandar `''` por un dato que no
    // venía lo borraría en la hoja.
    const fila = aFila(PACIENTE, { id: 'p1', fullName: 'Ana' });
    expect(fila).toEqual({ id: 'p1', nombre: 'Ana', tipo: 'HUMANO' });
    expect('notas' in fila).toBe(false);
  });

  it('las constantes del descriptor van siempre', () => {
    // `tipo` no es un campo del modelo —la aplicación solo tiene personas— y
    // sin él la fila nace sin especie y `PERFIL_MASCOTA` deja de distinguirse.
    expect(aFila(PACIENTE, {}).tipo).toBe('HUMANO');
  });

  it('nunca escribe las columnas que sella el router', () => {
    const fila = aFila(PACIENTE, { id: 'p1' });
    expect('creado_en' in fila).toBe(false);
    expect('actualizado_en' in fila).toBe(false);
  });
});

describe('aModelo', () => {
  it('devuelve el camino de vuelta', () => {
    const modelo = aModelo(PACIENTE, { id: 'p1', nombre: 'Ana', notas: '' });
    expect(modelo).toEqual({ id: 'p1', fullName: 'Ana', notes: null });
  });
});

describe('filaDesdeCeldas', () => {
  it('nombra las celdas por su encabezado', () => {
    // `consultar` devuelve matrices, no objetos. Colocar por posición sin
    // nombrar sería exactamente el fallo que el esquema append-only evita.
    expect(filaDesdeCeldas(['id', 'nombre'], ['p1', 'Ana'])).toEqual({ id: 'p1', nombre: 'Ana' });
  });

  it('una hoja más estrecha que el esquema no rompe', () => {
    // Una hoja instalada con v2 devuelve menos columnas que el esquema v3. Las
    // que faltan están vacías, no indefinidas a medias.
    expect(filaDesdeCeldas(['id', 'nombre', 'foto_url'], ['p1', 'Ana'])).toEqual({
      id: 'p1',
      nombre: 'Ana',
      foto_url: '',
    });
  });

  it('una hoja más ancha no aporta columnas sin nombre', () => {
    expect(filaDesdeCeldas(['id'], ['p1', 'sobra'])).toEqual({ id: 'p1' });
  });
});

describe('colapsar · el registro solo-anexa', () => {
  it('la última fila que habla manda, entera', () => {
    // Guardar no modifica: añade. Dos guardados del mismo paciente son dos
    // filas, y la buena es la última.
    const filas = [
      { id: 'p1', nombre: 'Ana', notas: 'alergias' },
      { id: 'p1', nombre: 'Ana María', notas: '' },
    ];
    expect(colapsar(PACIENTE, filas)).toEqual([
      { id: 'p1', fullName: 'Ana María', notes: null },
    ]);
  });

  it('borrar un dato lo borra de verdad', () => {
    // Si el colapso fuera «último valor no vacío», vaciar una nota la haría
    // reaparecer. Para quien acaba de borrarla, eso es el dato volviendo solo.
    const filas = [
      { id: 'p1', nombre: 'Ana', notas: 'privado' },
      { id: 'p1', nombre: 'Ana', notas: '' },
    ];
    expect(colapsar(PACIENTE, filas)[0].notes).toBe(null);
  });

  it('una fila de baja retira el registro, aunque haya escrituras antes', () => {
    const filas = [
      { id: 'p1', nombre: 'Ana' },
      filaDeBaja('p1', '2026-09-21T10:00:00.000Z'),
    ];
    expect(colapsar(PACIENTE, filas)).toEqual([]);
  });

  it('volver a guardar después de una baja revive el registro', () => {
    // La baja es lógica y la hoja solo anexa: una fila nueva después de la
    // baja es un alta, y tratarla de otro modo dejaría al usuario sin poder
    // deshacer.
    const filas = [
      { id: 'p1', nombre: 'Ana' },
      filaDeBaja('p1', '2026-09-21T10:00:00.000Z'),
      { id: 'p1', nombre: 'Ana' },
    ];
    expect(colapsar(PACIENTE, filas)).toHaveLength(1);
  });

  it('conserva el orden de aparición', () => {
    const filas = [
      { id: 'p2', nombre: 'Beto' },
      { id: 'p1', nombre: 'Ana' },
      { id: 'p2', nombre: 'Berto' },
    ];
    expect(colapsar(PACIENTE, filas).map((m) => m.id)).toEqual(['p2', 'p1']);
  });

  it('una fila sin clave se ignora en vez de agruparse con las demás', () => {
    // Sin esto, todas las filas rotas se colapsarían entre sí bajo la clave
    // vacía y saldría un registro fantasma.
    expect(colapsar(PACIENTE, [{ nombre: 'sin id' }])).toEqual([]);
  });

  it('una fila que no habla de estas columnas no pisa a la que sí', () => {
    // `PERFIL_HUMANO` tiene dos dueños: `members` escribe la identidad y
    // `healthProfiles` lo clínico. En un registro solo-anexa son filas
    // distintas, y cada descriptor solo puede ser pisado por quien escribe SUS
    // columnas.
    const clinico: Descriptor = {
      pestana: 'PERFIL_HUMANO',
      pacienteDesde: 'memberId',
      campos: {
        id: { columna: 'id' },
        allergies: { columna: 'alergias', tipo: 'lista' },
      },
    };

    const filas = [
      { id: 'h1', alergias: 'polen' },
      // La mitad de identidad: misma pestaña, ninguna columna de este
      // descriptor. No puede borrar las alergias.
      { id: 'h1', documento_numero: '123', alergias: '' },
    ];

    expect(colapsar(clinico, filas)[0].allergies).toEqual(['polen']);
  });
});

describe('la baja lógica', () => {
  it('marca la fecha y no borra nada', () => {
    expect(filaDeBaja('p1', '2026-09-21T10:00:00.000Z')).toEqual({
      id: 'p1',
      borrado_en: '2026-09-21T10:00:00.000Z',
    });
  });

  it('se reconoce al leer', () => {
    expect(estaDadaDeBaja({ borrado_en: '2026-09-21T10:00:00.000Z' })).toBe(true);
    expect(estaDadaDeBaja({ borrado_en: '   ' })).toBe(false);
    expect(estaDadaDeBaja({})).toBe(false);
  });
});
