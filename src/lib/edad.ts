/**
 * Edad — Paté · Salud Familiar (C3.3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El cálculo estaba copiado en `members/page.tsx` y en `members/[id]/page.tsx`,
 * y escrito otra vez, distinto, en los formularios de alta y edición. Cuatro
 * versiones de la misma cuenta es una forma segura de que tres se equivoquen.
 *
 * DOS DECISIONES QUE IMPORTAN EN UNA APLICACIÓN DE SALUD
 * ─────────────────────────────────────────────────────
 *   · **Los meses cuentan.** «0 años» no dice nada de un bebé de tres meses, y
 *     en pediatría la diferencia entre tres y nueve meses lo es todo. Por
 *     debajo del año se cuenta en meses, y por debajo del mes en días.
 *   · **Nada de `new Date('YYYY-MM-DD')`.** Se interpreta como medianoche UTC,
 *     y al oeste de Greenwich eso resta un día: alguien nacido el 1 de enero
 *     cumple años el 31 de diciembre. Se construye en hora local.
 */

/** `YYYY-MM-DD` → `Date` local a mediodía, lejos de cualquier cambio de hora. */
function aFechaLocal(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto ?? '');
  if (!m) return null;
  const [, a, mes, d] = m;
  const fecha = new Date(Number(a), Number(mes) - 1, Number(d), 12, 0, 0, 0);
  const valida =
    fecha.getFullYear() === Number(a) &&
    fecha.getMonth() === Number(mes) - 1 &&
    fecha.getDate() === Number(d);
  return valida ? fecha : null;
}

/**
 * Años cumplidos, o `null` si la fecha no es utilizable.
 *
 * `null` y no `0`: un cero se pinta como «0 años» y parece un dato.
 */
export function edadEnAnios(nacimiento: string, hoy: Date = new Date()): number | null {
  const nace = aFechaLocal(nacimiento);
  if (!nace) return null;
  if (nace.getTime() > hoy.getTime()) return null; // fecha futura: no es una edad

  let anios = hoy.getFullYear() - nace.getFullYear();
  const mes = hoy.getMonth() - nace.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nace.getDate())) anios--;
  return anios;
}

/** Meses cumplidos. Útil por debajo del primer año. */
export function edadEnMeses(nacimiento: string, hoy: Date = new Date()): number | null {
  const nace = aFechaLocal(nacimiento);
  if (!nace) return null;
  if (nace.getTime() > hoy.getTime()) return null;

  let meses = (hoy.getFullYear() - nace.getFullYear()) * 12 + (hoy.getMonth() - nace.getMonth());
  if (hoy.getDate() < nace.getDate()) meses--;
  return Math.max(0, meses);
}

/**
 * La edad tal y como se enseña: «34 años», «7 meses», «12 días».
 *
 * Devuelve `null` cuando no hay fecha utilizable, para que quien lo pinte
 * decida qué poner en su lugar en vez de recibir un «0 años» inventado.
 */
export function descripcionEdad(nacimiento: string, hoy: Date = new Date()): string | null {
  const anios = edadEnAnios(nacimiento, hoy);
  if (anios === null) return null;
  if (anios >= 1) return `${anios} ${anios === 1 ? 'año' : 'años'}`;

  const meses = edadEnMeses(nacimiento, hoy) ?? 0;
  if (meses >= 1) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;

  const nace = aFechaLocal(nacimiento);
  if (!nace) return null;
  const dias = Math.floor((hoy.getTime() - nace.getTime()) / 86_400_000);
  return `${Math.max(0, dias)} ${dias === 1 ? 'día' : 'días'}`;
}
