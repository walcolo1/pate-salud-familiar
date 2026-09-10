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
 * E2E · Accesibilidad con axe-core (C1.1, ampliado en C1.3a).
 *
 * Recorre las rutas reales de la aplicación con una sesión abierta y mide las
 * violaciones de accesibilidad que un navegador puede detectar solo.
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
 * POR QUÉ SE ABREN LOS DIÁLOGOS
 * ─────────────────────────────
 * axe solo ve lo que está pintado. La mayor deuda del proyecto —los campos de
 * formulario sin etiqueta— vive dentro de diálogos cerrados, así que medir la
 * página en reposo daba cero y hacía invisible tanto la deuda como su arreglo.
 * Cada subruta se analiza dos veces: en reposo y con su diálogo abierto.
 *
 * MODO LÍNEA BASE
 * ───────────────
 * Con `AXE_ACTUALIZAR=1` no compara: reescribe `axe-baseline.json` con lo que
 * encuentre. Es lo que se ejecuta al terminar cada paso de C1 para fijar el
 * avance. Sin esa variable, compara y falla si la deuda sube.
 */

const ACTUALIZAR = process.env.AXE_ACTUALIZAR === '1';

/** Rutas de primer nivel, sin diálogo que abrir. */
const RUTAS: ReadonlyArray<{ nombre: string; url: string; espera?: string }> = [
  { nombre: 'dashboard', url: '/dashboard' },
  { nombre: 'members', url: '/members' },
  { nombre: 'settings', url: '/settings' },
  { nombre: 'appointments-import', url: '/appointments/import' },
  { nombre: 'reminders', url: '/reminders' },
  { nombre: 'agenda', url: '/agenda' },
  { nombre: 'members-new', url: '/members/new' },
  // /onboarding se pinta fuera del armazon de la aplicacion: no hay <main>.
  { nombre: 'onboarding', url: '/onboarding', espera: 'body' },
];

/**
 * Subrutas de la ficha del familiar. Cada una tiene un botón que abre el
 * diálogo migrado en C1.3a; `abridor` es su texto visible.
 */
const SUBRUTAS = [
  { nombre: 'miembro-appts', segmento: 'appts', abridor: 'Programar cita' },
  { nombre: 'miembro-checkups', segmento: 'checkups', abridor: 'Registrar control' },
  { nombre: 'miembro-documents', segmento: 'documents', abridor: 'Subir documento' },
  { nombre: 'miembro-exams', segmento: 'exams', abridor: 'Registrar examen' },
  { nombre: 'miembro-medications', segmento: 'medications', abridor: 'Registrar Medicamento' },
  { nombre: 'miembro-orders', segmento: 'orders', abridor: 'Nueva Orden' },
  { nombre: 'miembro-vaccines', segmento: 'vaccines', abridor: 'Registrar vacuna' },
  { nombre: 'miembro-pets', segmento: 'pets', abridor: 'Registrar mascota' },
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

/** Identificador del primer familiar de la base de demostración. */
async function primerFamiliar(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const estado = JSON.parse(localStorage.getItem('pate-salud-state:demo') ?? '{}');
    const vivos = (estado.members ?? []).filter((m: { deletedAt?: unknown }) => !m.deletedAt);
    return vivos[0]?.id ?? null;
  });
  expect(id, 'la base de demostración debe traer al menos un familiar').toBeTruthy();
  return id as string;
}

/** Registra el detalle por regla y, de las graves, el elemento concreto. */
function informar(nombre: string, violaciones: ViolacionAxe[]) {
  const detalle = detallePorRegla(violaciones);
  if (detalle.length === 0) return;
  console.log(`\n[a11y] ${nombre}:`);
  for (const d of detalle) {
    console.log(`  ${d.gravedad.padEnd(9)} ${String(d.nodos).padStart(3)} nodo(s)  ${d.regla}`);
  }
  for (const v of violaciones) {
    if (v.impact !== 'critical' && v.impact !== 'serious') continue;
    for (const nodo of (v.nodes ?? []) as Array<{ target?: string[]; html?: string }>) {
      console.log(`    · ${v.id}  ${(nodo.target ?? []).join(' ')}`);
    }
  }
}

// Recuentos de esta ejecución, para el resumen final y el modo línea base.
const medido: LineaBase = {};

