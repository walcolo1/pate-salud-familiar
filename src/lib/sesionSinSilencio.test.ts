import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cierre del Bloque H · la sesión en memoria no se tira, y si falta se dice.
 *
 * Trinquete sobre el código de AppContext y el Navbar: lo que la validación en
 * vivo encontró estaba en el cableado, no en una función que se pudiera
 * probar sola.
 */

const quitarComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const CONTEXTO = quitarComentarios(readFileSync(join(process.cwd(), 'src', 'context', 'AppContext.tsx'), 'utf8'));
const NAVBAR = quitarComentarios(readFileSync(join(process.cwd(), 'src', 'components', 'layout', 'Navbar.tsx'), 'utf8'));

describe('ninguna recarga completa se lleva el id_token', () => {
  it('AppContext no recarga la página', () => {
    // La purga diferida de la caché de Firebase recargaba al terminar, para
    // tirar una instancia de Firestore que no existe desde G4. Si terminaba
    // con alguien ya dentro, la recarga se llevaba su credencial.
    expect(CONTEXTO).not.toMatch(/location\.reload\(/);
  });
});

describe('si falta la credencial, se pide volver a entrar', () => {
  it('AppContext conecta el aviso de GIS', () => {
    expect(CONTEXTO).toMatch(/alPedirEntrada:/);
  });

  it('AppContext vigila la sesión y expone cómo volver a entrar', () => {
    expect(CONTEXTO).toMatch(/new VigiaSesion\(/);
    expect(CONTEXTO).toMatch(/hayQueEntrar/);
    expect(CONTEXTO).toMatch(/renderizarBotonGoogle/);
  });

  it('el Navbar lo enseña, con el botón de Google', () => {
    expect(NAVBAR).toMatch(/hayQueEntrar/);
    expect(NAVBAR).toMatch(/renderizarBotonGoogle/);
  });
});
