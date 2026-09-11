import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  COLUMNAS_SINCRONIZACION,
  NOMBRES_PESTANAS,
  PESTANAS,
  VERSION_ESQUEMA,
  pestanaPorNombre,
} from './esquemaHoja';

/**
 * El esquema es un contrato entre dos programas que no se ven: el instalador
 * de Apps Script y la PWA. Nadie lo ejecuta al escribirlo, así que estas
 * pruebas son lo único que impide que una errata de una columna se descubra
 * cuando ya hay datos encima.
 */

describe('la lista de pestañas', () => {
  it('tiene 21 pestañas, no las 18 que decía el plan', () => {
    // La especificación decía «18» en su §7 y enumeraba 19 en su §2.1. Faltaban
    // además PESOS e HISTORIAL, que la aplicación ya guarda hoy y no tenían
    // dónde aterrizar en la migración.
    expect(PESTANAS).toHaveLength(21);
  });

  it('no repite ningún nombre', () => {
    expect(new Set(NOMBRES_PESTANAS).size).toBe(NOMBRES_PESTANAS.length);
  });

  it('los nombres son mayúsculas, dígitos y guion bajo: nada de tildes ni espacios', () => {
    // Un nombre con tilde o espacio se puede escribir de dos maneras que se ven
    // igual, y `getSheetByName` distingue.
    for (const nombre of NOMBRES_PESTANAS) {
      expect(nombre, nombre).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('están las que el modelo necesita, incluidas las dos que faltaban', () => {
    for (const obligatoria of [
      'CONFIG',
      'ACCESO',
      'PACIENTES',
      'PERFIL_HUMANO',
      'PERFIL_MASCOTA',
      'PESOS',
      'HISTORIAL',
      'AUDITORIA',
    ]) {
      expect(NOMBRES_PESTANAS, obligatoria).toContain(obligatoria);
    }
  });

  it('CONFIG va primero: es la portada del expediente', () => {
    expect(NOMBRES_PESTANAS[0]).toBe('CONFIG');
  });
});

describe('los encabezados', () => {
  it('ninguna pestaña se queda sin columnas', () => {
    for (const p of PESTANAS) {
      expect(p.encabezados.length, p.nombre).toBeGreaterThan(0);
    }
  });

  it('ninguna pestaña repite una columna', () => {
    for (const p of PESTANAS) {
      const unicos = new Set(p.encabezados);
      expect(unicos.size, `${p.nombre}: ${p.encabezados.join(', ')}`).toBe(p.encabezados.length);
    }
  });

  it('las columnas son minúsculas con guion bajo, sin tildes', () => {
    for (const p of PESTANAS) {
      for (const h of p.encabezados) {
        expect(h, `${p.nombre}.${h}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('toda tabla de datos empieza por `id`', () => {
    // Las dos excepciones son deliberadas: CONFIG es una fila única y ACCESO se
    // indexa por correo, que es su clave natural.
    const sinId = ['CONFIG', 'ACCESO'];
    for (const p of PESTANAS) {
      if (sinId.includes(p.nombre)) continue;
      expect(p.encabezados[0], p.nombre).toBe('id');
    }
  });

  it('toda tabla de datos termina con las tres columnas de cierre', () => {
    // Sin `borrado_en` no hay baja lógica, y sin baja lógica alguien acabará
    // borrando una fila de verdad.
    const sinCierre = ['CONFIG', 'ACCESO', 'CATALOGO_VACUNAS', 'AUDITORIA'];
    for (const p of PESTANAS) {
      if (sinCierre.includes(p.nombre)) continue;
      expect(p.encabezados.slice(-3), p.nombre).toEqual([...COLUMNAS_SINCRONIZACION]);
    }
  });

  it('lo que cuelga de un paciente lo dice con `paciente_id`', () => {
    for (const nombre of [
      'CITAS',
      'VACUNAS',
      'EXAMENES',
      'DOCUMENTOS',
      'MEDICAMENTOS',
      'DOSIS',
      'CONTROLES',
      'PESOS',
      'ORDENES',
      'RECORDATORIOS',
      'HISTORIAL',
    ]) {
      expect(pestanaPorNombre(nombre)?.encabezados, nombre).toContain('paciente_id');
    }
  });

  it('los perfiles son 1:1 con el paciente, no tablas sueltas', () => {
    for (const nombre of ['PERFIL_HUMANO', 'PERFIL_MASCOTA']) {
      expect(pestanaPorNombre(nombre)?.encabezados, nombre).toContain('paciente_id');
    }
  });

  it('ACCESO trae lo que la autorización necesita, y el token solo como hash', () => {
    const acceso = pestanaPorNombre('ACCESO')!.encabezados;
    for (const c of ['email', 'rol', 'pacientes_asignados', 'estado', 'token_hash']) {
      expect(acceso, c).toContain(c);
    }
    // El token en claro no se guarda en ninguna parte: si la hoja se filtra,
    // un hash no deja entrar a nadie.
    expect(acceso).not.toContain('token');
  });

  it('DOCUMENTOS guarda la referencia al archivo, nunca el archivo', () => {
    const doc = pestanaPorNombre('DOCUMENTOS')!.encabezados;
    expect(doc).toContain('archivo_drive_id');
    for (const prohibido of ['contenido', 'base64', 'archivo', 'datos']) {
      expect(doc, prohibido).not.toContain(prohibido);
    }
  });

  it('un resultado de examen no se puede leer sin saber quién lo verificó', () => {
    // Regla heredada del análisis clínico: ningún valor de OCR se presenta como
    // dato confirmado sin validación humana.
    const r = pestanaPorNombre('EXAMENES_RESULTADOS')!.encabezados;
    expect(r).toContain('confianza_extraccion');
    expect(r).toContain('verificado_por');
  });

  it('AUDITORIA e HISTORIAL no son la misma tabla', () => {
    // Una registra quién hizo qué en el sistema; la otra, qué le pasó a un
    // paciente. Fundirlas hace imposible responder a cualquiera de las dos.
    const auditoria = pestanaPorNombre('AUDITORIA')!.encabezados;
    const historial = pestanaPorNombre('HISTORIAL')!.encabezados;
    expect(auditoria).toContain('email');
    expect(auditoria).not.toContain('paciente_id');
    expect(historial).toContain('paciente_id');
    expect(historial).not.toContain('email');
  });
});

describe('la versión del esquema', () => {
  it('es un entero positivo y CONFIG la guarda', () => {
    expect(Number.isInteger(VERSION_ESQUEMA)).toBe(true);
    expect(VERSION_ESQUEMA).toBeGreaterThan(0);
    expect(pestanaPorNombre('CONFIG')?.encabezados).toContain('version_esquema');
  });
});

describe('el Esquema.gs generado', () => {
  it('no se ha quedado atrás respecto a esta definición', () => {
    // Es la prueba que sostiene la decisión de generar en vez de duplicar: si
    // alguien edita el `.ts` y no regenera, o edita el `.gs` a mano, aquí se ve.
    // Falla con el comando exacto que hay que ejecutar.
    expect(() =>
      execFileSync(process.execPath, ['scripts/generar-esquema-gs.mjs', '--revisar'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
