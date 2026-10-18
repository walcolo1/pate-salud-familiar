import { describe, it, expect } from 'vitest';
import {
  URL_APP_PATE,
  clienteDeConfiguracion,
  cuerpoConexion,
  enlaceDeConexion,
  esClienteOAuthValido,
  escaparHtml,
  htmlConexion,
  esRespuestaDePate,
  PATRON_EXEC_DIALOGO,
} from './planInstalacion';

const CLIENTE = '123456789-abcdefghij.apps.googleusercontent.com';
const EXEC = 'https://script.google.com/macros/s/AKfy_familia_nueva_123456789/exec';

describe('Bloque M · el Client ID se lee de la PWA, no viaja en la plantilla', () => {
  it('reconoce la forma de un Client ID y nada más', () => {
    expect(esClienteOAuthValido(CLIENTE)).toBe(true);
    expect(esClienteOAuthValido('otra-cosa.apps.googleusercontent.com')).toBe(false);
    expect(esClienteOAuthValido('123-abc.apps.googleusercontent.com.malo.example')).toBe(false);
    expect(esClienteOAuthValido(null)).toBe(false);
  });

  it('solo acepta la configuración si es de Paté', () => {
    expect(clienteDeConfiguracion({ app: 'pate', clientId: CLIENTE })).toBe(CLIENTE);
    expect(clienteDeConfiguracion(JSON.stringify({ app: 'pate', clientId: CLIENTE }))).toBe(CLIENTE);
    expect(clienteDeConfiguracion({ app: 'otra', clientId: CLIENTE })).toBeNull();
    expect(clienteDeConfiguracion({ app: 'pate', clientId: null })).toBeNull();
    expect(clienteDeConfiguracion('<html>')).toBeNull();
  });
});

describe('Bloque M · conectar sin copiar ni pegar', () => {
  it('el enlace es el ?hoja= del Bloque L', () => {
    const e = enlaceDeConexion(URL_APP_PATE + '/', EXEC);
    expect(e).toBe(`${URL_APP_PATE}/?hoja=${encodeURIComponent(EXEC)}`);
  });

  it('sin implementación, el diálogo explica los cuatro clics', () => {
    const h = htmlConexion(URL_APP_PATE, null);
    expect(h).toContain('Nueva implementación');
    expect(h).toContain('Cualquier usuario');
    // Ningún enlace ya hecho: el de conexión solo se arma con una /exec.
    expect(h).not.toMatch(/<a [^>]*\?hoja=/);
  });

  it('con implementación, ofrece abrir la PWA conectada y mandarse el enlace', () => {
    const h = htmlConexion(URL_APP_PATE, EXEC);
    expect(h).toContain('Abrir Paté ya conectado');
    expect(h).toContain(escaparHtml(enlaceDeConexion(URL_APP_PATE, EXEC)));
    expect(h).toContain('enviarmeEnlaceDeConexion');
  });

  it('el HTML escapa lo que pinta', () => {
    expect(escaparHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('el correo solo lleva el enlace', () => {
    const c = cuerpoConexion(URL_APP_PATE, EXEC);
    expect(c).toContain(enlaceDeConexion(URL_APP_PATE, EXEC));
    expect(c).not.toMatch(/@/);
  });
});

import { URL_PLANTILLA_OFICIAL, esEnlaceDeCopia, rutaPermitidaSinAcceso, urlPlantilla } from './altaFamilia';

describe('Bloque M · la plantilla y las rutas sin acceso', () => {
  it('la plantilla oficial es un /copy válido y se puede cambiar por entorno', () => {
    expect(esEnlaceDeCopia(URL_PLANTILLA_OFICIAL)).toBe(true);
    const otra = 'https://docs.google.com/spreadsheets/d/OTRA_plantilla_abcdefghij/copy';
    expect(urlPlantilla(otra)).toBe(otra);
    expect(urlPlantilla('https://malo.example/copy')).toBe(URL_PLANTILLA_OFICIAL);
    expect(urlPlantilla(undefined)).toBe(URL_PLANTILLA_OFICIAL);
  });

  it('sin acceso se puede llegar a la guía, a la invitación y a Ajustes, no al expediente', () => {
    expect(rutaPermitidaSinAcceso('/crear-expediente')).toBe(true);
    expect(rutaPermitidaSinAcceso('/invitacion')).toBe(true);
    expect(rutaPermitidaSinAcceso('/settings')).toBe(true);
    expect(rutaPermitidaSinAcceso('/dashboard')).toBe(false);
    expect(rutaPermitidaSinAcceso('/members/x')).toBe(false);
    expect(rutaPermitidaSinAcceso('/settingsx')).toBe(false);
  });
});

describe('Bloque M · si el menú no conoce la /exec, se pega en el mismo diálogo', () => {
  it('el diálogo sin implementación trae el campo y su patrón acepta solo una /exec', () => {
    const h = htmlConexion(URL_APP_PATE, null);
    expect(h).toContain('id="exec"');
    // eslint-disable-next-line no-new-func
    const patron = new Function(`return ${PATRON_EXEC_DIALOGO};`)() as RegExp;
    expect(patron.test(EXEC)).toBe(true);
    expect(patron.test('https://malo.example/macros/s/AKfy_familia_nueva_123456789/exec')).toBe(false);
    expect(patron.test(EXEC + '?x=1')).toBe(false);
    // El botón se arma hacia la PWA, con el ?hoja= del Bloque L.
    // El botón ya no se arma en el navegador: lo da el servidor tras comprobar
    // que la dirección responde (Bloque M2).
    expect(h).toContain('verificarDespliegueDesdeDialogo');
  });
});

describe('Bloque M2 · el diálogo solo ofrece el botón si la dirección respondió', () => {
  it('reconoce la respuesta de doGet y nada más', () => {
    expect(esRespuestaDePate('{"ok":true,"data":{"version":"e7"}}')).toBe(true);
    expect(esRespuestaDePate({ ok: true, data: { version: 'e7' } })).toBe(true);
    expect(esRespuestaDePate('<html>Inicia sesión</html>')).toBe(false);
    expect(esRespuestaDePate({ ok: false, error: 'X' })).toBe(false);
    expect(esRespuestaDePate({ ok: true, data: {} })).toBe(false);
  });

  it('sin dirección verificada: pasos y campo, ningún botón para abrir; y dice si Google dio una que no responde', () => {
    const h = htmlConexion(URL_APP_PATE, null, EXEC);
    expect(h).not.toContain('Abrir Paté ya conectado</a>');
    expect(h).toContain('Nueva implementación');
    expect(h).toContain('id="exec"');
    expect(h).toContain('no responde como Paté');
    expect(htmlConexion(URL_APP_PATE, null)).not.toContain('no responde como Paté');
  });

  it('con dirección verificada: el botón, y aun así los pasos y el campo para corregirla', () => {
    const h = htmlConexion(URL_APP_PATE, EXEC);
    expect(h).toContain('Abrir Paté ya conectado</a>');
    expect(h).toContain('¿No conecta? Ver pasos para publicar o pegar la dirección /exec');
    expect(h).toContain('id="exec"');
    expect(h).toContain('Nueva implementación');
  });
});
