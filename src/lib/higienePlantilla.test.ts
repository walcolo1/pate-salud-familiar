import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORREOS_DE_EJEMPLO_PERMITIDOS,
  hallazgos,
  informe,
  motivoDe,
  redactarMuestra,
  type FicheroPlantilla,
} from './higienePlantilla';

/**
 * La plantilla se copia una vez por familia, y lo que lleve dentro se
 * multiplica por cada titular. No hay despliegue que corrija una copia que
 * alguien se llevó en marzo.
 */

const PLANTILLA = join(process.cwd(), 'apps-script', 'plantilla');

function leerPlantilla(): FicheroPlantilla[] {
  return readdirSync(PLANTILLA)
    .filter((n) => n.endsWith('.gs') || n.endsWith('.json'))
    .map((nombre) => ({ nombre, codigo: readFileSync(join(PLANTILLA, nombre), 'utf8') }));
}

const uno = (codigo: string) => hallazgos([{ nombre: 'X.gs', codigo }]);

describe('lo que la higiene detecta', () => {
  it('una clave privada', () => {
    expect(uno('var k = "-----BEGIN PRIVATE KEY-----";')[0].tipo).toBe('CLAVE_PRIVADA');
  });

  it('un Client ID de OAuth incrustado', () => {
    // Va en las propiedades del script, que son de cada copia. En el código
    // sería el mismo para todas las familias y quedaría a la vista.
    const r = uno("var c = '123456-abcdef.apps.googleusercontent.com';");
    expect(r[0].tipo).toBe('CLIENTE_OAUTH');
  });

  it('la URL de un despliegue', () => {
    // Es una credencial: quien la tenga puede llamar al endpoint. Y es distinta
    // por familia, así que en el molde no puede haber ninguna.
    const r = uno("var u = 'https://script.google.com/macros/s/AKfy/exec';");
    expect(r.map((h) => h.tipo)).toContain('URL_DE_DESPLIEGUE');
  });

  it('también la del host al que Google redirige', () => {
    const r = uno("var u = 'https://script.googleusercontent.com/macros/s/AKfy/echo';");
    expect(r.map((h) => h.tipo)).toContain('URL_DE_DESPLIEGUE');
  });

  it('restos del arnés', () => {
    expect(uno("var u = 'http://localhost:3000';").map((h) => h.tipo)).toContain(
      'MARCA_DE_PRUEBAS',
    );
    expect(uno('// el titular sintetico de las pruebas').map((h) => h.tipo)).toContain(
      'MARCA_DE_PRUEBAS',
    );
  });

  it('un pendiente sin cerrar', () => {
    expect(uno('// TODO: arreglar esto').map((h) => h.tipo)).toContain('PENDIENTE_SIN_CERRAR');
    expect(uno('// FIXME urgente').map((h) => h.tipo)).toContain('PENDIENTE_SIN_CERRAR');
  });

  it('pero NO el «todo» castellano, que está por todas partes', () => {
    // Media docena de comentarios de la plantilla dicen «Todo entra por
    // doPost» o «todo probable sin red». Señalarlos convertiría el trinquete
    // en ruido, y un trinquete ruidoso se desactiva.
    expect(uno(' * Todo entra por `doPost` y pasa por la misma cadena.')).toEqual([]);
    expect(uno(' * Todo puro, todo probable sin abrir un navegador.')).toEqual([]);
  });

  it('un identificador de hoja disfrazado de constante', () => {
    const r = uno("var ID = '1V4BsPDtScIrYiPSZ58iCBqOcy52DKX5eqhDW7jpyN60';");
    expect(r.map((h) => h.tipo)).toContain('IDENTIFICADOR_LARGO');
  });

  it('pero NO una constante del propio código', () => {
    // `INVITACION_DESTINATARIO_INVALIDO` mide 32 caracteres. Sin la regla de
    // las tres clases de carácter, el trinquete señalaría el catálogo de
    // errores entero.
    expect(uno("'INVITACION_DESTINATARIO_INVALIDO'")).toEqual([]);
    expect(uno("var CLAVE_ULTIMA_INSTALACION = 'ULTIMA_INSTALACION';")).toEqual([]);
  });

  it('un correo que no está en la lista', () => {
    const r = uno('// escribe a alguien.real@empresa.com');
    expect(r[0].tipo).toBe('CORREO_NO_PERMITIDO');
  });

  it('y sí deja pasar los de ejemplo declarados', () => {
    for (const correo of CORREOS_DE_EJEMPLO_PERMITIDOS) {
      expect(uno(`// ejemplo: ${correo}`), correo).toEqual([]);
    }
  });

  it('la lista es de direcciones exactas, no de dominios', () => {
    // Si fuera por dominio, `gmail.com` estaría abierto entero y cualquier
    // dirección real de gmail pasaría. La pausa que se busca es tener que
    // añadirla aquí a mano.
    expect(uno('// otro: cualquier.otro@gmail.com')[0].tipo).toBe('CORREO_NO_PERMITIDO');
  });

  it('dice el fichero y la línea', () => {
    const r = hallazgos([{ nombre: 'Auth.gs', codigo: 'uno\ndos\n// TODO: tres' }]);
    expect(r[0]).toMatchObject({ fichero: 'Auth.gs', linea: 3 });
  });

  it('encuentra varias cosas en la misma línea', () => {
    const r = uno("// TODO: mandar a real@empresa.com");
    expect(r.map((h) => h.tipo).sort()).toEqual(['CORREO_NO_PERMITIDO', 'PENDIENTE_SIN_CERRAR']);
  });
});

