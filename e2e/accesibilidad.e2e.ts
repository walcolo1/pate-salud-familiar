import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bloquearGoogle, entrarEnModoDemo } from './apoyo';
import {
  GRAVEDADES,
  comparar,
  contarPorGravedad,
  detallePorRegla,
  escribirLineaBase,
  leerLineaBase,
  mensajeMejora,
  mensajeRegresion,
  recuentoVacio,
  sumar,
  type LineaBase,
  type RecuentoPorGravedad,
  type ViolacionAxe,
} from './validar-accesibilidad';

/**
 * E2E · Accesibilidad con axe-core (C1.1).
 *
 * Recorre las rutas reales de la aplicación con una sesión abierta y mide las
 * violaciones de accesibilidad que un navegador puede detectar sola.
 *
 * QUÉ MIDE Y QUÉ NO
 * ─────────────────
 * axe encuentra lo comprobable por máquina: campos sin etiqueta, contraste
 * insuficiente, controles sin nombre accesible, estructura mal anidada. NO
 * encuentra lo que exige criterio humano: si el orden de tabulación tiene
 * sentido, si un texto alternativo describe la imagen o miente, si un
 * formulario clínico se puede completar con lector de pantalla sin perderse.
 * Eso queda como validación manual en `TESTING.md`.
 *
 * Pasar esta suite no significa que la aplicación sea accesible. Significa que
 * no tiene los fallos que una máquina sabe detectar, que es un suelo, no un
 * techo.
 *
 * MODO LÍNEA BASE
 * ───────────────
 * Con `AXE_ACTUALIZAR=1` no compara: reescribe `axe-baseline.json` con lo que
 * encuentre. Es lo que se ejecuta al terminar cada paso de C1 para fijar el
 * avance. Sin esa variable, compara y falla si la deuda sube.
 */

const ACTUALIZAR = process.env.AXE_ACTUALIZAR === '1';

/** Las cinco rutas que ya cubre el arnés y que concentran la interfaz. */
const RUTAS = [
  { nombre: 'dashboard', url: '/dashboard' },
  { nombre: 'members', url: '/members' },
  { nombre: 'settings', url: '/settings' },
  { nombre: 'appointments-import', url: '/appointments/import' },
  { nombre: 'reminders', url: '/reminders' },
] as const;

/**
 * Analiza la página entera con las reglas WCAG 2.1 AA.
 *
 * No se excluye ningún selector: excluir es la forma más fácil de que un
 * arnés de accesibilidad diga que todo está bien sin haber mirado.
 */
async function analizar(page: Page): Promise<ViolacionAxe[]> {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return resultado.violations as unknown as ViolacionAxe[];
}

// Recuentos de esta ejecución, para el resumen final y el modo línea base.
const medido: LineaBase = {};

test.describe('C1 · accesibilidad', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearGoogle(page);
    await entrarEnModoDemo(page);
  });

  for (const ruta of RUTAS) {
    test(`A11Y · ${ruta.nombre}`, async ({ page }) => {
      await page.goto(ruta.url);
      // Sin esperar a que la interfaz termine de pintar, axe mediría un
      // esqueleto de carga en vez de la pantalla real.
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('main').first()).toBeVisible();

      const violaciones = await analizar(page);
      const recuento = contarPorGravedad(violaciones);
      medido[ruta.nombre] = recuento;

      // Detalle por regla: sin esto, el número dice que hay deuda pero no
      // por dónde entrarle.
      const detalle = detallePorRegla(violaciones);
      if (detalle.length > 0) {
        console.log(`\n[a11y] ${ruta.nombre}:`);
        for (const d of detalle) {
          console.log(`  ${d.gravedad.padEnd(9)} ${String(d.nodos).padStart(3)} nodo(s)  ${d.regla}`);
        }
      }

      // De las críticas y graves se imprime tambien QUE elemento falla: sin el
      // selector, el recuento dice que hay deuda pero no por donde entrarle.
      for (const v of violaciones) {
        if (v.impact !== 'critical' && v.impact !== 'serious') continue;
        for (const nodo of (v.nodes ?? []) as Array<{ target?: string[]; html?: string }>) {
          const selector = (nodo.target ?? []).join(' ');
          const html = (nodo.html ?? '').replace(/\s+/g, ' ').slice(0, 110);
          console.log(`    · ${v.id}  ${selector}`);
          console.log(`      ${html}`);
        }
      }

      if (ACTUALIZAR) {
        test.info().annotations.push({
          type: 'linea-base',
          description: `${ruta.nombre}: ${JSON.stringify(recuento)}`,
        });
        return;
      }

      const base = leerLineaBase();
      const c = comparar(base[ruta.nombre], recuento);

      if (c.veredicto === 'mejora') console.log(mensajeMejora(ruta.nombre, c));
      expect(c.veredicto, mensajeRegresion(ruta.nombre, c)).not.toBe('REGRESION');
    });
  }

  test.afterAll(() => {
    if (Object.keys(medido).length === 0) return;

    const total = sumar(medido);
    const base = leerLineaBase();

    console.log('\n[a11y] ── resumen ─────────────────────────────────────');
    for (const nombre of Object.keys(medido).sort()) {
      const r = medido[nombre];
      const b = base[nombre] ?? recuentoVacio();
      const linea = GRAVEDADES.map((g) => `${g.slice(0, 3)}:${String(r[g]).padStart(2)}`).join('  ');
      const delta = GRAVEDADES.reduce((s, g) => s + (r[g] - (b[g] ?? 0)), 0);
      const marca = delta === 0 ? '=' : delta < 0 ? `▼${-delta}` : `▲${delta}`;
      console.log(`  ${nombre.padEnd(22)} ${linea}   ${marca}`);
    }
    console.log(`  ${'TOTAL'.padEnd(22)} ${GRAVEDADES.map((g) => `${g.slice(0, 3)}:${String(total[g]).padStart(2)}`).join('  ')}`);

    if (ACTUALIZAR) {
      const nueva: LineaBase = { ...medido, total: total as RecuentoPorGravedad };
      escribirLineaBase(nueva);
      console.log('[a11y] línea base reescrita en e2e/axe-baseline.json');
    }
    console.log('');
  });
});
