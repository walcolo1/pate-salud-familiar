/**
 * Consolidar la plantilla — doce ficheros en uno (Bloque E, E6-live)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El editor de Apps Script no tiene «importar carpeta». Pegar doce ficheros a
 * mano cada vez que hay que validar algo en vivo no es solo tedioso: es la
 * forma más fácil de dejarse uno viejo y pasar una tarde persiguiendo un fallo
 * que no existe en el código.
 *
 * Así que se pegan **como uno solo**. Apps Script mete todos los ficheros de un
 * proyecto en el mismo ámbito global, así que concatenarlos no cambia nada de
 * cómo se ejecutan: es exactamente lo que hace el intérprete, escrito a mano.
 *
 * LO QUE ESTE MÓDULO VIGILA DE VERDAD
 * ───────────────────────────────────
 * Que no haya dos declaraciones con el mismo nombre. En ficheros separados, dos
 * `var ROLES` **no dan error**: gana el último que se cargue, en silencio, y el
 * comportamiento depende del orden de los ficheros en el proyecto. Ya pasó dos
 * veces en este bloque. Al concatenar, el problema no desaparece —sigue siendo
 * silencioso— pero aquí sí se puede detectar antes de pegar nada.
 */

/** El orden en que se pegan. Los generados primero, por costumbre de lectura. */
export const ORDEN_CONSOLIDADO: readonly string[] = [
  'Esquema.gs',
  'Instalacion.gs',
  'Autenticacion.gs',
  'Autorizacion.gs',
  'Permisos.gs',
  'Despacho.gs',
  'Instalador.gs',
  'Auth.gs',
  'Acceso.gs',
  'Router.gs',
  'Invitaciones.gs',
];

export interface FicheroGs {
  nombre: string;
  codigo: string;
}

/**
 * Los nombres que un fichero deja en el ámbito global.
 *
 * Solo las declaraciones **en la primera columna**: lo que está indentado vive
 * dentro de una función y no colisiona con nada. Es una regla de formato, no de
 * sintaxis, y por eso vale aquí: estos ficheros los formatea Prettier.
 */
export function nombresGlobales(codigo: string): string[] {
  const nombres: string[] = [];
  const lineas = String(codigo ?? '').split('\n');

  for (const linea of lineas) {
    const declaracion = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/.exec(linea);
    if (declaracion) {
      nombres.push(declaracion[1]);
      continue;
    }
    const funcion = /^function\s+([A-Za-z_$][\w$]*)/.exec(linea);
    if (funcion) nombres.push(funcion[1]);
  }

  return nombres;
}

export interface Colision {
  nombre: string;
  ficheros: string[];
}

/**
 * Nombres declarados en más de un sitio.
 *
 * Incluye los repetidos dentro de un mismo fichero: `var X` dos veces en el
 * mismo archivo es igual de silencioso y todavía más fácil de pasar por alto.
 */
export function colisiones(ficheros: readonly FicheroGs[]): Colision[] {
  const donde = new Map<string, string[]>();

  for (const fichero of ficheros ?? []) {
    for (const nombre of nombresGlobales(fichero.codigo)) {
      const lista = donde.get(nombre) ?? [];
      lista.push(fichero.nombre);
      donde.set(nombre, lista);
    }
  }

  const encontradas: Colision[] = [];
  for (const [nombre, lista] of donde) {
    if (lista.length > 1) encontradas.push({ nombre, ficheros: lista });
  }

  return encontradas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Los ficheros de `ORDEN_CONSOLIDADO` que faltan, y los que sobran. */
export function desajustesDeOrden(presentes: readonly string[]): {
  faltan: string[];
  sinOrden: string[];
} {
  const hay = new Set(presentes ?? []);
  return {
    faltan: ORDEN_CONSOLIDADO.filter((n) => !hay.has(n)),
    sinOrden: [...hay].filter((n) => ORDEN_CONSOLIDADO.indexOf(n) === -1).sort(),
  };
}

/**
 * El fichero único, con una cabecera que dice de dónde salió.
 *
 * La cabecera importa: quien abra ese proyecto en seis meses tiene que saber en
 * un vistazo que **esto no se edita aquí**. Un fichero generado sin aviso es
 * una invitación a corregirlo en el sitio equivocado.
 */
export function consolidar(ficheros: readonly FicheroGs[], fecha: string): string {
  const separador = '─'.repeat(76);

  const cabecera = [
    '/**',
    ' * Paté · Salud Familiar — backend del titular, TODO EN UN FICHERO',
    ` * ${separador}`,
    ' *',
    ' * GENERADO. No se edita aquí.',
    ' *',
    ' * Sale de `apps-script/plantilla/*.gs` con `node scripts/consolidar-gs.mjs`,',
    ' * y esos ficheros salen a su vez de `src/lib/*.ts`, que es donde están las',
    ' * pruebas. Un arreglo escrito en este fichero se pierde en la siguiente',
    ' * generación sin avisar.',
    ' *',
    ' * Apps Script mete todos los ficheros de un proyecto en el mismo ámbito, así',
    ' * que pegarlos concatenados no cambia nada de cómo se ejecutan.',
    ' *',
    ` * Consolidado el ${fecha}.`,
    ' */',
    '',
  ].join('\n');

  const cuerpos = (ficheros ?? []).map(
    (f) =>
      [
        '',
        `// ${separador}`,
        `// ${f.nombre}`,
        `// ${separador}`,
        '',
        f.codigo.trim(),
        '',
      ].join('\n'),
  );

  return cabecera + cuerpos.join('\n') + '\n';
}
