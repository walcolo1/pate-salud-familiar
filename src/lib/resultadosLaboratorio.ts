/**
 * Resultados de laboratorio — Paté · Salud Familiar (Bloque N)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tres cosas, todas deterministas y sin red:
 *
 *   1. LEER un informe (texto de un PDF o pegado) y proponer filas
 *      `analito · valor · unidad · mínimo · máximo`, más la fecha de la
 *      muestra y el laboratorio. Son reglas y expresiones regulares: el mismo
 *      texto da siempre las mismas filas, y el informe no sale del navegador.
 *   2. NORMALIZAR el nombre del analito contra un catálogo canónico de
 *      sinónimos («Glicemia basal», «Glucosa en suero» → `GLUCOSA`), por
 *      especie: un informe veterinario nunca se guarda en la ficha de una
 *      persona ni al revés.
 *   3. COMPARAR los resultados de un paciente a lo largo del tiempo: estado
 *      frente al rango del propio laboratorio (BAJO / NORMAL / ALTO), Δ y Δ %
 *      entre los dos últimos, cruce de rango y tendencia.
 *
 * REGLAS DURAS
 * ────────────
 * · Jamás se compara entre unidades distintas: la clave de una serie es
 *   `código canónico + unidad normalizada`. `mg/dL` y `mmol/L` son dos series.
 * · El rango es SIEMPRE el que imprime el laboratorio en ese informe. Este
 *   módulo no trae rangos «de referencia» propios: no los hay universales, y
 *   menos entre especies.
 * · Nada de esto interpreta. Dice si un número está dentro del rango que el
 *   mismo informe declara; la lectura clínica es del médico o veterinario.
 *
 * CÓMO SE GUARDA (pestaña `EXAMENES_RESULTADOS`, sin cambiar el esquema)
 * ──────────────────────────────────────────────────────────────────────
 *   parametro            nombre del analito tal como lo verificó la persona
 *   valor                número con punto decimal, o el texto cualitativo
 *   unidad               la del informe
 *   rango_referencia     «70 - 100», «< 200», «> 40» o el texto cualitativo
 *   fuera_de_rango       SI / NO, calculado aquí
 *   confianza_extraccion ALTA / MEDIA / BAJA (lector) · MANUAL · CORREGIDO
 *   verificado_por       marca de revisión humana (sin correo ni nombre)
 *
 * El código canónico, el mínimo y el máximo se derivan AL LEER, así que una
 * mejora del catálogo reagrupa también el histórico ya guardado.
 */

export type Especie = 'HUMANO' | 'MASCOTA';

export type EstadoRango = 'BAJO' | 'NORMAL' | 'ALTO' | 'FUERA' | 'SIN_RANGO';

export type Confianza = 'ALTA' | 'MEDIA' | 'BAJA' | 'MANUAL' | 'CORREGIDO';

export type Tendencia = 'SUBIENDO' | 'ESTABLE' | 'BAJANDO' | 'INSUFICIENTE';

/** Marca que se escribe en `verificado_por`. No identifica a nadie. */
export const MARCA_VERIFICACION = 'REVISION_HUMANA';

/** Por debajo de este cambio relativo, una serie se considera estable. */
export const UMBRAL_ESTABLE = 0.05;

/** Cuántos exámenes (columnas) enseña el comparativo. */
export const MAXIMO_EXAMENES_COMPARATIVO = 6;

export const AVISO_LEGAL_COMPARATIVO =
  'Este comparativo es una herramienta para leer tus propios documentos: ' +
  'compara cada valor con el rango que imprimió el laboratorio. No es un ' +
  'diagnóstico. La interpretación clínica corresponde siempre al médico o ' +
  'veterinario tratante.';

// ─── Catálogo ──────────────────────────────────────────────────────────────

export interface AnalitoCatalogo {
  codigo: string;
  /** Nombre para mostrar. */
  nombre: string;
  /** Formas en que aparece en los informes (se comparan normalizadas). */
  sinonimos: string[];
  especies: Especie[];
}

const AMBAS: Especie[] = ['HUMANO', 'MASCOTA'];
const HUMANO: Especie[] = ['HUMANO'];
const MASCOTA: Especie[] = ['MASCOTA'];

