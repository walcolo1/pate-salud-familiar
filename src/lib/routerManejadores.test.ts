import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCIONES } from './router';
import { MATRIZ_PERMISOS, puede } from './permisos';
import type { Acceso } from './acceso';

/**
 * El catálogo de acciones y sus manejadores viven en dos ficheros.
 *
 * `ACCIONES` sale de `router.ts` y se genera; `MANEJADORES` está escrito a mano
 * en `Router.gs`. Nada comprobaba que dijeran lo mismo: una acción declarada
 * sin manejador contesta ACCION_DESCONOCIDA en producción y en ninguna prueba.
 */

const ROUTER_GS = readFileSync(join(process.cwd(), 'apps-script', 'plantilla', 'Router.gs'), 'utf8');

function manejadoresDeRouterGs(): string[] {
  const inicio = ROUTER_GS.indexOf('var MANEJADORES = {');
  expect(inicio, 'Router.gs ya no declara MANEJADORES').toBeGreaterThan(-1);
  const cuerpo = ROUTER_GS.slice(inicio, ROUTER_GS.indexOf('\n};', inicio));
  return [...cuerpo.matchAll(/^ {2}(\w+): function/gm)].map((m) => m[1]).sort();
}

describe('Router.gs tiene un manejador por acción, ni uno más', () => {
  it('los dos catálogos coinciden', () => {
    expect(manejadoresDeRouterGs()).toEqual(Object.keys(ACCIONES).sort());
  });
});

describe('verHoja · la dirección de la hoja, solo para el titular', () => {
  it('existe y exige identidad y acceso', () => {
    const d = ACCIONES.verHoja;
    expect(d, 'falta verHoja en ACCIONES').toBeDefined();
    expect(d.exigeToken).not.toBe(false);
    expect(d.exigeAcceso).not.toBe(false);
    expect(d.muta).toBeFalsy();
  });

  it('su verbo lo tiene el titular y nadie más', () => {
    // No es un secreto que abra nada —Drive sigue exigiendo que la hoja esté
    // compartida con quien la abre—, pero ningún otro rol la necesita: los
    // familiares ven el expediente por la aplicación, no por la hoja.
    const verbo = ACCIONES.verHoja.verbo!;
    const titular = { email: 't@ejemplo.test', rol: 'TITULAR', estado: 'ACTIVO', alcanceTotal: true, pacientesPermitidos: [], pacientePropio: null, version: 1 } as Acceso;
    expect(puede(titular, verbo)).toBe(true);
    for (const rol of ['CUIDADOR', 'MIEMBRO', 'LECTOR'] as const) {
      expect(MATRIZ_PERMISOS[rol], rol).not.toContain(verbo);
    }
  });

  it('el manejador no abre la hoja: arma la dirección con el ID de las propiedades', () => {
    // `openById` cuesta una apertura de la hoja entera para devolver una
    // cadena que ya se tiene. Y lo que devuelve nunca es otra cosa que una
    // dirección de docs.google.com.
    const inicio = ROUTER_GS.indexOf('  verHoja: function');
    const cuerpo = ROUTER_GS.slice(inicio, ROUTER_GS.indexOf('\n  },', inicio));
    expect(cuerpo).toContain('CLAVE_ID_HOJA');
    expect(cuerpo).toContain("'https://docs.google.com/spreadsheets/d/'");
    expect(cuerpo).not.toContain('openById');
  });
});
