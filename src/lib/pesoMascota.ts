/**
 * Peso de mascotas — Paté · Salud Familiar (Bloque D, D2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todo el cálculo de la gráfica y de las alertas vive aquí, fuera de React, y
 * por eso se puede probar sin navegador. Lo que queda en el componente es
 * dibujar lo que estas funciones devuelven.
 *
 * POR QUÉ NO HAY UNA BIBLIOTECA DE GRÁFICAS
 * ─────────────────────────────────────────
 * Se valoró y se descartó, con motivo:
 *
 *   · **Chart.js dibuja en `<canvas>`.** Un canvas es un mapa de píxeles: no
 *     tiene estructura, no lo lee un lector de pantalla y axe no puede
 *     comprobarlo. La línea base seguiría en cero mientras la gráfica es
 *     ilegible para parte del público, que es exactamente lo contrario de lo
 *     que el Bloque C vino a conseguir.
 *   · **Recharts sí dibuja SVG**, pero añade unos treinta paquetes
 *     transitivos a un proyecto que tiene **seis dependencias directas**, y su
 *     tooltip responde al ratón: el acceso por teclado habría que construirlo
 *     igualmente.
 *
 * Una línea de peso en el tiempo son unas cien líneas de SVG. Se dibuja aquí,
 * cada punto es un elemento con nombre accesible, y debajo va la misma serie
 * como tabla. Sin dependencia nueva y sin nada que no se pueda leer.
 */

import type { Pet, WeightEntry } from '../domain/mascotas';

/** A partir de aquí conviene mirarlo. */
export const UMBRAL_ADVERTENCIA = 10;
/** A partir de aquí conviene consultar. */
export const UMBRAL_ALERTA = 20;

export type NivelDesviacion = 'sin-referencia' | 'normal' | 'advertencia' | 'alerta';
export type DireccionDesviacion = 'encima' | 'debajo' | 'igual';

