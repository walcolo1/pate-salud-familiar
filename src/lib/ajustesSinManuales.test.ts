import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tras G4 · Ajustes no tiene botones para sincronizar a mano.
 *
 * La validación en vivo: al entrar, «Mi familia: 0», y los datos solo llegaban
 * tras pasar por Ajustes y pulsar botones. La carga es automática
 * (`cargaAlEntrar.ts`) y cada cambio se escribe solo (G4b); los permisos de
 * Drive y Calendar se piden cuando una función los necesita. Un botón que
 * «arregla» la sincronización enseña a desconfiar de ella.
 */

const AJUSTES = readFileSync(join(process.cwd(), 'src', 'app', 'settings', 'page.tsx'), 'utf8');

const RETIRADOS: Record<string, string> = {
  'btn-reconnect-google': 'Reconectar Google',
  'btn-reconnect-consent-banner': 'el aviso «Autorizar sincronización»',
  'btn-reconnect-drive': 'Reconectar Drive: la subida de documentos pide el permiso sola',
  'btn-reconnect-calendar': 'Reconectar Calendar: la agenda pide el permiso sola',
  'btn-reconnect-sheets': 'Reconectar Sheets: la web ya no pide ese permiso',
  'btn-sync-now': 'Sincronizar ahora',
  'btn-toggle-auto-sync': 'el interruptor de sincronización en fondo, que no controla nada',
};

describe('Ajustes sin sincronización manual', () => {
  for (const [id, que] of Object.entries(RETIRADOS)) {
    it(`sin ${que}`, () => {
      expect(AJUSTES).not.toContain(`"${id}"`);
    });
  }

  it('no llama a reconnectGoogle ni a syncNow', () => {
    expect(AJUSTES).not.toMatch(/\breconnectGoogle\b/);
    expect(AJUSTES).not.toMatch(/\bsyncNow\b/);
  });
});