export const CATALOGO_ANALITOS: AnalitoCatalogo[] = [
  // Metabolismo de la glucosa
  { codigo: 'GLUCOSA', nombre: 'Glucosa', especies: AMBAS, sinonimos: [
    'glucosa', 'glicemia', 'glucemia', 'glicemia basal', 'glucemia basal',
    'glucosa basal', 'glucosa en suero', 'glucosa suero', 'glucosa en ayunas',
    'glicemia en ayunas', 'glucosa plasmatica', 'glicemia pre', 'glucosa pre',
  ] },
  { codigo: 'HBA1C', nombre: 'Hemoglobina glicosilada (HbA1c)', especies: HUMANO, sinonimos: [
    'hba1c', 'hemoglobina glicosilada', 'hemoglobina glucosilada',
    'hemoglobina glicada', 'hemoglobina a1c', 'a1c',
  ] },
  { codigo: 'INSULINA', nombre: 'Insulina', especies: AMBAS, sinonimos: ['insulina', 'insulina basal'] },
  { codigo: 'FRUCTOSAMINA', nombre: 'Fructosamina', especies: AMBAS, sinonimos: ['fructosamina'] },

  // Perfil lipídico
  { codigo: 'COLESTEROL_TOTAL', nombre: 'Colesterol total', especies: AMBAS, sinonimos: [
    'colesterol total', 'colesterol', 'colesterol serico', 'ct', 'total colesterol',
  ] },
  { codigo: 'COLESTEROL_HDL', nombre: 'Colesterol HDL', especies: AMBAS, sinonimos: [
    'colesterol hdl', 'hdl colesterol', 'hdl', 'hdl c', 'c hdl', 'colesterol de alta densidad',
    'colesterol hdl directo', 'hdl directo',
  ] },
  { codigo: 'COLESTEROL_LDL', nombre: 'Colesterol LDL', especies: AMBAS, sinonimos: [
    'colesterol ldl', 'ldl colesterol', 'ldl', 'ldl c', 'c ldl', 'colesterol de baja densidad',
    'colesterol ldl directo', 'ldl directo', 'colesterol ldl calculado', 'ldl calculado',
  ] },
  { codigo: 'COLESTEROL_VLDL', nombre: 'Colesterol VLDL', especies: AMBAS, sinonimos: [
    'colesterol vldl', 'vldl colesterol', 'vldl', 'vldl c',
  ] },
  { codigo: 'TRIGLICERIDOS', nombre: 'Triglicéridos', especies: AMBAS, sinonimos: [
    'trigliceridos', 'triglicerido', 'trigliceridos en suero', 'tg',
  ] },
  { codigo: 'INDICE_CT_HDL', nombre: 'Índice colesterol total / HDL', especies: HUMANO, sinonimos: [
    'indice colesterol total hdl', 'relacion colesterol total hdl', 'indice ct hdl',
    'relacion ct hdl', 'indice aterogenico', 'indice arterial',
  ] },

  // Función renal
  { codigo: 'CREATININA', nombre: 'Creatinina', especies: AMBAS, sinonimos: [
    'creatinina', 'creatinina en suero', 'creatinina serica', 'creatinina suero',
  ] },
  { codigo: 'BUN', nombre: 'Nitrógeno ureico (BUN)', especies: AMBAS, sinonimos: [
    'bun', 'nitrogeno ureico', 'nitrogeno ureico en suero', 'nitrogeno ureico bun',
  ] },
  { codigo: 'UREA', nombre: 'Urea', especies: AMBAS, sinonimos: ['urea', 'urea en suero'] },
  { codigo: 'TFG', nombre: 'Tasa de filtración glomerular', especies: HUMANO, sinonimos: [
    'tfg', 'tasa de filtracion glomerular', 'filtracion glomerular', 'tfg estimada', 'egfr',
  ] },
  { codigo: 'MICROALBUMINURIA', nombre: 'Microalbuminuria', especies: HUMANO, sinonimos: [
    'microalbuminuria', 'microalbumina', 'microalbumina en orina',
  ] },
  { codigo: 'SDMA', nombre: 'SDMA', especies: MASCOTA, sinonimos: ['sdma', 'dimetilarginina simetrica'] },
  { codigo: 'ACIDO_URICO', nombre: 'Ácido úrico', especies: AMBAS, sinonimos: [
    'acido urico', 'acido urico en suero', 'uricemia',
  ] },

  // Tiroides
  { codigo: 'TSH', nombre: 'TSH', especies: AMBAS, sinonimos: [
    'tsh', 'hormona estimulante de tiroides', 'hormona estimulante del tiroides',
    'tirotropina', 'tsh ultrasensible', 'tsh tercera generacion',
  ] },
  { codigo: 'T4_LIBRE', nombre: 'T4 libre', especies: AMBAS, sinonimos: ['t4 libre', 'tiroxina libre', 'ft4', 't4l'] },
  { codigo: 'T4_TOTAL', nombre: 'T4 total', especies: AMBAS, sinonimos: ['t4 total', 'tiroxina total', 't4'] },
  { codigo: 'T3', nombre: 'T3', especies: AMBAS, sinonimos: ['t3', 't3 total', 'triyodotironina'] },

  // Hemograma
  { codigo: 'HEMOGLOBINA', nombre: 'Hemoglobina', especies: AMBAS, sinonimos: ['hemoglobina', 'hb', 'hgb'] },
  { codigo: 'HEMATOCRITO', nombre: 'Hematocrito', especies: AMBAS, sinonimos: ['hematocrito', 'hto', 'hct'] },
  { codigo: 'ERITROCITOS', nombre: 'Eritrocitos', especies: AMBAS, sinonimos: [
    'eritrocitos', 'globulos rojos', 'recuento de globulos rojos', 'hematies', 'rbc',
  ] },
  { codigo: 'LEUCOCITOS', nombre: 'Leucocitos', especies: AMBAS, sinonimos: [
    'leucocitos', 'globulos blancos', 'recuento de leucocitos', 'recuento de globulos blancos', 'wbc',
  ] },
  { codigo: 'NEUTROFILOS', nombre: 'Neutrófilos', especies: AMBAS, sinonimos: [
    'neutrofilos', 'neutrofilos segmentados', 'segmentados', 'neu',
  ] },
  { codigo: 'LINFOCITOS', nombre: 'Linfocitos', especies: AMBAS, sinonimos: ['linfocitos', 'lin', 'lym'] },
  { codigo: 'MONOCITOS', nombre: 'Monocitos', especies: AMBAS, sinonimos: ['monocitos', 'mon', 'mono'] },
  { codigo: 'EOSINOFILOS', nombre: 'Eosinófilos', especies: AMBAS, sinonimos: ['eosinofilos', 'eos'] },
  { codigo: 'PLAQUETAS', nombre: 'Plaquetas', especies: AMBAS, sinonimos: [
    'plaquetas', 'recuento de plaquetas', 'recuento plaquetas', 'plt',
  ] },
  { codigo: 'VCM', nombre: 'Volumen corpuscular medio (VCM)', especies: AMBAS, sinonimos: [
    'vcm', 'volumen corpuscular medio', 'mcv',
  ] },
  { codigo: 'HCM', nombre: 'Hemoglobina corpuscular media (HCM)', especies: AMBAS, sinonimos: [
    'hcm', 'hemoglobina corpuscular media', 'mch',
  ] },
  { codigo: 'CHCM', nombre: 'Concentración de Hb corpuscular media (CHCM)', especies: AMBAS, sinonimos: [
    'chcm', 'concentracion de hemoglobina corpuscular media', 'mchc',
  ] },
  { codigo: 'RDW', nombre: 'Ancho de distribución eritrocitaria (RDW)', especies: AMBAS, sinonimos: [
    'rdw', 'rdw cv', 'ancho de distribucion eritrocitaria',
  ] },
  { codigo: 'VSG', nombre: 'Velocidad de sedimentación (VSG)', especies: AMBAS, sinonimos: [
    'vsg', 'velocidad de sedimentacion', 'velocidad de sedimentacion globular', 'eritrosedimentacion',
  ] },

  // Hígado
  { codigo: 'ALT', nombre: 'ALT (TGP)', especies: AMBAS, sinonimos: [
    'alt', 'tgp', 'alt tgp', 'tgp alt', 'alanino aminotransferasa', 'transaminasa piruvica',
    'transaminasa glutamico piruvica',
  ] },
  { codigo: 'AST', nombre: 'AST (TGO)', especies: AMBAS, sinonimos: [
    'ast', 'tgo', 'ast tgo', 'tgo ast', 'aspartato aminotransferasa', 'transaminasa oxalacetica',
    'transaminasa glutamico oxalacetica',
  ] },
  { codigo: 'FOSFATASA_ALCALINA', nombre: 'Fosfatasa alcalina', especies: AMBAS, sinonimos: [
    'fosfatasa alcalina', 'fa', 'alp',
  ] },
  { codigo: 'GGT', nombre: 'Gamma glutamil transferasa (GGT)', especies: AMBAS, sinonimos: [
    'ggt', 'gamma glutamil transferasa', 'gamma glutamil transpeptidasa', 'gama glutamil transferasa',
  ] },
  { codigo: 'BILIRRUBINA_TOTAL', nombre: 'Bilirrubina total', especies: AMBAS, sinonimos: ['bilirrubina total'] },
  { codigo: 'BILIRRUBINA_DIRECTA', nombre: 'Bilirrubina directa', especies: AMBAS, sinonimos: ['bilirrubina directa'] },
  { codigo: 'BILIRRUBINA_INDIRECTA', nombre: 'Bilirrubina indirecta', especies: AMBAS, sinonimos: ['bilirrubina indirecta'] },
  { codigo: 'ALBUMINA', nombre: 'Albúmina', especies: AMBAS, sinonimos: ['albumina', 'albumina serica'] },
  { codigo: 'PROTEINAS_TOTALES', nombre: 'Proteínas totales', especies: AMBAS, sinonimos: ['proteinas totales'] },

  // Electrolitos y minerales
  { codigo: 'SODIO', nombre: 'Sodio', especies: AMBAS, sinonimos: ['sodio', 'na', 'sodio serico'] },
  { codigo: 'POTASIO', nombre: 'Potasio', especies: AMBAS, sinonimos: ['potasio', 'k', 'potasio serico'] },
  { codigo: 'CLORO', nombre: 'Cloro', especies: AMBAS, sinonimos: ['cloro', 'cl', 'cloruro'] },
  { codigo: 'CALCIO', nombre: 'Calcio', especies: AMBAS, sinonimos: ['calcio', 'calcio total', 'calcio serico'] },
  { codigo: 'MAGNESIO', nombre: 'Magnesio', especies: AMBAS, sinonimos: ['magnesio'] },
  { codigo: 'FOSFORO', nombre: 'Fósforo', especies: AMBAS, sinonimos: ['fosforo', 'fosforo inorganico'] },
  { codigo: 'HIERRO', nombre: 'Hierro sérico', especies: AMBAS, sinonimos: ['hierro', 'hierro serico'] },
  { codigo: 'FERRITINA', nombre: 'Ferritina', especies: AMBAS, sinonimos: ['ferritina'] },

  // Vitaminas, inflamación, próstata
  { codigo: 'VITAMINA_D', nombre: 'Vitamina D (25-OH)', especies: HUMANO, sinonimos: [
    'vitamina d', '25 oh vitamina d', 'vitamina d 25 oh', '25 hidroxi vitamina d', 'vitamina d total',
  ] },
  { codigo: 'VITAMINA_B12', nombre: 'Vitamina B12', especies: AMBAS, sinonimos: ['vitamina b12', 'cobalamina', 'b12'] },
  { codigo: 'PCR', nombre: 'Proteína C reactiva', especies: AMBAS, sinonimos: [
    'pcr', 'proteina c reactiva', 'proteina c reactiva ultrasensible', 'pcr ultrasensible',
  ] },
  { codigo: 'PSA_TOTAL', nombre: 'Antígeno prostático (PSA) total', especies: HUMANO, sinonimos: [
    'psa', 'psa total', 'antigeno prostatico', 'antigeno prostatico especifico',
    'antigeno prostatico especifico total', 'antigeno especifico de prostata',
  ] },
  { codigo: 'PSA_LIBRE', nombre: 'PSA libre', especies: HUMANO, sinonimos: [
    'psa libre', 'antigeno prostatico especifico libre', 'antigeno prostatico libre',
  ] },
  { codigo: 'LIPASA_PANCREATICA', nombre: 'Lipasa pancreática específica (cPL/fPL)', especies: MASCOTA, sinonimos: [
    'cpl', 'fpl', 'spec cpl', 'spec fpl', 'lipasa pancreatica especifica',
  ] },
];