describe('el informe no es él mismo una filtración', () => {
  it('la muestra va recortada por los dos extremos', () => {
    expect(redactarMuestra('persona.real@empresa.com')).toBe('pers….com');
  });

  it('lo muy corto se deja entero: recortarlo no protege nada', () => {
    expect(redactarMuestra('abc')).toBe('abc');
  });

  it('ningún hallazgo lleva el valor completo', () => {
    // Este informe acaba en una consola y de ahí en un registro. Si la
    // plantilla llevara un correo real, escribirlo entero sería repetir el
    // problema que se está denunciando.
    const r = uno('// contacto: persona.real@empresa.com');
    expect(informe(r)).not.toContain('persona.real@empresa.com');
    expect(informe(r)).toContain('CORREO_NO_PERMITIDO');
  });

  it('el informe explica el porqué, no solo el qué', () => {
    expect(informe(uno("var u = 'https://script.google.com/macros/s/A/exec';"))).toMatch(
      /credencial/,
    );
  });

  it('sin hallazgos lo dice y ya', () => {
    expect(informe([])).toBe('plantilla limpia');
  });

  it('todos los tipos tienen motivo escrito', () => {
    const tipos = [
      'CORREO_NO_PERMITIDO',
      'CLIENTE_OAUTH',
      'URL_DE_DESPLIEGUE',
      'IDENTIFICADOR_LARGO',
      'CLAVE_PRIVADA',
      'MARCA_DE_PRUEBAS',
      'PENDIENTE_SIN_CERRAR',
    ] as const;
    for (const t of tipos) {
      expect(motivoDe(t), t).not.toBe(t);
      expect(motivoDe(t).length, t).toBeGreaterThan(15);
    }
  });
});

describe('la plantilla real', () => {
  it('no lleva NADA que no deba multiplicarse por cada familia', () => {
    // El trinquete de E8. Corre con cada `test:run`, no solo al publicar.
    const encontrados = hallazgos(leerPlantilla());
    expect(encontrados, '\n' + informe(encontrados)).toEqual([]);
  });

  it('y el manifiesto tampoco', () => {
    const manifiesto = leerPlantilla().filter((f) => f.nombre.endsWith('.json'));
    expect(manifiesto.length, 'no se está revisando el appsscript.json').toBe(1);
    expect(hallazgos(manifiesto)).toEqual([]);
  });

  it('cada correo permitido se usa de verdad: la lista no engorda sola', () => {
    // Una lista blanca que nadie poda acaba autorizando lo que ya no existe, y
    // entonces deja de ser una lista blanca.
    const todo = leerPlantilla()
      .map((f) => f.codigo)
      .join('\n')
      .toLowerCase();
    for (const correo of CORREOS_DE_EJEMPLO_PERMITIDOS) {
      expect(todo, `${correo} ya no aparece: quítalo de la lista`).toContain(correo);
    }
  });
});
