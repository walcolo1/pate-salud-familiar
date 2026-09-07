import { defineConfig } from 'vitest/config';

// Entorno `node` a propósito: los módulos bajo prueba aceptan un almacén
// inyectable, así que no hace falta jsdom ni ninguna emulación del navegador.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