// ─── Normalización ─────────────────────────────────────────────────────────

/** Minúsculas, sin tildes, sin paréntesis ni puntuación, espacios simples. */
export function normalizarNombre(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unidad normalizada, solo para COMPARAR (se muestra la original).
 * `mg/dL` = `mg/dl` = `MG/DL`; `µUI/mL` = `uUI/ml`; `x10³/µL` = `10^3/ul`.
 */
export function normalizarUnidad(unidad: string | null | undefined): string {
  return String(unidad ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/mcl\b/g, 'ul')
    .replace(/mm3\b/g, 'ul') // 1 mm³ = 1 µL
    .replace(/³/g, '3')
    .replace(/\s+/g, '')
    .replace(/\^/g, '')
    .replace(/^x(?=10)/, '')
    .replace(/\*/g, '')
    .trim();
}

interface EntradaIndice { analito: AnalitoCatalogo; sinonimo: string }

const INDICE: Map<string, AnalitoCatalogo> = new Map();
const SINONIMOS_ORDENADOS: EntradaIndice[] = [];
for (const analito of CATALOGO_ANALITOS) {
  for (const s of [analito.nombre, analito.codigo.replace(/_/g, ' '), ...analito.sinonimos]) {
    const n = normalizarNombre(s);
    if (!n) continue;
    if (!INDICE.has(n)) INDICE.set(n, analito);
    SINONIMOS_ORDENADOS.push({ analito, sinonimo: n });
  }
}
// El más largo primero: «hemoglobina glicosilada» antes que «hemoglobina».
SINONIMOS_ORDENADOS.sort((a, b) => b.sinonimo.length - a.sinonimo.length);

export interface Coincidencia {
  analito: AnalitoCatalogo;
  /** `exacta`: el nombre es un sinónimo; `contenida`: lo contiene como palabras. */
  tipo: 'exacta' | 'contenida';
}

/**
 * Busca el analito canónico de un nombre.
 *
 * Primero la coincidencia exacta; si no, el sinónimo MÁS LARGO contenido como
 * palabras completas (≥ 4 letras, para que «k» o «na» sueltos dentro de una
 * frase no conviertan cualquier cosa en potasio o sodio).
 */
export function buscarAnalito(nombre: string): Coincidencia | null {
  const n = normalizarNombre(nombre);
  if (!n) return null;
  const exacta = INDICE.get(n);
  if (exacta) return { analito: exacta, tipo: 'exacta' };
  const conBordes = ` ${n} `;
  for (const { analito, sinonimo } of SINONIMOS_ORDENADOS) {
    if (sinonimo.length < 4) continue;
    if (conBordes.includes(` ${sinonimo} `)) return { analito, tipo: 'contenida' };
  }
  return null;
}

/**
 * Clave de agrupación de un nombre ya verificado. Los que no están en el
 * catálogo se agrupan por su propio nombre normalizado, nunca con otro.
 */
export function codigoCanonico(nombre: string, especie: Especie = 'HUMANO'): string {
  const c = buscarAnalito(nombre);
  if (c && c.analito.especies.includes(especie)) return c.analito.codigo;
  return `OTRO:${normalizarNombre(nombre)}`;
}

export function nombreCanonico(codigo: string, respaldo: string): string {
  return CATALOGO_ANALITOS.find((a) => a.codigo === codigo)?.nombre ?? respaldo;
}

// ─── Números y rangos ──────────────────────────────────────────────────────

const RE_NUMERO = /-?\d+(?:[.,]\d+)*/;

/**
 * Número de un informe colombiano.
 *
 * · `5,6` y `5.6` → 5.6.
 * · Con punto y coma a la vez, el último separador es el decimal
 *   (`1.234,5` → 1234.5; `1,234.5` → 1234.5).
 * · `250.000` → 250000 SOLO si `miles` es verdadero (recuentos celulares):
 *   en cualquier otra unidad `1.200` es uno coma dos.
 */
export function parsearNumero(texto: string | null | undefined, miles = false): number | null {
  const t = String(texto ?? '').trim().replace(/\s+/g, '');
  if (!/^-?\d+(?:[.,]\d+)*$/.test(t)) return null;
  let limpio: string;
  const ultimoPunto = t.lastIndexOf('.');
  const ultimaComa = t.lastIndexOf(',');
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? '.' : ',';
    const otro = decimal === '.' ? ',' : '.';
    limpio = t.split(otro).join('').replace(decimal, '.');
  } else if (miles && /^-?\d{1,3}([.,]\d{3})+$/.test(t)) {
    limpio = t.replace(/[.,]/g, '');
  } else if ((t.match(/[.,]/g) ?? []).length > 1) {
    // `1.234.567` sin pista de unidad: es un separador de miles repetido.
    limpio = t.replace(/[.,]/g, '');
  } else {
    limpio = t.replace(',', '.');
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Unidades de recuento celular, donde `250.000` es doscientos cincuenta mil. */
export function esUnidadDeRecuento(unidad: string | null | undefined): boolean {
  const u = normalizarUnidad(unidad);
  return /^\/(ul|l|campo)$/.test(u) || /^(cel|cels|celulas|mill|miles)\//.test(u) || /^10[369]\//.test(u);
}

export interface Rango { min: number | null; max: number | null }

const PALABRAS_MENOR = /^(?:<=?|≤|menor\s+(?:o\s+igual\s+)?(?:de|a|que)|menos\s+de|hasta|inferior\s+a)\s*/i;
const PALABRAS_MAYOR = /^(?:>=?|≥|mayor\s+(?:o\s+igual\s+)?(?:de|a|que)|mas\s+de|más\s+de|superior\s+a|desde)\s*/i;

/**
 * `80 - 200`, `80 a 200`, `(80-200)`, `< 200`, `Menor de 200`, `Hasta 5`,
 * `> 40`, `Mayor a 40`. Lo que no es un rango numérico devuelve ambos nulos.
 */
export function parsearRango(texto: string | null | undefined, miles = false): Rango {
  const t = String(texto ?? '')
    .trim()
    .replace(/^[([{]\s*/, '')
    .replace(/\s*[)\]}]$/, '')
    .trim();
  if (!t) return { min: null, max: null };
  const entre = t.match(/^(-?\d+(?:[.,]\d+)*)\s*(?:-|–|—|a|al|hasta)\s*(-?\d+(?:[.,]\d+)*)/i);
  if (entre) {
    const min = parsearNumero(entre[1], miles);
    const max = parsearNumero(entre[2], miles);
    if (min !== null && max !== null && min <= max) return { min, max };
    return { min: null, max: null };
  }
  const menor = t.match(PALABRAS_MENOR);
  if (menor) {
    const n = t.slice(menor[0].length).match(RE_NUMERO);
    return { min: null, max: n ? parsearNumero(n[0], miles) : null };
  }
  const mayor = t.match(PALABRAS_MAYOR);
  if (mayor) {
    const n = t.slice(mayor[0].length).match(RE_NUMERO);
    return { min: n ? parsearNumero(n[0], miles) : null, max: null };
  }
  return { min: null, max: null };
}

/** Formato canónico para `rango_referencia`. */
export function formatearRango(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatearNumero(min)} - ${formatearNumero(max)}`;
  if (max !== null) return `< ${formatearNumero(max)}`;
  if (min !== null) return `> ${formatearNumero(min)}`;
  return '';
}

/** Punto decimal, sin ceros de cola ni notación científica. */
export function formatearNumero(n: number): string {
  if (!Number.isFinite(n)) return '';
  const redondeado = Math.round(n * 10000) / 10000;
  return String(redondeado);
}

const CUALITATIVOS = [
  'no reactivo', 'reactivo', 'negativo', 'positivo', 'ausente', 'ausentes', 'presente',
  'presentes', 'trazas', 'normal', 'escasas', 'escasos', 'abundantes', 'no se observan',
];

function esCualitativo(texto: string): string | null {
  const n = normalizarNombre(texto);
  for (const c of CUALITATIVOS) {
    if (n === c || n.startsWith(`${c} `)) return c;
  }
  return null;
}

/**
 * Estado frente al rango del laboratorio. Los extremos cuentan como dentro.
 * Un valor cualitativo es NORMAL si coincide con el texto de referencia y
 * FUERA si no; sin referencia, SIN_RANGO.
 */
export function estadoFrenteARango(
  valorNum: number | null,
  min: number | null,
  max: number | null,
  valorTexto?: string | null,
  referenciaTexto?: string | null,
): EstadoRango {
  if (valorNum === null) {
    const v = normalizarNombre(valorTexto ?? '');
    const r = normalizarNombre(referenciaTexto ?? '');
    if (!v || !r) return 'SIN_RANGO';
    return v === r ? 'NORMAL' : 'FUERA';
  }
  if (min === null && max === null) return 'SIN_RANGO';
  if (min !== null && valorNum < min) return 'BAJO';
  if (max !== null && valorNum > max) return 'ALTO';
  return 'NORMAL';
}

export function estaFueraDeRango(estado: EstadoRango): boolean {
  return estado === 'BAJO' || estado === 'ALTO' || estado === 'FUERA';
}

// ─── Lector de informes ────────────────────────────────────────────────────

export interface FilaExtraida {
  /** Nombre tal como aparece (sin paréntesis de método). */
  analito: string;
  codigo: string | null;
  valorNum: number | null;
  valorTexto: string | null;
  unidad: string;
  rangoMin: number | null;
  rangoMax: number | null;
  /** Texto de referencia cualitativo («Negativo»), si lo hay. */
  referenciaTexto: string | null;
  confianza: Exclude<Confianza, 'MANUAL' | 'CORREGIDO'>;
}

export interface InformeExtraido {
  filas: FilaExtraida[];
  /** YYYY-MM-DD de la toma de muestra, si se encontró. */
  fecha: string | null;
  laboratorio: string | null;
  especieDetectada: Especie | null;
  avisos: string[];
}

/**
 * Unidades que se reconocen al final del valor. Orden: las más largas
 * primero, para que `mg/dL` no se quede en `mg`.
 */
const RE_UNIDAD = new RegExp(
  '^(' +
    [
      'mL\\/min\\/1[.,]73\\s?m[2²]', 'ml\\/min',
      '(?:x\\s?)?10\\s?(?:\\^|e)?\\s?[369³⁶⁹]\\s?\\/\\s?(?:[uµμ]L|mm[3³]|L)',
      '(?:cel|cels|c[eé]lulas|mill|miles)\\s?\\/\\s?(?:[uµμ]L|mm[3³])',
      '\\/\\s?(?:[uµμ]L|mm[3³]|campo)',
      'mmol\\/mol', 'mmol\\/L', '[uµμ]mol\\/L', 'nmol\\/L', 'pmol\\/L',
      'mEq\\/L', 'mUI\\/mL', 'mUI\\/L', '[uµμ]UI\\/mL', '[uµμ]U\\/mL', 'mU\\/L', 'UI\\/mL', 'UI\\/L', 'U\\/L',
      'mg\\/dL', 'g\\/dL', 'mg\\/L', 'g\\/L', 'ng\\/mL', 'ng\\/dL', 'pg\\/mL', '[uµμ]g\\/dL', '[uµμ]g\\/L', 'mg\\/24\\s?h',
      'mm\\/h(?:ora)?', 'fL', 'pg', 'seg', 's', '%', 'g\\/24h', 'mg\\/g',
    ].join('|') +
    ')(?![a-z0-9])',
  'i',
);

/** Marcas de fuera de rango que algunos laboratorios imprimen junto al valor. */
const RE_MARCAS = /(?:^|\s)(?:\*+|[↑↓▲▼]|\((?:H|L|A|B)\)|H|L)(?=\s|$)/g;

/** Líneas que nunca son un analito aunque traigan un número. */
const RE_NO_ANALITO =
  /^(?:fecha|hora|edad|tel[eé]fono|tel|cel|direcci[oó]n|nit|c[eé]dula|cc|documento|historia|orden|n[uú]mero|p[aá]gina|pag|sexo|g[eé]nero|paciente|m[eé]dico|ips|eps|registro|folio|c[oó]digo|ingreso|cama|peso|talla|propietario|raza|especie|validado|bacteri[oó]log)/i;

interface PartesLinea {
  nombre: string;
  valorCrudo: string;
  resto: string;
  cualitativo: boolean;
}

/**
 * Parte una línea en nombre · valor · resto. El valor es el primer número
 * precedido de espacio (o de `:`) que no forma parte del nombre; o, si el
 * nombre es un analito conocido, una palabra cualitativa.
 */
function partirLinea(linea: string): PartesLinea | null {
  const l = linea.replace(/\s+/g, ' ').trim();
  if (l.length < 3 || l.length > 160) return null;
  // Nombre: arranca por letra (o dígito seguido de letra, «25-OH…»).
  const numerico = l.match(
    /^((?:\d{1,2}\s?[-]?\s?)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,'()/+\-]*?)\s*[:=]?\s+(?:[*↑↓▲▼]\s*)?([<>]=?\s?)?(-?\d+(?:[.,]\d+)*)(?=\s|$|[*%a-zA-Zµμ/])(.*)$/,
  );
  if (numerico) {
    return {
      nombre: numerico[1].trim(),
      valorCrudo: numerico[3],
      resto: `${numerico[4] ?? ''}`.trim(),
      cualitativo: false,
    };
  }
  const texto = l.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,'()/+\-]*?)\s*[:=]?\s+((?:no\s+)?(?:reactivo|negativo|positivo|ausentes?|presentes?|trazas|escas[oa]s|abundantes))\b(.*)$/i);
  if (texto) {
    return { nombre: texto[1].trim(), valorCrudo: texto[2], resto: (texto[3] ?? '').trim(), cualitativo: true };
  }
  return null;
}

/** Saca una fila de una línea, o null si la línea no es un resultado. */
export function parsearLinea(linea: string, especie: Especie = 'HUMANO'): FilaExtraida | null {
  const partes = partirLinea(linea);
  if (!partes) return null;
  const nombreLimpio = partes.nombre.replace(/[.:\-\s]+$/, '').trim();
  if (!nombreLimpio || RE_NO_ANALITO.test(nombreLimpio)) return null;

  const coincidencia = buscarAnalito(nombreLimpio);
  const deEstaEspecie = coincidencia && coincidencia.analito.especies.includes(especie);

  if (partes.cualitativo) {
    if (!deEstaEspecie) return null;
    const ref = esCualitativo(partes.resto.replace(RE_MARCAS, ' ').trim());
    return {
      analito: nombreVisible(nombreLimpio),
      codigo: coincidencia!.analito.codigo,
      valorNum: null,
      valorTexto: capitalizar(partes.valorCrudo.toLowerCase()),
      unidad: '',
      rangoMin: null,
      rangoMax: null,
      referenciaTexto: ref ? capitalizar(ref) : null,
      confianza: ref ? 'ALTA' : 'MEDIA',
    };
  }

  let resto = partes.resto.replace(RE_MARCAS, ' ').replace(/\s+/g, ' ').trim();
  let unidad = '';
  const u = resto.match(RE_UNIDAD);
  if (u) {
    unidad = u[1].replace(/\s+/g, '');
    resto = resto.slice(u[0].length).replace(RE_MARCAS, ' ').trim();
  }
  // Algunos informes repiten la unidad detrás del rango, o la ponen solo ahí.
  const unidadDetras = resto.match(/(?:\s)([a-zA-Zµμ%/][a-zA-Zµμ0-9/.%^³]*)$/);
  if (!unidad && unidadDetras && RE_UNIDAD.test(unidadDetras[1])) {
    unidad = unidadDetras[1];
    resto = resto.slice(0, -unidadDetras[0].length).trim();
  }

  const miles = esUnidadDeRecuento(unidad);
  const valorNum = parsearNumero(partes.valorCrudo, miles);
  if (valorNum === null) return null;
  const rango = parsearRango(resto, miles);
  const conRango = rango.min !== null || rango.max !== null;

  if (!deEstaEspecie) {
    // Un nombre desconocido solo se propone si el resto de la línea tiene
    // forma inequívoca de resultado: unidad de laboratorio Y rango.
    if (coincidencia) return null; // analito de la otra especie: se avisa aparte
    if (!unidad || !conRango) return null;
    return {
      analito: nombreVisible(nombreLimpio),
      codigo: null,
      valorNum,
      valorTexto: null,
      unidad,
      rangoMin: rango.min,
      rangoMax: rango.max,
      referenciaTexto: null,
      confianza: 'BAJA',
    };
  }

  const confianza: FilaExtraida['confianza'] =
    coincidencia!.tipo === 'exacta' && unidad && conRango ? 'ALTA' : unidad || conRango ? 'MEDIA' : 'BAJA';

  return {
    analito: nombreVisible(nombreLimpio),
    codigo: coincidencia!.analito.codigo,
    valorNum,
    valorTexto: null,
    unidad,
    rangoMin: rango.min,
    rangoMax: rango.max,
    referenciaTexto: null,
    confianza,
  };
}

function nombreVisible(nombre: string): string {
  const sinMetodo = nombre.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return sinMetodo || nombre;
}

function capitalizar(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// ── Fecha ──

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

function iso(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Primera fecha válida de un fragmento: dd/mm/aaaa, aaaa-mm-dd, «12 de marzo de 2025», 12-MAR-2025. */
export function parsearFecha(texto: string): string | null {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ymd = t.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const dmy = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) {
    const a = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return iso(a, Number(dmy[2]), Number(dmy[1]));
  }
  const conMes = t.match(/\b(\d{1,2})(?:\s+de)?[\s\-/.]+([a-z]{3,10})\.?(?:\s+de)?[\s\-/.]+(\d{4})\b/i);
  if (conMes) {
    const m = MESES[conMes[2].toLowerCase()];
    if (m) return iso(Number(conMes[3]), m, Number(conMes[1]));
  }
  return null;
}

/**
 * Fecha de la muestra. Se prefieren, por este orden, las etiquetas de toma de
 * muestra, de resultado/validación y, por último, cualquier «Fecha».
 */
export function extraerFechaInforme(texto: string): string | null {
  const lineas = texto.split('\n');
  const prioridades = [
    /fecha\s*(?:y\s*hora\s*)?(?:de\s*)?(?:la\s*)?(?:toma|muestra|recolecci[oó]n|obtenci[oó]n)/i,
    /(?:toma\s*de\s*muestra|muestra\s*tomada)/i,
    /fecha\s*(?:de\s*)?(?:resultado|validaci[oó]n|reporte|informe|impresi[oó]n)/i,
    /fecha\s*(?:de\s*)?(?:ingreso|recepci[oó]n|atenci[oó]n|orden)/i,
    /\bfecha\b/i,
  ];
  for (const re of prioridades) {
    for (const l of lineas) {
      const m = l.match(re);
      if (!m) continue;
      const f = parsearFecha(l.slice(m.index ?? 0));
      if (f) return f;
    }
  }
  return null;
}

// ── Laboratorio ──

const LABORATORIOS_CONOCIDOS =
  /\b(colcan|synlab|dinamica|din[aá]mica|hemato|echavarr[ií]a|cafam|colsanitas|compensar|javesalud|sura|keralty|idime|cl[ií]nica\s+[a-z]+|hospital\s+militar(?:\s+central)?|sanidad\s+militar|direcci[oó]n\s+de\s+sanidad|dispensario\s+m[eé]dico|establecimiento\s+de\s+sanidad|laboratorio\s+cl[ií]nico\s+[a-z]+)\b/i;

export function extraerLaboratorio(texto: string): string | null {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40);
  for (const l of lineas) {
    const etiqueta = l.match(/^(?:laboratorio|instituci[oó]n|prestador|ips|sede)\s*:\s*(.+)$/i);
    if (etiqueta && etiqueta[1].trim().length >= 3) return recortar(etiqueta[1]);
  }
  for (const l of lineas) {
    if (LABORATORIOS_CONOCIDOS.test(l) && !/\d{5,}/.test(l)) return recortar(l);
  }
  for (const l of lineas) {
    if (/\blaboratorio\b/i.test(l) && !/\d/.test(l) && l.split(' ').length >= 2) return recortar(l);
  }
  return null;
}

function recortar(t: string): string {
  const limpio = t.replace(/\s+/g, ' ').replace(/[|·•]+/g, ' ').trim();
  return limpio.length > 80 ? `${limpio.slice(0, 77)}…` : limpio;
}

// ── Especie ──

const MARCAS_VETERINARIAS =
  /\b(veterinari[ao]s?|m[eé]dico\s+veterinario|mvz|canin[oa]|felin[oa]|mascota|propietari[oa]|tutor\s*:|raza\s*:|especie\s*:\s*(?:canin|felin|perr|gat)|perro|gato)\b/i;
const MARCAS_HUMANAS =
  /\b(c[eé]dula|c\.\s?c\.|tarjeta\s+de\s+identidad|documento\s+de\s+identidad|eps|afiliad[oa]|sanidad\s+militar|sexo\s*:\s*(?:m|f|masculino|femenino|hombre|mujer)\b|g[eé]nero\s*:)/i;

export function detectarEspecie(texto: string): { especie: Especie | null; ambigua: boolean } {
  const vet = MARCAS_VETERINARIAS.test(texto);
  const hum = MARCAS_HUMANAS.test(texto);
  if (vet && !hum) return { especie: 'MASCOTA', ambigua: false };
  if (hum && !vet) return { especie: 'HUMANO', ambigua: false };
  return { especie: null, ambigua: vet && hum };
}

/**
 * Lee un informe completo para un paciente de la especie dada.
 *
 * Nunca descarta en silencio: lo que no se pudo leer se deja para la
 * captura manual, y los analitos de la otra especie se avisan.
 */
export function parsearInforme(textoCrudo: string, especie: Especie = 'HUMANO'): InformeExtraido {
  const texto = String(textoCrudo ?? '').replace(/\r\n?/g, '\n');
  const avisos: string[] = [];
  const filas: FilaExtraida[] = [];
  const vistos = new Set<string>();
  const otraEspecie = new Set<string>();

  for (const linea of texto.split('\n')) {
    const fila = parsearLinea(linea, especie);
    if (fila) {
      // Un analito repetido en el mismo informe (p. ej. el encabezado de una
      // gráfica) se queda con su primera aparición.
      const clave = `${fila.codigo ?? normalizarNombre(fila.analito)}|${normalizarUnidad(fila.unidad)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      filas.push(fila);
      continue;
    }
    const partes = partirLinea(linea);
    const c = partes ? buscarAnalito(partes.nombre) : null;
    if (c && !c.analito.especies.includes(especie)) otraEspecie.add(c.analito.nombre);
  }

  const { especie: detectada, ambigua } = detectarEspecie(texto);
  if (detectada && detectada !== especie) {
    avisos.push(
      especie === 'HUMANO'
        ? 'El informe parece veterinario. No se puede guardar en la ficha de una persona: los rangos de una mascota no son los de un humano.'
        : 'El informe parece de una persona. No se puede guardar en la ficha de una mascota.',
    );
  } else if (ambigua) {
    avisos.push('El informe trae marcas humanas y veterinarias a la vez. Revisa que sea de este paciente.');
  }
  if (otraEspecie.size > 0) {
    avisos.push(
      `Se ignoraron analitos que no corresponden a la especie del paciente: ${[...otraEspecie].join(', ')}.`,
    );
  }
  if (filas.length === 0) {
    avisos.push('No se reconoció ningún resultado en el texto. Puedes agregarlos a mano en la tabla.');
  }

  return {
    filas,
    fecha: extraerFechaInforme(texto),
    laboratorio: extraerLaboratorio(texto),
    especieDetectada: detectada,
    avisos,
  };
}

