/**
 * Higiene de la plantilla — nada de nadie viaja en el molde (Bloque E, E8)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La plantilla de producción se copia **una vez por familia**. Lo que lleve
 * dentro se multiplica por cada titular que la use y ya no se puede retirar:
 * no hay despliegue que corrija una copia que alguien se llevó en marzo.
 *
 * Así que antes de publicarla se revisa que no lleve nada que no debería. No es
 * una revisión a ojo —eso ya se hizo y se hará— sino un trinquete que corre con
 * cada `test:run` y que además bloquea el consolidado: si aparece algo, no se
 * escribe el fichero que se pega en el editor.
 *
 * LOS CORREOS VAN POR LISTA BLANCA, NO POR PATRÓN
 * ───────────────────────────────────────────────
 * Podría bastar con exigir dominios reservados (`example.com`, `.invalid`),
 * pero `normalizarEmail` es específica de `gmail.com` y documentarla con otro
 * dominio sería documentarla **mal**: la normalización no se aplica ahí.
 *
 * Por eso la lista es de direcciones exactas. Añadir una dirección a la
 * plantilla obliga a añadirla aquí, que es justo la pausa que se quiere.
 */

/** Las únicas direcciones que pueden aparecer en la plantilla, y son inventadas. */
export const CORREOS_DE_EJEMPLO_PERMITIDOS: readonly string[] = [
  // En los comentarios de `normalizarEmail` y de `buscarFila`: el par que
  // explica por qué los puntos de gmail no separan dos cuentas (E6-bis).
  'juan.perez@gmail.com',
  'juanperez@gmail.com',
  'juanperez+eps@gmail.com',
  // Un fragmento, no una dirección: así se escribe la forma de una etiqueta.
  '+etiqueta@gmail.com',
  // En `esUrlPwaValida`: el ejemplo de una dirección con credenciales dentro.
  'usuario@malo.example',
];

export type TipoHallazgo =
  | 'CORREO_NO_PERMITIDO'
  | 'CLIENTE_OAUTH'
  | 'URL_DE_DESPLIEGUE'
  | 'IDENTIFICADOR_LARGO'
  | 'CLAVE_PRIVADA'
  | 'MARCA_DE_PRUEBAS'
  | 'PENDIENTE_SIN_CERRAR';

export interface Hallazgo {
  fichero: string;
  linea: number;
  tipo: TipoHallazgo;
  /** Lo encontrado, **ya redactado**: este texto acaba en una consola. */
  muestra: string;
}

export interface FicheroPlantilla {
  nombre: string;
  codigo: string;
}

/** Qué hace sospechosa a cada cosa. El orden es el del informe. */
const REGLAS: ReadonlyArray<{ tipo: TipoHallazgo; patron: RegExp; porque: string }> = [
  {
    tipo: 'CLAVE_PRIVADA',
    patron: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    porque: 'una clave privada en un fichero que se copia por familia',
  },
  {
    tipo: 'CLIENTE_OAUTH',
    patron: /\d+-[a-z0-9]+\.apps\.googleusercontent\.com/i,
    porque: 'el Client ID va en las propiedades del script, no en el código',
  },
  {
    tipo: 'URL_DE_DESPLIEGUE',
    patron: /script\.google(?:usercontent)?\.com\/macros\/s\//i,
    porque: 'la URL de un despliegue es una credencial y es distinta por familia',
  },
  {
    tipo: 'MARCA_DE_PRUEBAS',
    patron: /\b(?:localhost|127\.0\.0\.1|E2E|sintetic[oa]s?)\b/i,
    porque: 'restos del arnés que no pintan nada en el molde',
  },
  {
    tipo: 'PENDIENTE_SIN_CERRAR',
    // `TODO:` y `TODO(`, nunca `TODO` a secas: en castellano «todo» aparece en
    // media docena de comentarios y no significa nada de esto.
    patron: /\b(?:TODO[:(]|FIXME|HACK\b|XXX\b)/,
    porque: 'un pendiente que se publica deja de ser un pendiente',
  },
];

/**
 * Cadenas largas que parecen identificadores de Google.
 *
 * Un identificador de hoja o de carpeta es mezcla de mayúsculas, minúsculas y
 * dígitos. Se exige que las tres estén presentes para no señalar las constantes
 * del propio código, que son `MAYUSCULAS_CON_GUION_BAJO` y no llevan minúsculas.
 */
const IDENTIFICADOR_LARGO = /['"`]([A-Za-z0-9_-]{25,})['"`]/g;

const pareceIdentificador = (texto: string): boolean =>
  /[a-z]/.test(texto) && /[A-Z]/.test(texto) && /\d/.test(texto);

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Deja una muestra en condiciones de imprimirse.
 *
 * El informe de un fallo de higiene no puede ser él mismo una filtración: si la
 * plantilla llevara un correo real, escribirlo entero en la consola —y de ahí
 * en un registro de integración continua— sería repetir el problema.
 */
export function redactarMuestra(texto: string): string {
  const crudo = String(texto ?? '').trim();
  if (crudo.length <= 8) return crudo;
  return crudo.slice(0, 4) + '…' + crudo.slice(-4);
}

/** Todo lo que no debería estar en estos ficheros. */
export function hallazgos(ficheros: readonly FicheroPlantilla[]): Hallazgo[] {
  const permitidos = new Set(CORREOS_DE_EJEMPLO_PERMITIDOS.map((c) => c.toLowerCase()));
  const encontrados: Hallazgo[] = [];

  for (const fichero of ficheros ?? []) {
    const lineas = String(fichero.codigo ?? '').split('\n');

    lineas.forEach((linea, indice) => {
      const anotar = (tipo: TipoHallazgo, muestra: string) =>
        encontrados.push({
          fichero: fichero.nombre,
          linea: indice + 1,
          tipo,
          muestra: redactarMuestra(muestra),
        });

      for (const regla of REGLAS) {
        const encaje = regla.patron.exec(linea);
        if (encaje) anotar(regla.tipo, encaje[0]);
      }

      for (const correo of linea.match(CORREO) ?? []) {
        // `@param`, `@return` y compañía no son correos por mucho que lleven
        // arroba; el patrón ya exige un dominio con punto, pero un `{@link
        // a.b}` podría colarse.
        if (permitidos.has(correo.toLowerCase())) continue;
        anotar('CORREO_NO_PERMITIDO', correo);
      }

      for (const encaje of linea.matchAll(IDENTIFICADOR_LARGO)) {
        if (pareceIdentificador(encaje[1])) anotar('IDENTIFICADOR_LARGO', encaje[1]);
      }
    });
  }

  return encontrados;
}

/** El porqué de cada tipo, para que el mensaje de error enseñe algo. */
export function motivoDe(tipo: TipoHallazgo): string {
  if (tipo === 'CORREO_NO_PERMITIDO') {
    return 'un correo que no está en CORREOS_DE_EJEMPLO_PERMITIDOS';
  }
  if (tipo === 'IDENTIFICADOR_LARGO') {
    return 'una cadena con pinta de identificador de hoja o de carpeta';
  }
  const regla = REGLAS.find((r) => r.tipo === tipo);
  return regla ? regla.porque : tipo;
}

/** El informe, listo para una consola o para el mensaje de una prueba. */
export function informe(encontrados: readonly Hallazgo[]): string {
  if ((encontrados ?? []).length === 0) return 'plantilla limpia';
  return encontrados
    .map((h) => `${h.fichero}:${h.linea} · ${h.tipo} (${motivoDe(h.tipo)}) → ${h.muestra}`)
    .join('\n');
}
