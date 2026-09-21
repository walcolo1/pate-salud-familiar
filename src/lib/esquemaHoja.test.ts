import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLUMNAS_SINCRONIZACION,
  NOMBRES_PESTANAS,
  PESTANAS,
  VERSION_ESQUEMA,
  pestanaPorNombre,
} from './esquemaHoja';
import { encabezadosDe, repararEncabezados } from './planInstalacion';

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

  it('toda tabla de datos lleva las tres columnas de cierre, juntas y en orden', () => {
    // Sin `borrado_en` no hay baja lógica, y sin baja lógica alguien acabará
    // borrando una fila de verdad.
    //
    // Hasta E10 esta prueba exigía además que fueran las ÚLTIMAS, y era una
    // buena convención. Dejó de poder serlo: en una hoja ya instalada, los
    // datos ocupan la posición que tenían el día que se escribieron, así que
    // una columna nueva solo puede ir **por el final**, detrás incluso de
    // estas tres. Entre una convención de lectura y no desplazar los datos de
    // nadie, gana lo segundo.
    const sinCierre = ['CONFIG', 'ACCESO', 'CATALOGO_VACUNAS', 'AUDITORIA'];
    for (const p of PESTANAS) {
      if (sinCierre.includes(p.nombre)) continue;

      const desde = p.encabezados.indexOf(COLUMNAS_SINCRONIZACION[0]);
      expect(desde, `${p.nombre} no tiene creado_en`).toBeGreaterThanOrEqual(0);
      expect(
        p.encabezados.slice(desde, desde + COLUMNAS_SINCRONIZACION.length),
        `${p.nombre}: las tres de cierre tienen que ir juntas y en orden`,
      ).toEqual([...COLUMNAS_SINCRONIZACION]);
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

describe('los ficheros .gs generados', () => {
  it('no se han quedado atrás respecto a sus fuentes', () => {
    // Es la prueba que sostiene la decisión de generar en vez de duplicar: si
    // alguien edita un `.ts` y no regenera, o edita un `.gs` a mano, aquí se
    // ve. Cubre `Esquema.gs` y `Instalacion.gs`, y falla con el comando exacto
    // que hay que ejecutar.
    expect(() =>
      execFileSync(process.execPath, ['scripts/generar-gs.mjs', '--revisar'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E10 · el esquema crece, y solo por el final
// ─────────────────────────────────────────────────────────────────────────────

describe('E10 · una hoja ya instalada tiene que sobrevivir al cambio', () => {
  const V1 = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts', 'esquema-v1.json'), 'utf8'),
  ) as { version: number; pestanas: Record<string, string[]> };

  it('toda pestaña de v1 sigue existiendo', () => {
    // Quitar una pestaña dejaría sus datos sin sitio donde leerse.
    const ahora = new Set(PESTANAS.map((p) => p.nombre));
    for (const nombre of Object.keys(V1.pestanas)) expect(ahora.has(nombre), nombre).toBe(true);
  });

  it('los encabezados de v1 son PREFIJO de los de ahora, columna por columna', () => {
    // Este es el trinquete que importa. En una hoja instalada los datos ocupan
    // la posición que tenían el día que se escribieron: meter una columna en
    // medio desplazaría todas las de su derecha, y la fecha de nacimiento de
    // alguien pasaría a leerse como su tipo de sangre. Sin error y en todas
    // las filas a la vez.
    for (const [nombre, viejos] of Object.entries(V1.pestanas)) {
      const ahora = encabezadosDe(nombre) ?? [];
      expect(ahora.slice(0, viejos.length), `${nombre} ya no extiende por el final`).toEqual(
        viejos,
      );
    }
  });

  it('la versión sube cuando el esquema cambia', () => {
    // Sin esto, una hoja vieja y una nueva son indistinguibles desde dentro.
    const columnasV1 = Object.values(V1.pestanas).reduce((n, c) => n + c.length, 0);
    const columnasAhora = PESTANAS.reduce((n, p) => n + p.encabezados.length, 0);
    if (columnasAhora !== columnasV1) expect(VERSION_ESQUEMA).toBeGreaterThan(V1.version);
  });

  it('ninguna columna se repite dentro de una pestaña', () => {
    // Dos columnas con el mismo nombre hacen que `columnasDe_` resuelva una
    // sola y la otra se escriba en el vacío.
    for (const p of PESTANAS) {
      expect(new Set(p.encabezados).size, `${p.nombre} tiene columnas repetidas`).toBe(
        p.encabezados.length,
      );
    }
  });
});

describe('repararEncabezados', () => {
  it('una pestaña al día no se toca', () => {
    expect(repararEncabezados('PACIENTES', encabezadosDe('PACIENTES')!)).toEqual({
      accion: 'NADA',
    });
  });

  it('una pestaña de v1 se reescribe, y dice qué columnas son nuevas', () => {
    const viejos = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts', 'esquema-v1.json'), 'utf8'),
    ).pestanas.ORDENES as string[];

    const r = repararEncabezados('ORDENES', viejos);
    expect(r.accion).toBe('REESCRIBIR');
    if (r.accion !== 'REESCRIBIR') return;
    expect(r.encabezados).toEqual(encabezadosDe('ORDENES'));
    expect(r.columnasNuevas).toContain('autorizacion_numero');
  });

  it('unos encabezados que DIVERGEN no se tocan: eso no es una hoja vieja', () => {
    // Es una hoja que alguien editó a mano. Reescribir su fila 1 renombraría
    // columnas con datos dentro sin mover los datos.
    const r = repararEncabezados('PACIENTES', ['id', 'MI_COLUMNA', 'nombre']);
    expect(r.accion).toBe('DIVERGEN');
    if (r.accion !== 'DIVERGEN') return;
    expect(r.posicion).toBe(2);
    expect(r.encontrado).toBe('MI_COLUMNA');
  });

  it('las celdas vacías del final no cuentan como encabezados', () => {
    const conVacias = [...encabezadosDe('PACIENTES')!, '', '  '];
    expect(repararEncabezados('PACIENTES', conVacias)).toEqual({ accion: 'NADA' });
  });

  it('una pestaña que no es del esquema se deja en paz', () => {
    expect(repararEncabezados('MIS_NOTAS', ['a', 'b'])).toEqual({ accion: 'NADA' });
  });
});
