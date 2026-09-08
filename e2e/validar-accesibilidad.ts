/**
 * Línea base de accesibilidad — Paté · Salud Familiar (C1.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El proyecto arrastra deuda de accesibilidad conocida. Meter axe en el arnés
 * sin más dejaría `test:all` en rojo durante los cinco pasos de C1, y con la
 * puerta en rojo permanente se pierde lo único que aporta: distinguir una
 * regresión nueva de la deuda de siempre.
 *
 * Así que se usa el mismo mecanismo que ya funciona con el lint: una línea
 * base. La deuda actual queda registrada y **no puede crecer**; cada paso de
 * C1 la baja, y C1.5 la deja en cero.
 *
 * Este módulo NO ejecuta el navegador. Solo lee la línea base y compara
 * recuentos, para que la comparación se pueda probar y razonar por separado
 * de la ejecución de axe.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RUTA_LINEA_BASE = join('e2e', 'axe-baseline.json');

/** Las cuatro gravedades que reporta axe, de mayor a menor. */
export const GRAVEDADES = ['critical', 'serious', 'moderate', 'minor'] as const;
export type Gravedad = (typeof GRAVEDADES)[number];

/**
 * Las que hacen fallar la fase cuando C1.5 termine.
 *
 * `moderate` y `minor` se registran y se vigilan igual —no pueden subir—,
 * pero el criterio de aceptación acordado habla de críticas y graves.
 */
export const GRAVEDADES_BLOQUEANTES: readonly Gravedad[] = ['critical', 'serious'];

export type RecuentoPorGravedad = Record<Gravedad, number>;
export type LineaBase = Record<string, RecuentoPorGravedad>;

/** Violación de axe, reducida a lo que necesitamos comparar. */
export interface ViolacionAxe {
  id: string;
  impact?: string | null;
  nodes?: unknown[];
}

export function recuentoVacio(): RecuentoPorGravedad {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}

/**
 * Cuenta violaciones por gravedad.
 *
 * Se cuenta **una por nodo afectado**, no una por regla: cinco campos sin
 * etiqueta son cinco problemas que arreglar, aunque axe los agrupe bajo la
 * misma regla. Si se contara por regla, arreglar cuatro de los cinco no
 * movería el número y el progreso sería invisible.
 */
export function contarPorGravedad(violaciones: ViolacionAxe[]): RecuentoPorGravedad {
  const total = recuentoVacio();
  for (const v of violaciones) {
    const g = (v.impact ?? 'minor') as Gravedad;
    if (!GRAVEDADES.includes(g)) continue;
    total[g] += Math.max(1, v.nodes?.length ?? 1);
  }
  return total;
}

/** Reglas concretas y cuántos nodos afecta cada una, para saber por dónde empezar. */
export function detallePorRegla(violaciones: ViolacionAxe[]): Array<{
  regla: string;
  gravedad: string;
  nodos: number;
}> {
  return violaciones
    .map((v) => ({
      regla: v.id,
      gravedad: v.impact ?? 'minor',
      nodos: v.nodes?.length ?? 1,
    }))
    .sort((a, b) => b.nodos - a.nodos);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura y escritura de la línea base
// ─────────────────────────────────────────────────────────────────────────────

export function leerLineaBase(ruta: string = RUTA_LINEA_BASE): LineaBase {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')) as LineaBase;
  } catch {
    // Sin línea base, todo cuenta como cero: la primera ejecución registrará
    // lo que haya en vez de fallar con un archivo que aún no existe.
    return {};
  }
}

export function escribirLineaBase(datos: LineaBase, ruta: string = RUTA_LINEA_BASE): void {
  const ordenado: LineaBase = {};
  for (const clave of Object.keys(datos).sort()) ordenado[clave] = datos[clave];
  writeFileSync(ruta, JSON.stringify(ordenado, null, 2) + '\n', 'utf8');
}

/** Suma de todas las rutas, para la fila `total`. */
export function sumar(base: LineaBase): RecuentoPorGravedad {
  const total = recuentoVacio();
  for (const [clave, recuento] of Object.entries(base)) {
    if (clave === 'total') continue;
    for (const g of GRAVEDADES) total[g] += recuento[g] ?? 0;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparación
// ─────────────────────────────────────────────────────────────────────────────

export type Veredicto = 'igual' | 'mejora' | 'REGRESION';

export interface Comparacion {
  veredicto: Veredicto;
  /** Gravedades que subieron. Cualquiera basta para fallar. */
  subieron: Array<{ gravedad: Gravedad; base: number; ahora: number }>;
  bajaron: Array<{ gravedad: Gravedad; base: number; ahora: number }>;
}

/**
 * Compara el resultado de una ruta con su línea base.
 *
 * Sube una gravedad, aunque sea `minor` → REGRESIÓN. La línea base existe
 * para congelar la deuda, no para dejar sitio a más.
 */
export function comparar(
  base: RecuentoPorGravedad | undefined,
  ahora: RecuentoPorGravedad,
): Comparacion {
  const referencia = base ?? recuentoVacio();
  const subieron: Comparacion['subieron'] = [];
  const bajaron: Comparacion['bajaron'] = [];

  for (const g of GRAVEDADES) {
    const b = referencia[g] ?? 0;
    const a = ahora[g] ?? 0;
    if (a > b) subieron.push({ gravedad: g, base: b, ahora: a });
    else if (a < b) bajaron.push({ gravedad: g, base: b, ahora: a });
  }

  if (subieron.length > 0) return { veredicto: 'REGRESION', subieron, bajaron };
  if (bajaron.length > 0) return { veredicto: 'mejora', subieron, bajaron };
  return { veredicto: 'igual', subieron, bajaron };
}

/** Mensaje de fallo, con lo que hace falta para entenderlo sin abrir nada. */
export function mensajeRegresion(ruta: string, c: Comparacion): string {
  const lineas = [
    `Accesibilidad: la ruta ${ruta} tiene MÁS violaciones que su línea base.`,
    '',
    ...c.subieron.map(
      (s) => `  ${s.gravedad}: línea base ${s.base} → ahora ${s.ahora}  (+${s.ahora - s.base})`,
    ),
    '',
    'Si el aumento es deliberado, no subas la línea base sin justificarlo:',
    'la deuda de accesibilidad solo debería bajar. Para regenerarla:',
    '  npm run axe:linea-base',
  ];
  return lineas.join('\n');
}

/** Aviso cuando la deuda baja: hay que actualizar la línea base para fijar el avance. */
export function mensajeMejora(ruta: string, c: Comparacion): string {
  const detalle = c.bajaron
    .map((b) => `${b.gravedad} ${b.base} → ${b.ahora}`)
    .join(', ');
  return `Accesibilidad: ${ruta} MEJORA (${detalle}). Baja la línea base con: npm run axe:linea-base`;
}
