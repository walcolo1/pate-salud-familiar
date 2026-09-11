import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOMBRES_PESTANAS } from './esquemaHoja';

/**
 * El manifiesto del backend, bajo llave.
 *
 * `appsscript.json` es un fichero que nadie compila y que solo se ejecuta en
 * los servidores de Google, así que un ámbito de más puede vivir ahí meses sin
 * que nada se queje. Cada entrada de `oauthScopes` es un permiso que un titular
 * concede sobre su cuenta, y ampliarlo tiene que costar una decisión
 * consciente: esta prueba compara la lista **entera**, no «contiene», y falla
 * en cuanto alguien añada, quite o reordene uno.
 *
 * Es el mismo trinquete que `cabecerasSeguridad.test.ts` aplica a la CSP, por
 * el mismo motivo: los permisos crecen solos si nadie los mira.
 */

const RAIZ = join(__dirname, '..', '..');
const RUTA_MANIFIESTO = join(RAIZ, 'apps-script', 'plantilla', 'appsscript.json');
const RUTA_ESQUEMA_GS = join(RAIZ, 'apps-script', 'plantilla', 'Esquema.gs');

interface Manifiesto {
  oauthScopes?: string[];
  webapp?: { executeAs?: string; access?: string };
  dependencies?: { enabledAdvancedServices?: Array<{ userSymbol?: string; serviceId?: string }> };
  runtimeVersion?: string;
  timeZone?: string;
}

const manifiesto = (): Manifiesto =>
  JSON.parse(readFileSync(RUTA_MANIFIESTO, 'utf8')) as Manifiesto;

describe('los ámbitos del manifiesto', () => {
  it('son exactamente estos siete, en este orden', () => {
    expect(manifiesto().oauthScopes).toEqual([
      // La hoja del titular. Amplio a la fuerza: ver la prueba de más abajo.
      'https://www.googleapis.com/auth/spreadsheets',
      // Solo los ficheros que el propio script crea.
      'https://www.googleapis.com/auth/drive.file',
      // Eventos, no la gestión de calendarios.
      'https://www.googleapis.com/auth/calendar.events',
      // Enviar la invitación con MailApp. No da acceso al buzón.
      'https://www.googleapis.com/auth/script.send_mail',
      // Crear los disparadores desde `instalar()`.
      'https://www.googleapis.com/auth/script.scriptapp',
      // UrlFetch, para verificar el `id_token` contra Google.
      'https://www.googleapis.com/auth/script.external_request',
      // El correo del titular, capturado durante la instalación.
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });

  it('no pide NINGÚN ámbito restringido', () => {
    // Los restringidos exigen evaluación de seguridad para distribuir, y sobre
    // todo asustan —con razón— en la pantalla de consentimiento. El diseño de
    // E1 evita los dos que estaban a un paso: `drive` entero y el buzón.
    const restringidos = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.readonly',
    ];
    for (const r of restringidos) {
      expect(manifiesto().oauthScopes, r).not.toContain(r);
    }
  });

  it('usa `drive.file` y no `drive`: la diferencia es el Drive entero', () => {
    const ambitos = manifiesto().oauthScopes ?? [];
    expect(ambitos).toContain('https://www.googleapis.com/auth/drive.file');
    expect(ambitos).not.toContain('https://www.googleapis.com/auth/drive');
  });

  it('no declara `openid`, `email` ni `profile`: esos son del cliente de la PWA', () => {
    // Dentro del script no hacen nada. Lo que hace falta para saber el correo
    // del titular es `userinfo.email`. Son dos consentimientos distintos, de
    // dos aplicaciones distintas.
    const ambitos = manifiesto().oauthScopes ?? [];
    for (const suelto of ['openid', 'email', 'profile']) {
      expect(ambitos, suelto).not.toContain(suelto);
    }
    expect(ambitos).toContain('https://www.googleapis.com/auth/userinfo.email');
  });

  it('pide `spreadsheets` completo, y eso tiene una razón incómoda', () => {
    // `spreadsheets.currentonly` sería más estrecho y es lo que parecía
    // correcto para un script vinculado. No sirve: en una ejecución de Web App
    // NO hay documento activo, así que `getActiveSpreadsheet()` devuelve null y
    // el router no podría ni leer ACCESO. La hoja se abre por identificador, y
    // `openById` exige el ámbito completo.
    //
    // Si algún día Google diera contexto de documento a un Web App vinculado,
    // esto se podría estrechar. Mientras tanto, es el precio del diseño.
    const ambitos = manifiesto().oauthScopes ?? [];
    expect(ambitos).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(ambitos).not.toContain('https://www.googleapis.com/auth/spreadsheets.currentonly');
  });
});

describe('la configuración del Web App', () => {
  it('corre como el titular y acepta peticiones anónimas', () => {
    // `USER_DEPLOYING` es lo que hace que ningún familiar autorice nada.
    // `ANYONE_ANONYMOUS` es lo que permite el `fetch` desde la PWA: con
    // `ANYONE`, Google responde con una redirección a la pantalla de acceso y
    // la petición muere en CORS.
    expect(manifiesto().webapp).toEqual({
      executeAs: 'USER_DEPLOYING',
      access: 'ANYONE_ANONYMOUS',
    });
  });

  it('declara los servicios avanzados que hacen posibles los ámbitos estrechos', () => {
    // Sin ellos habría que usar `DriveApp` y `CalendarApp`, que arrastran los
    // ámbitos amplios. Los servicios avanzados no son una preferencia de
    // estilo: son la condición para que `drive.file` baste.
    const simbolos = (manifiesto().dependencies?.enabledAdvancedServices ?? []).map(
      (s) => s.userSymbol,
    );
    expect(simbolos).toContain('Drive');
    expect(simbolos).toContain('Calendar');
  });

  it('fija el runtime moderno y la zona horaria de la familia', () => {
    expect(manifiesto().runtimeVersion).toBe('V8');
    expect(manifiesto().timeZone).toBe('America/Bogota');
  });
});

describe('el Esquema.gs de la plantilla', () => {
  it('contiene las 21 pestañas que define esquemaHoja.ts', () => {
    // La prueba de deriva de `esquemaHoja.test.ts` compara el fichero entero
    // con lo que el generador produciría. Esta comprueba lo contrario y más
    // barato: que cada nombre está donde el instalador va a buscarlo.
    const gs = readFileSync(RUTA_ESQUEMA_GS, 'utf8');
    for (const nombre of NOMBRES_PESTANAS) {
      expect(gs, nombre).toContain(`nombre: '${nombre}'`);
    }
    expect(NOMBRES_PESTANAS).toHaveLength(21);
  });
});