/** True si el informe no puede guardarse en un paciente de esta especie. */
export function especieIncompatible(informe: Pick<InformeExtraido, 'especieDetectada'>, especie: Especie): boolean {
  return informe.especieDetectada !== null && informe.especieDetectada !== especie;
}

// ─── Bandeja de verificación ───────────────────────────────────────────────

/** Fila editable de la bandeja. Todo texto: es lo que la persona teclea. */
export interface FilaVerificacion {
  clave: string;
  analito: string;
  valor: string;
  unidad: string;
  min: string;
  max: string;
  origen: Confianza;
  editada: boolean;
}

export function filaDesdeExtraida(f: FilaExtraida, clave: string): FilaVerificacion {
  return {
    clave,
    analito: f.analito,
    valor: f.valorNum !== null ? formatearNumero(f.valorNum) : f.valorTexto ?? '',
    unidad: f.unidad,
    min: f.rangoMin !== null ? formatearNumero(f.rangoMin) : f.referenciaTexto ?? '',
    max: f.rangoMax !== null ? formatearNumero(f.rangoMax) : '',
    origen: f.confianza,
    editada: false,
  };
}

export function filaVacia(clave: string): FilaVerificacion {
  return { clave, analito: '', valor: '', unidad: '', min: '', max: '', origen: 'MANUAL', editada: false };
}