/** Mide una pantalla ya cargada y aplica la comparación con la línea base. */
async function medirYComparar(page: Page, nombre: string) {
  const violaciones = await analizar(page);
  const recuento = contarPorGravedad(violaciones);
  medido[nombre] = recuento;
  informar(nombre, violaciones);

  if (ACTUALIZAR) return;

  const base = leerLineaBase();
  const c = comparar(base[nombre], recuento);
  if (c.veredicto === 'mejora') console.log(mensajeMejora(nombre, c));
  expect(c.veredicto, mensajeRegresion(nombre, c)).not.toBe('REGRESION');
}

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
      await expect(page.locator(ruta.espera ?? 'main').first()).toBeVisible();

      await medirYComparar(page, ruta.nombre);
    });
  }

  for (const sub of SUBRUTAS) {
    test(`A11Y · ${sub.nombre}`, async ({ page }) => {
      const id = await primerFamiliar(page);
      await page.goto(`/members/${id}/${sub.segmento}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('main').first()).toBeVisible();

      // 1 · La pantalla en reposo.
      await medirYComparar(page, sub.nombre);

      // 2 · Con el diálogo abierto, que es donde viven los formularios.
      await page.getByRole('button', { name: sub.abridor }).first().click();
      const dialogo = page.locator('dialog[open]');
      await expect(dialogo, `no se abrió el diálogo de ${sub.nombre}`).toBeVisible({
        timeout: 10_000,
      });

      await medirYComparar(page, `${sub.nombre}-dialogo`);
    });
  }

  /**
   * Los tres diálogos de órdenes médicas (C1.3b).
   *
   * No salen en `SUBRUTAS` porque no basta con pulsar un botón: sus botones
   * solo existen cuando hay una orden en el estado adecuado, y la base de
   * demostración no trae ninguna. Se siembran dos órdenes sintéticas —una
   * pendiente de autorización y otra ya autorizada— y desde ahí se abre cada
   * diálogo. Sin esto, tres formularios clínicos migrados quedarían sin medir.
   */
  test('A11Y · miembro-orders · diálogos', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      const base = {
        memberId,
        orderType: 'EXAM',
        description: null,
        doctorName: 'Profesional Sintetico',
        issuedAt: ahora.slice(0, 10),
        requiresAuthorization: true,
        createdAt: ahora,
        updatedAt: ahora,
      };
      e.medicalOrders = [
        ...(e.medicalOrders ?? []),
        { ...base, id: 'orden-a11y-pendiente', title: 'ORDEN-A11Y-PENDIENTE', status: 'PENDING_AUTHORIZATION', authorizationStatus: 'PENDING' },
        { ...base, id: 'orden-a11y-autorizada', title: 'ORDEN-A11Y-AUTORIZADA', status: 'AUTHORIZED', authorizationStatus: 'AUTHORIZED' },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/orders`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main').first()).toBeVisible();

    const dialogo = page.locator('dialog[open]');
    const abrirYMedir = async (boton: string | RegExp, nombre: string) => {
      await page.getByRole('button', { name: boton }).first().click();
      await expect(dialogo, `no se abrió ${nombre}`).toBeVisible({ timeout: 10_000 });
      await medirYComparar(page, nombre);
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
    };

    await abrirYMedir('Registrar Aprobación', 'miembro-orders-autorizacion');
    await abrirYMedir('Adjuntar Soporte', 'miembro-orders-soporte');
    await abrirYMedir('Agendar Cita Médica', 'miembro-orders-agendar');
  });

  /**
   * La pantalla de peso de una mascota (D2).
   *
   * No cabe en `SUBRUTAS`: la ruta lleva el identificador de la mascota, y la
   * gráfica solo aparece si hay pesajes. Se siembra una mascota con serie y se
   * mide dos veces, como el resto: en reposo y con el diálogo abierto.
   */
  test('A11Y · mascota-peso', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      const dd = (n: number) => String(n).padStart(2, '0');
      const fecha = (dias: number) => {
        const d = new Date(Date.now() - dias * 86_400_000);
        return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
      };

      e.pets = [
        {
          id: 'pet-a11y',
          familyId: 'local',
          memberId,
          nombre: 'MASCOTA-A11Y',
          especie: 'PERRO',
          sexo: 'MACHO',
          activo: true,
          pesoIdealKg: 12,
          pesoActualKg: 14,
          createdAt: ahora,
          updatedAt: ahora,
          deletedAt: null,
        },
      ];
      e.petWeights = [
        { id: 'w-a11y-1', petId: 'pet-a11y', memberId, fecha: fecha(20), pesoKg: 12.5, nota: null, createdAt: ahora, updatedAt: ahora, deletedAt: null },
        { id: 'w-a11y-2', petId: 'pet-a11y', memberId, fecha: fecha(1), pesoKg: 14, nota: 'Nota sintetica', createdAt: ahora, updatedAt: ahora, deletedAt: null },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/pets/pet-a11y/peso`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main').first()).toBeVisible();

    await medirYComparar(page, 'mascota-peso');

    await page.getByRole('button', { name: 'Registrar peso' }).first().click();
    const dialogo = page.locator('dialog[open]');
    await expect(dialogo, 'no se abrió el diálogo de peso').toBeVisible({ timeout: 10_000 });

    await medirYComparar(page, 'mascota-peso-dialogo');
  });

  /** La cartilla de vacunas de una mascota (D3), con y sin diálogo. */
  test('A11Y · mascota-vacunas', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      const dd = (n: number) => String(n).padStart(2, '0');
      const fecha = (dias: number) => {
        const d = new Date(Date.now() + dias * 86_400_000);
        return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
      };

      e.pets = [
        {
          id: 'pet-a11y-vac',
          familyId: 'local',
          memberId,
          nombre: 'MASCOTA-A11Y-VAC',
          especie: 'GATO',
          sexo: 'HEMBRA',
          activo: true,
          createdAt: ahora,
          updatedAt: ahora,
          deletedAt: null,
        },
      ];
      // Una de cada estado, para que el color y sus etiquetas se midan todos.
      e.petVaccines = [
        { id: 'va1', petId: 'pet-a11y-vac', memberId, vacuna: 'Al dia', fecha: fecha(-40), proximaDosis: fecha(200), laboratorio: null, lote: null, veterinario: null, createdAt: ahora, updatedAt: ahora, deletedAt: null },
        { id: 'va2', petId: 'pet-a11y-vac', memberId, vacuna: 'Proxima', fecha: fecha(-300), proximaDosis: fecha(10), laboratorio: 'Lab sintetico', lote: 'L-1', veterinario: null, createdAt: ahora, updatedAt: ahora, deletedAt: null },
        { id: 'va3', petId: 'pet-a11y-vac', memberId, vacuna: 'Vencida', fecha: fecha(-400), proximaDosis: fecha(-15), laboratorio: null, lote: null, veterinario: null, createdAt: ahora, updatedAt: ahora, deletedAt: null },
        { id: 'va4', petId: 'pet-a11y-vac', memberId, vacuna: 'Sin refuerzo', fecha: fecha(-10), proximaDosis: null, laboratorio: null, lote: null, veterinario: null, createdAt: ahora, updatedAt: ahora, deletedAt: null },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/pets/pet-a11y-vac/vacunas`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main').first()).toBeVisible();

    await medirYComparar(page, 'mascota-vacunas');

    await page.getByRole('button', { name: 'Registrar vacuna' }).first().click();
    const dialogoVacuna = page.locator('dialog[open]');
    await expect(dialogoVacuna, 'no se abrió el diálogo de vacuna').toBeVisible({ timeout: 10_000 });

    await medirYComparar(page, 'mascota-vacunas-dialogo');
  });

  /** El historial veterinario de una mascota (D4), con y sin diálogo. */
  test('A11Y · mascota-historial', async ({ page }) => {
    const id = await primerFamiliar(page);
    await page.evaluate((memberId) => {
      const clave = 'pate-salud-state:demo';
      const e = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const ahora = new Date().toISOString();
      const dd = (n: number) => String(n).padStart(2, '0');
      const fecha = (dias: number) => {
        const d = new Date(Date.now() - dias * 86_400_000);
        return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
      };

      e.pets = [
        {
          id: 'pet-a11y-hist',
          familyId: 'local',
          memberId,
          nombre: 'MASCOTA-A11Y-HIST',
          especie: 'PERRO',
          sexo: 'MACHO',
          activo: true,
          createdAt: ahora,
          updatedAt: ahora,
          deletedAt: null,
        },
      ];
      // Varios tipos y varios años, para que se midan todas las insignias de
      // color y más de un encabezado de grupo.
      const base = {
        petId: 'pet-a11y-hist',
        memberId,
        tratamiento: 'Tratamiento sintetico',
        veterinario: 'Clinica sintetica',
        documentoId: null,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
      };
      e.petHistory = [
        { ...base, id: 'ha1', fecha: fecha(10), tipo: 'CONSULTA', diagnostico: 'Diagnostico A' },
        { ...base, id: 'ha2', fecha: fecha(120), tipo: 'URGENCIA', diagnostico: 'Diagnostico B' },
        { ...base, id: 'ha3', fecha: fecha(500), tipo: 'CIRUGIA', diagnostico: 'Diagnostico C' },
        { ...base, id: 'ha4', fecha: fecha(700), tipo: 'REVISION', diagnostico: 'Diagnostico D' },
      ];
      localStorage.setItem(clave, JSON.stringify(e));
    }, id);

    await page.goto(`/members/${id}/pets/pet-a11y-hist/historial`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main').first()).toBeVisible();

    await medirYComparar(page, 'mascota-historial');

    await page.getByRole('button', { name: 'Registrar atención' }).first().click();
    const dialogoHistorial = page.locator('dialog[open]');
    await expect(dialogoHistorial, 'no se abrió el diálogo de historial').toBeVisible({
      timeout: 10_000,
    });

    await medirYComparar(page, 'mascota-historial-dialogo');
  });

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
      console.log(`  ${nombre.padEnd(26)} ${linea}   ${marca}`);
    }
    console.log(
      `  ${'TOTAL'.padEnd(26)} ${GRAVEDADES.map((g) => `${g.slice(0, 3)}:${String(total[g]).padStart(2)}`).join('  ')}`,
    );

    if (ACTUALIZAR) {
      const nueva: LineaBase = { ...medido, total: total as RecuentoPorGravedad };
      escribirLineaBase(nueva);
      console.log('[a11y] línea base reescrita en e2e/axe-baseline.json');
    }
    console.log('');
  });
});