export interface Desviacion {
  nivel: NivelDesviacion;
  direccion: DireccionDesviacion;
  /** Porcentaje con signo, redondeado a un decimal. `null` sin referencia. */
  porcentaje: number | null;
  /** Frase lista para enseñar. Nunca depende solo del color. */
  mensaje: string;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/**
 * Compara el peso actual con el ideal.
 *
 * Sin peso ideal **no se inventa una referencia**: se devuelve
 * `sin-referencia`. Una alerta calculada contra un número que nadie fijó sería
 * ruido, y el ruido enseña a ignorar las alertas de verdad.
 */
export function calcularDesviacion(
  actual: number | null | undefined,
  ideal: number | null | undefined,
): Desviacion {
  const hayDatos =
    typeof actual === 'number' &&
    Number.isFinite(actual) &&
    actual > 0 &&
    typeof ideal === 'number' &&
    Number.isFinite(ideal) &&
    ideal > 0;

  if (!hayDatos) {
    return {
      nivel: 'sin-referencia',
      direccion: 'igual',
      porcentaje: null,
      mensaje: 'Sin peso ideal registrado, no se puede comparar.',
    };
  }

  const porcentaje = redondear(((actual - ideal) / ideal) * 100);
  const magnitud = Math.abs(porcentaje);

  const direccion: DireccionDesviacion =
    porcentaje > 0 ? 'encima' : porcentaje < 0 ? 'debajo' : 'igual';

  const nivel: NivelDesviacion =
    magnitud >= UMBRAL_ALERTA
      ? 'alerta'
      : magnitud >= UMBRAL_ADVERTENCIA
        ? 'advertencia'
        : 'normal';

  const mensaje =
    nivel === 'normal'
      ? direccion === 'igual'
        ? 'El peso coincide con el ideal.'
        : `El peso está dentro de lo esperado (${magnitud}% por ${direccion} del ideal).`
      : `Peso ${magnitud}% por ${direccion} del ideal.`;

  return { nivel, direccion, porcentaje, mensaje };
}

/** Los pesajes de una mascota, vivos y ordenados del más antiguo al más nuevo. */
export function serieDePesos(pesos: WeightEntry[], petId: string): WeightEntry[] {
  return (pesos ?? [])
    .filter((p) => p.petId === petId && !p.deletedAt)
    .sort((a, b) => (a.fecha === b.fecha ? a.id.localeCompare(b.id) : a.fecha < b.fecha ? -1 : 1));
}

/** El pesaje más reciente, o `null`. */
export function ultimoPeso(pesos: WeightEntry[], petId: string): WeightEntry | null {
  const serie = serieDePesos(pesos, petId);
  return serie.length > 0 ? serie[serie.length - 1] : null;
}

/**
 * Diferencia con el pesaje anterior, para decir si sube o baja.
 *
 * `null` cuando solo hay un pesaje: con un punto no hay tendencia, y fingir
 * una sería inventarse un dato.
 */
export function variacionUltima(pesos: WeightEntry[], petId: string): number | null {
  const serie = serieDePesos(pesos, petId);
  if (serie.length < 2) return null;
  return redondear(serie[serie.length - 1].pesoKg - serie[serie.length - 2].pesoKg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría de la gráfica
// ─────────────────────────────────────────────────────────────────────────────

/** Lienzo en unidades del `viewBox`. Se escala por CSS, no por píxeles. */
export const LIENZO = { ancho: 320, alto: 140, margen: { arriba: 10, derecha: 8, abajo: 22, izquierda: 34 } };

export interface PuntoGrafica {
  id: string;
  fecha: string;
  pesoKg: number;
  nota: string | null;
  x: number;
  y: number;
}

export interface Grafica {
  puntos: PuntoGrafica[];
  /** Coordenada `y` de la línea de peso ideal, o `null` si no lo hay. */
  yIdeal: number | null;
  /** Etiquetas del eje vertical, de arriba abajo. */
  marcasY: Array<{ valor: number; y: number }>;
  minimo: number;
  maximo: number;
}

/**
 * Convierte la serie en coordenadas.
 *
 * Dos casos que rompen cualquier gráfica hecha a la ligera y que aquí se
 * tratan a propósito:
 *
 *   · **Un solo punto.** No hay recorrido en X. Se coloca en el centro en vez
 *     de dividir entre cero.
 *   · **Todos los pesos iguales.** No hay recorrido en Y. Se abre una
 *     horquilla artificial alrededor del valor para que la línea salga recta
 *     por el medio y no pegada a un borde.
 */
export function construirGrafica(
  serie: WeightEntry[],
  pesoIdeal: number | null | undefined,
): Grafica {
  const { ancho, alto, margen } = LIENZO;
  const anchoUtil = ancho - margen.izquierda - margen.derecha;
  const altoUtil = alto - margen.arriba - margen.abajo;

  const valores = serie.map((p) => p.pesoKg);
  const conIdeal =
    typeof pesoIdeal === 'number' && Number.isFinite(pesoIdeal) && pesoIdeal > 0
      ? [...valores, pesoIdeal]
      : valores;

  if (conIdeal.length === 0) {
    return { puntos: [], yIdeal: null, marcasY: [], minimo: 0, maximo: 0 };
  }

  let minimo = Math.min(...conIdeal);
  let maximo = Math.max(...conIdeal);

  if (minimo === maximo) {
    // Sin recorrido: se abre un 10 % arriba y abajo, mínimo 0,1 kg.
    const holgura = Math.max(0.1, minimo * 0.1);
    minimo -= holgura;
    maximo += holgura;
  } else {
    const holgura = (maximo - minimo) * 0.12;
    minimo -= holgura;
    maximo += holgura;
  }
  if (minimo < 0) minimo = 0;

  const aY = (peso: number) => {
    const proporcion = (peso - minimo) / (maximo - minimo);
    return redondear(margen.arriba + altoUtil * (1 - proporcion));
  };

  const aX = (indice: number) => {
    if (serie.length <= 1) return redondear(margen.izquierda + anchoUtil / 2);
    return redondear(margen.izquierda + (anchoUtil * indice) / (serie.length - 1));
  };

  const puntos: PuntoGrafica[] = serie.map((p, i) => ({
    id: p.id,
    fecha: p.fecha,
    pesoKg: p.pesoKg,
    nota: p.nota ?? null,
    x: aX(i),
    y: aY(p.pesoKg),
  }));

  const marcasY = [maximo, (maximo + minimo) / 2, minimo].map((valor) => ({
    valor: redondear(valor),
    y: aY(valor),
  }));

  return {
    puntos,
    yIdeal:
      typeof pesoIdeal === 'number' && Number.isFinite(pesoIdeal) && pesoIdeal > 0
        ? aY(pesoIdeal)
        : null,
    marcasY,
    minimo: redondear(minimo),
    maximo: redondear(maximo),
  };
}

/** `d` de la polilínea que une los puntos. Cadena vacía si no hay ninguno. */
export function trazo(puntos: PuntoGrafica[]): string {
  if (puntos.length === 0) return '';
  return puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

/** `2026-03-10` → `10 mar`. Para el eje, donde no cabe más. */
export function fechaCorta(fecha: string): string {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  if (!m) return fecha ?? '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]}`;
}

/**
 * Nombre accesible de un punto.
 *
 * Es lo que oye quien recorre la gráfica con el teclado, así que dice las tres
 * cosas: cuándo, cuánto y —si la hay— la nota de ese pesaje.
 */
export function descripcionPunto(p: PuntoGrafica): string {
  const base = `${fechaCorta(p.fecha)}: ${p.pesoKg} kg`;
  return p.nota ? `${base}. ${p.nota}` : base;
}

/** Resumen de la mascota para la cabecera de la sección de peso. */
export interface ResumenPeso {
  ultimo: WeightEntry | null;
  variacion: number | null;
  desviacion: Desviacion;
}

export function resumenDePeso(pet: Pet, pesos: WeightEntry[]): ResumenPeso {
  const ultimo = ultimoPeso(pesos, pet.id);
  return {
    ultimo,
    variacion: variacionUltima(pesos, pet.id),
    // Se compara el último pesaje registrado, no `pesoActualKg`: ese campo es
    // un reflejo y puede quedarse atrás si algo falla al escribirlo.
    desviacion: calcularDesviacion(ultimo?.pesoKg ?? pet.pesoActualKg, pet.pesoIdealKg),
  };
}