export interface ResultadoParaGuardar {
  parameterName: string;
  value: string;
  unit: string;
  referenceRange: string;
  isAbnormal: boolean;
  extractionConfidence: Confianza;
  verifiedBy: string;
}

export interface ValidacionFila {
  estado: EstadoRango;
  errores: string[];
}

/** Lo que la tabla enseña junto a cada fila mientras se edita. */
export function validarFila(f: FilaVerificacion): ValidacionFila {
  const errores: string[] = [];
  if (!f.analito.trim()) errores.push('Falta el analito.');
  if (!f.valor.trim()) errores.push('Falta el valor.');
  const num = parsearNumero(f.valor.replace(/^[<>]=?\s*/, ''), esUnidadDeRecuento(f.unidad));
  const min = f.min.trim() ? parsearNumero(f.min, esUnidadDeRecuento(f.unidad)) : null;
  const max = f.max.trim() ? parsearNumero(f.max, esUnidadDeRecuento(f.unidad)) : null;
  const minEsTexto = f.min.trim() !== '' && min === null;
  if (num !== null) {
    if (minEsTexto) errores.push('El mínimo debe ser un número.');
    if (f.max.trim() && max === null) errores.push('El máximo debe ser un número.');
    if (min !== null && max !== null && min > max) errores.push('El mínimo es mayor que el máximo.');
    if (!f.unidad.trim()) errores.push('Falta la unidad: sin ella el valor no se puede comparar.');
  }
  const estado = num !== null
    ? estadoFrenteARango(num, min, max)
    : estadoFrenteARango(null, null, null, f.valor, minEsTexto ? f.min : null);
  return { estado, errores };
}

