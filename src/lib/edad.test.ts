import { describe, it, expect } from 'vitest';
import { descripcionEdad, edadEnAnios, edadEnMeses } from './edad';

const HOY = new Date(2026, 2, 10, 12, 0, 0); // 10 de marzo de 2026

describe('edadEnAnios', () => {
  it('cuenta los años cumplidos', () => {
    expect(edadEnAnios('1990-03-10', HOY)).toBe(36);
    expect(edadEnAnios('1990-01-01', HOY)).toBe(36);
  });

  it('no cuenta el año si aún no ha llegado el cumpleaños', () => {
    expect(edadEnAnios('1990-03-11', HOY)).toBe(35);
    expect(edadEnAnios('1990-12-31', HOY)).toBe(35);
  });

  it('el propio día del cumpleaños ya cuenta', () => {
    expect(edadEnAnios('2000-03-10', HOY)).toBe(26);
  });

  it('una fecha futura no es una edad', () => {
    expect(edadEnAnios('2030-01-01', HOY)).toBeNull();
  });

  it('lo que no es una fecha devuelve null, no cero', () => {
    for (const malo of ['', 'ayer', '10/03/1990', '1990-13-40']) {
      expect(edadEnAnios(malo, HOY), malo).toBeNull();
    }
  });

  it('el 1 de enero no se convierte en 31 de diciembre por la zona horaria', () => {
    // `new Date('2020-01-01')` es medianoche UTC: al oeste de Greenwich cae en
    // el 31 de diciembre y resta un año a quien cumple ese día.
    expect(edadEnAnios('2020-01-01', new Date(2026, 0, 1, 8, 0, 0))).toBe(6);
  });

  it('el 29 de febrero de un bisiesto cumple dentro del año siguiente', () => {
    expect(edadEnAnios('2024-02-29', new Date(2026, 1, 28, 12))).toBe(1);
    expect(edadEnAnios('2024-02-29', new Date(2026, 2, 1, 12))).toBe(2);
  });
});

describe('edadEnMeses', () => {
  it('cuenta los meses cumplidos', () => {
    expect(edadEnMeses('2025-09-10', HOY)).toBe(6);
    expect(edadEnMeses('2025-09-11', HOY)).toBe(5);
  });

  it('nunca es negativa', () => {
    expect(edadEnMeses('2026-03-09', HOY)).toBe(0);
  });
});

describe('descripcionEdad · lo que se enseña', () => {
  it('en años a partir del primer cumpleaños', () => {
    expect(descripcionEdad('1990-03-10', HOY)).toBe('36 años');
    expect(descripcionEdad('2025-03-10', HOY)).toBe('1 año');
  });

  it('en MESES por debajo del año: «0 años» no dice nada de un bebé', () => {
    expect(descripcionEdad('2025-09-10', HOY)).toBe('6 meses');
    expect(descripcionEdad('2026-02-10', HOY)).toBe('1 mes');
  });

  it('en días durante el primer mes', () => {
    expect(descripcionEdad('2026-03-01', HOY)).toBe('9 días');
    expect(descripcionEdad('2026-03-09', HOY)).toBe('1 día');
  });

  it('sin fecha utilizable devuelve null y no un cero inventado', () => {
    expect(descripcionEdad('', HOY)).toBeNull();
    expect(descripcionEdad('2030-01-01', HOY)).toBeNull();
  });
});
