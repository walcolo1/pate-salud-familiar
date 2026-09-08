import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bloque B · Compilacion secundaria del arnes E2E.
    ".next-sin-config/**",
    // Bloque B · Codigo de terceros servido tal cual: el worker de pdf.js se
    // copia minificado desde node_modules. No es codigo del proyecto y
    // analizarlo solo produce ruido (1.571 avisos) sobre algo que no se edita.
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