export function filaAResultado(f: FilaVerificacion, verificadoEn: string): ResultadoParaGuardar {
  const recuento = esUnidadDeRecuento(f.unidad);
  const num = parsearNumero(f.valor, recuento);
  const min = parsearNumero(f.min, recuento);
  const max = parsearNumero(f.max, recuento);
  const { estado } = validarFila(f);
  const referencia = num !== null ? formatearRango(min, max) : f.min.trim();
  return {
    parameterName: f.analito.trim(),
    value: num !== null ? formatearNumero(num) : f.valor.trim(),
    unit: f.unidad.trim(),
    referenceRange: referencia,
    isAbnormal: estaFueraDeRango(estado),
    extractionConfidence: f.origen === 'MANUAL' ? 'MANUAL' : f.editada ? 'CORREGIDO' : f.origen,
    verifiedBy: `${MARCA_VERIFICACION}:${verificadoEn}`,
  };
}

// ─── Comparativo histórico ─────────────────────────────────────────────────

export interface ExamenMinimo {
  id: string;
  memberId: string;
  examName: string;
  orderedDate: string;
  performedDate?: string | null;
  laboratory?: string | null;
}

export interface ResultadoMinimo {
  id: string;
  examId: string;
  parameterName: string;
  value: string;
  unit?: string | null;
  referenceRange?: string | null;
  verifiedBy?: string | null;
}

