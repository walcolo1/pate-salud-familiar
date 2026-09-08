/**
 * Regenera e2e/axe-baseline.json.
 *
 * Existe como script de Node y no como `AXE_ACTUALIZAR=1 npm run axe` porque
 * esa forma de pasar variables no funciona en el símbolo del sistema de
 * Windows, que es donde se desarrolla este proyecto.
 */
import { spawnSync } from 'node:child_process';

const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', 'e2e/accesibilidad.e2e.ts'],
  { stdio: 'inherit', env: { ...process.env, AXE_ACTUALIZAR: '1' } },
);
process.exit(r.status ?? 1);
