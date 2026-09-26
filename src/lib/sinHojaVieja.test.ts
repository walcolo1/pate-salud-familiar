import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SCOPES_PERMITIDOS } from './importacionManual';

/**
 * Cierre de G4 · la hoja operacional de antes no vuelve.
 *
 * Antes de G0 la aplicación creaba su propia hoja por la API de Sheets, guardaba
 * su identificador en `appDataFolder` y la reescribía entera. G4 cambió eso por
 * el Web App de cada familia, pero se quedaron las herramientas para reparar,
 * releer y recrear la hoja vieja. La validación en vivo lo enseñó: Ajustes
 * ofrecía «Abrir hoja operacional actual» y abría la hoja **anterior**, la que
 * ya nadie escribe. Un botón que lleva a los datos equivocados de un expediente
 * clínico es peor que no tener botón.
 *
 * Esta prueba impide que esa maquinaria vuelva sin que nadie lo decida.
 */

const RAIZ = join(process.cwd(), 'src');

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficheros(ruta));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** Fuera comentarios: contar la historia de lo que se quitó no es usarlo. */
function codigo(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const fuentes = ficheros(RAIZ).map((ruta) => ({
  ruta: relative(RAIZ, ruta).replace(/\\/g, '/'),
  texto: readFileSync(ruta, 'utf8'),
}));

/** Lo que tocaba la hoja vieja. Cada nombre, con lo que hacía. */
const RETIRADOS: Record<string, string> = {
  repairGoogleNativeDatabase: 'buscaba o recreaba la hoja vieja',
  repairMemberDocuments: 'releía y reescribía la hoja vieja entera',
  updateDeviceFromGoogle: 'cargaba el dispositivo desde la hoja vieja',
  createGoogleNativeDatabase: 'creaba una hoja nueva fuera del Web App',
  postLoginGoogleSetup: 'el onboarding que creaba esa hoja',
  checkForExistingDatabase: 'buscaba en appDataFolder el ID de la hoja vieja',
  createOperationalSpreadsheet: 'la creación por la API de Sheets',
  readAllOperationalTables: 'la lectura por la API de Sheets',
  writeAllOperationalTables: 'la escritura por la API de Sheets',
  migrateOperationalSheetHeaders: 'la migración de cabeceras de la hoja vieja',
  databaseSpreadsheetId: 'el identificador de la hoja vieja, guardado en el navegador',
  databaseSpreadsheetUrl: 'la URL de la hoja vieja, guardada en el navegador',
  // Bloque H
  sincronizacionManual: 'la bandera que valía false desde G4b y ocultaba código muerto',
  SINCRONIZACION_MANUAL: 'la constante de esa bandera',
  escriturasPendientesRef: 'la cola en memoria que un F5 vaciaba',
  exportToSheets: 'la exportación a Sheets, sin botón desde G4b',
  generateAndShareMemberReport: 'el informe individual, oculto desde G4b',
  connectSheets: 'el permiso de Sheets que la web ya no pide',
};

describe('la hoja operacional de antes se fue', () => {
  for (const [nombre, motivo] of Object.entries(RETIRADOS)) {
    it(`${nombre} · ${motivo}`, () => {
      const donde = fuentes.filter((f) => new RegExp(`\\b${nombre}\\b`).test(codigo(f.texto))).map((f) => f.ruta);
      expect(donde, `\n${nombre} volvió en: ${donde.join(', ')}\n`).toEqual([]);
    });
  }

  it('no queda el módulo que hablaba con la hoja vieja', () => {
    expect(existsSync(join(RAIZ, 'lib', 'googleSheetsOperational.ts'))).toBe(false);
  });

  it('no quedan los módulos de las salidas a Sheets (Bloque H)', () => {
    expect(existsSync(join(RAIZ, 'lib', 'googleSheets.ts'))).toBe(false);
    expect(existsSync(join(RAIZ, 'lib', 'informeIndividual.ts'))).toBe(false);
  });

  it('no queda la pantalla que la creaba', () => {
    expect(existsSync(join(RAIZ, 'app', 'onboarding', 'setup'))).toBe(false);
  });
});

describe('la web no pide el scope `spreadsheets`', () => {
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

  it('no está entre los permitidos', () => {
    // `drive.file` basta para crear y escribir las hojas que crea la propia
    // aplicación (los informes). `spreadsheets` es SENSIBLE y da acceso a
    // TODAS las hojas de la cuenta; `drive.file` no es sensible.
    expect(SCOPES_PERMITIDOS as readonly string[]).not.toContain(SCOPE);
  });

  it('ningún fichero de la web lo nombra', () => {
    // Texto crudo, comentarios incluidos: la cadena no tiene por qué aparecer.
    // El manifiesto de Apps Script SÍ lo lleva y está fuera de `src`: es el
    // permiso con el que el script abre su propia hoja, no uno que pida la web.
    const donde = fuentes.filter((f) => new RegExp(`${SCOPE}(?![.\\w])`).test(f.texto)).map((f) => f.ruta);
    expect(donde).toEqual([]);
  });
});

describe('la web no pide `drive.appdata` (G5)', () => {
  // Solo lo usaba la búsqueda en appDataFolder del ID de la hoja vieja. El
  // titular lo retiró de la pantalla de consentimiento: pedir un ámbito que
  // la pantalla ya no declara es buscarse un aviso de aplicación no verificada.
  const APPDATA = 'https://www.googleapis.com/auth/drive.appdata';

  it('no está entre los permitidos', () => {
    expect(SCOPES_PERMITIDOS as readonly string[]).not.toContain(APPDATA);
  });

  it('ningún fichero de la web lo pide', () => {
    const donde = fuentes.filter((f) => f.texto.includes(APPDATA)).map((f) => f.ruta);
    expect(donde).toEqual([]);
  });
});