export interface PuntoSerie {
  examId: string;
  fecha: string;
  valorNum: number | null;
  valorTexto: string;
  min: number | null;
  max: number | null;
  estado: EstadoRango;
  verificado: boolean;
}

export interface SerieAnalito {
  clave: string;
  codigo: string;
  nombre: string;
  unidad: string;
  /** Más antiguo primero. */
  puntos: PuntoSerie[];
  delta: number | null;
  deltaPct: number | null;
  cruce: { de: EstadoRango; a: EstadoRango } | null;
  tendencia: Tendencia;
  /** Otras unidades del mismo analito que NO se comparan con esta. */
  otrasUnidades: string[];
}

export interface ColumnaComparativo { examId: string; fecha: string; examen: string; laboratorio: string | null }

export interface Comparativo {
  columnas: ColumnaComparativo[];
  series: SerieAnalito[];
}

export function fechaDeExamen(e: Pick<ExamenMinimo, 'orderedDate' | 'performedDate'>): string {
  return String(e.performedDate || e.orderedDate || '').slice(0, 10);
}

/** Δ redondeado a 4 decimales para que 0.1 + 0.2 no enseñe 0.30000000000000004. */
function redondear(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Tendencia por mínimos cuadrados sobre los últimos (hasta 4) valores
 * numéricos: el cambio que proyecta la recta a lo largo de la ventana,
 * relativo a la media. Por debajo de `UMBRAL_ESTABLE`, estable.
 */
export function calcularTendencia(valores: number[]): Tendencia {
  const v = valores.slice(-4);
  if (v.length < 2) return 'INSUFICIENTE';
  const n = v.length;
  const mx = (n - 1) / 2;
  const my = v.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  v.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const pendiente = den === 0 ? 0 : num / den;
  const cambio = pendiente * (n - 1);
  const escala = Math.abs(my);
  const relativo = escala === 0 ? (cambio === 0 ? 0 : Math.sign(cambio)) : cambio / escala;
  if (Math.abs(relativo) <= UMBRAL_ESTABLE) return 'ESTABLE';
  return relativo > 0 ? 'SUBIENDO' : 'BAJANDO';
}

/**
 * Construye el comparativo de un paciente.
 *
 * Solo entran exámenes con al menos un resultado. Las columnas son los
 * `maxExamenes` más recientes; cada serie es un analito canónico en UNA
 * unidad. Dentro de un mismo examen, si un analito se repitiera con la misma
 * unidad, cuenta la primera fila.
 */
export function construirComparativo(
  examenes: ExamenMinimo[],
  resultadosPorExamen: Record<string, ResultadoMinimo[] | undefined>,
  memberId: string,
  opciones: { especie?: Especie; maxExamenes?: number } = {},
): Comparativo {
  const especie = opciones.especie ?? 'HUMANO';
  const max = opciones.maxExamenes ?? MAXIMO_EXAMENES_COMPARATIVO;

  const conResultados = examenes
    .filter((e) => e.memberId === memberId && (resultadosPorExamen[e.id]?.length ?? 0) > 0)
    .sort((a, b) => fechaDeExamen(a).localeCompare(fechaDeExamen(b)) || a.id.localeCompare(b.id));
  const elegidos = conResultados.slice(-max);

  const columnas: ColumnaComparativo[] = elegidos.map((e) => ({
    examId: e.id,
    fecha: fechaDeExamen(e),
    examen: e.examName,
    laboratorio: e.laboratory ?? null,
  }));

  const series = new Map<string, SerieAnalito>();
  const unidadesPorCodigo = new Map<string, Set<string>>();

  for (const examen of elegidos) {
    const fecha = fechaDeExamen(examen);
    for (const r of resultadosPorExamen[examen.id] ?? []) {
      const codigo = codigoCanonico(r.parameterName, especie);
      const unidadOriginal = String(r.unit ?? '').trim();
      const unidad = normalizarUnidad(unidadOriginal);
      const clave = `${codigo}|${unidad}`;
      const recuento = esUnidadDeRecuento(unidadOriginal);
      const valorNum = parsearNumero(String(r.value ?? '').replace(/^[<>]=?\s*/, ''), recuento);
      const rango = parsearRango(r.referenceRange, recuento);
      const estado = valorNum !== null
        ? estadoFrenteARango(valorNum, rango.min, rango.max)
        : estadoFrenteARango(null, null, null, r.value, r.referenceRange);

      let serie = series.get(clave);
      if (!serie) {
        serie = {
          clave,
          codigo,
          nombre: nombreCanonico(codigo, r.parameterName),
          unidad: unidadOriginal,
          puntos: [],
          delta: null,
          deltaPct: null,
          cruce: null,
          tendencia: 'INSUFICIENTE',
          otrasUnidades: [],
        };
        series.set(clave, serie);
      }
      if (serie.puntos.some((p) => p.examId === examen.id)) continue;
      serie.puntos.push({
        examId: examen.id,
        fecha,
        valorNum,
        valorTexto: String(r.value ?? ''),
        min: rango.min,
        max: rango.max,
        estado,
        verificado: Boolean(r.verifiedBy && String(r.verifiedBy).trim()),
      });
      if (!unidadesPorCodigo.has(codigo)) unidadesPorCodigo.set(codigo, new Set());
      unidadesPorCodigo.get(codigo)!.add(unidadOriginal || '(sin unidad)');
    }
  }

  for (const serie of series.values()) {
    const numericos = serie.puntos.filter((p) => p.valorNum !== null);
    if (numericos.length >= 2) {
      const ultimo = numericos[numericos.length - 1].valorNum!;
      const anterior = numericos[numericos.length - 2].valorNum!;
      serie.delta = redondear(ultimo - anterior);
      serie.deltaPct = anterior === 0 ? null : redondear(((ultimo - anterior) / Math.abs(anterior)) * 100);
    }
    serie.tendencia = calcularTendencia(numericos.map((p) => p.valorNum!));
    const conEstado = serie.puntos.filter((p) => p.estado !== 'SIN_RANGO');
    if (conEstado.length >= 2) {
      const de = conEstado[conEstado.length - 2].estado;
      const a = conEstado[conEstado.length - 1].estado;
      if (de !== a) serie.cruce = { de, a };
    }
    serie.otrasUnidades = [...(unidadesPorCodigo.get(serie.codigo) ?? [])].filter(
      (u) => normalizarUnidad(u === '(sin unidad)' ? '' : u) !== normalizarUnidad(serie.unidad),
    );
  }

  const ordenadas = [...series.values()].sort((a, b) => {
    const ia = CATALOGO_ANALITOS.findIndex((x) => x.codigo === a.codigo);
    const ib = CATALOGO_ANALITOS.findIndex((x) => x.codigo === b.codigo);
    const pa = ia < 0 ? Number.MAX_SAFE_INTEGER : ia;
    const pb = ib < 0 ? Number.MAX_SAFE_INTEGER : ib;
    return pa - pb || a.nombre.localeCompare(b.nombre, 'es') || a.unidad.localeCompare(b.unidad);
  });

  return { columnas, series: ordenadas };
}

// ─── Textos ────────────────────────────────────────────────────────────────

export const ETIQUETA_ESTADO: Record<EstadoRango, string> = {
  BAJO: 'Bajo',
  NORMAL: 'Normal',
  ALTO: 'Alto',
  FUERA: 'Fuera de referencia',
  SIN_RANGO: 'Sin rango',
};

export const ETIQUETA_TENDENCIA: Record<Tendencia, string> = {
  SUBIENDO: 'Subiendo',
  ESTABLE: 'Estable',
  BAJANDO: 'Bajando',
  INSUFICIENTE: 'Un solo dato',
};

export const ETIQUETA_CONFIANZA: Record<Confianza, string> = {
  ALTA: 'Lectura clara',
  MEDIA: 'Revisar',
  BAJA: 'Dudosa',
  MANUAL: 'Manual',
  CORREGIDO: 'Corregida',
};

/** «+12,5 (+6,3 %)» con signo explícito y coma decimal para leer. */
export function describirDelta(delta: number | null, deltaPct: number | null): string {
  if (delta === null) return '—';
  const fmt = (n: number, dec: number) =>
    `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: dec })}`;
  return deltaPct === null ? fmt(delta, 2) : `${fmt(delta, 2)} (${fmt(deltaPct, 1)} %)`;
}
