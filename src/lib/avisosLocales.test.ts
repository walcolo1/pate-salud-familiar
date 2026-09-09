import { describe, it, expect, vi } from 'vitest';
import {
  CUERPO_AVISO,
  HORIZONTE_MS,
  PROHIBIDO_EN_AVISOS,
  ProgramadorAvisos,
  TITULO_AVISO,
  aMilisegundos,
  construirAvisos,
  type AvisoProgramable,
  type RecordatorioProgramable,
  type RelojLike,
} from './avisosLocales';

const AHORA = new Date(2026, 2, 10, 9, 0, 0).getTime(); // 10 de marzo, 09:00 local

const enHoras = (h: number) => {
  const d = new Date(AHORA + h * 3600_000);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}`;
};

function recordatorio(over: Partial<RecordatorioProgramable> = {}): RecordatorioProgramable {
  return { id: 'r1', cuando: enHoras(2), tipo: 'medicacion', resuelto: false, ...over };
}

describe('aMilisegundos · hora local, no UTC', () => {
  it('una fecha con hora se interpreta en la zona del dispositivo', () => {
    const esperado = new Date(2026, 2, 10, 20, 30).getTime();
    expect(aMilisegundos('2026-03-10T20:30')).toBe(esperado);
  });

  it('una fecha sin hora NO cae a medianoche', () => {
    // Medianoche significaría avisar a las 00:00 de algo que toca por la
    // mañana. Se usa una hora razonable y explícita.
    const t = aMilisegundos('2026-03-10');
    expect(t).not.toBeNull();
    expect(new Date(t as number).getHours()).toBeGreaterThan(0);
  });

  it('lo que no es una fecha devuelve null en vez de un momento inventado', () => {
    for (const malo of ['', 'mañana', '2026-13-40', '10/03/2026', '2026-03-10T99:99']) {
      expect(aMilisegundos(malo), malo).toBeNull();
    }
  });
});

describe('construirAvisos', () => {
  it('programa lo que está por venir dentro del horizonte', () => {
    const avisos = construirAvisos([recordatorio()], AHORA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].id).toBe('r1');
  });

  it('no programa lo ya resuelto', () => {
    expect(construirAvisos([recordatorio({ resuelto: true })], AHORA)).toEqual([]);
  });

  it('no programa lo que ya pasó', () => {
    expect(construirAvisos([recordatorio({ cuando: enHoras(-1) })], AHORA)).toEqual([]);
  });

  it('no programa más allá del horizonte: un temporizador a tres semanas no se cumple', () => {
    expect(construirAvisos([recordatorio({ cuando: enHoras(72) })], AHORA)).toEqual([]);
    expect(construirAvisos([recordatorio({ cuando: enHoras(72) })], AHORA, 96 * 3600_000)).toHaveLength(1);
  });

  it('descarta fechas ilegibles en lugar de colocarlas en un momento cualquiera', () => {
    expect(construirAvisos([recordatorio({ cuando: 'pasado mañana' })], AHORA)).toEqual([]);
  });

  it('ordena por momento, no por orden de llegada', () => {
    const avisos = construirAvisos(
      [
        recordatorio({ id: 'tarde', cuando: enHoras(5) }),
        recordatorio({ id: 'pronto', cuando: enHoras(1) }),
      ],
      AHORA,
    );
    expect(avisos.map((a) => a.id)).toEqual(['pronto', 'tarde']);
  });

  it('el horizonte por defecto es un día', () => {
    expect(HORIZONTE_MS).toBe(24 * 3600_000);
  });
});

describe('el texto del aviso no lleva datos clínicos', () => {
  it('el cuerpo es una plantilla fija por tipo, sin interpolar nada', () => {
    for (const [tipo, cuerpo] of Object.entries(CUERPO_AVISO)) {
      for (const prohibido of PROHIBIDO_EN_AVISOS) {
        expect(cuerpo.toLowerCase(), `«${cuerpo}» (${tipo}) contiene «${prohibido}»`).not.toContain(
          prohibido,
        );
      }
    }
  });

  it('el título es el de la aplicación, no el de la persona', () => {
    expect(TITULO_AVISO).toBe('Paté · Salud Familiar');
  });

  it('un recordatorio con datos personales produce un aviso que no los contiene', () => {
    const avisos = construirAvisos(
      [recordatorio({ id: 'MEDICAMENTO-SECRETO-500mg', tipo: 'medicacion' })],
      AHORA,
    );
    expect(avisos[0].cuerpo).toBe(CUERPO_AVISO.medicacion);
    expect(avisos[0].cuerpo).not.toContain('500');
    expect(avisos[0].cuerpo).not.toContain('SECRETO');
  });

  it('el clic lleva a la lista, nunca a la ficha de un familiar concreto', () => {
    const avisos = construirAvisos([recordatorio()], AHORA);
    expect(avisos[0].url).toBe('/reminders');
    expect(avisos[0].url).not.toMatch(/\/members\//);
  });
});

/** Reloj falso: permite comprobar el programador sin esperar de verdad. */
function relojFalso() {
  let siguiente = 1;
  const pendientes = new Map<number, { fn: () => void; ms: number }>();
  const reloj: RelojLike = {
    ahora: () => AHORA,
    programar: (fn, ms) => {
      const id = siguiente++;
      pendientes.set(id, { fn, ms });
      return id;
    },
    cancelar: (id) => {
      pendientes.delete(id as number);
    },
  };
  return { reloj, pendientes, disparar: (id: number) => pendientes.get(id)?.fn() };
}

function aviso(id: string, horas: number): AvisoProgramable {
  return {
    id,
    cuandoMs: AHORA + horas * 3600_000,
    tipo: 'medicacion',
    titulo: TITULO_AVISO,
    cuerpo: CUERPO_AVISO.medicacion,
    url: '/reminders',
  };
}

describe('ProgramadorAvisos', () => {
  it('arma un temporizador por aviso, con la espera correcta', () => {
    const { reloj, pendientes } = relojFalso();
    const p = new ProgramadorAvisos(reloj, () => {});

    p.sincronizar([aviso('a', 2)]);

    expect(p.programados).toBe(1);
    expect([...pendientes.values()][0].ms).toBe(2 * 3600_000);
  });

  it('sincronizar dos veces con lo mismo NO reinicia la cuenta atrás', () => {
    const { reloj, pendientes } = relojFalso();
    const p = new ProgramadorAvisos(reloj, () => {});

    p.sincronizar([aviso('a', 2)]);
    const primerTimer = p.ids.length && [...pendientes.keys()][0];
    p.sincronizar([aviso('a', 2)]);

    expect(pendientes.size, 'se creó un temporizador de más').toBe(1);
    expect([...pendientes.keys()][0]).toBe(primerTimer);
  });

  it('cancela lo que desaparece de la lista: es como se apaga al marcar hecho', () => {
    const { reloj, pendientes } = relojFalso();
    const p = new ProgramadorAvisos(reloj, () => {});

    p.sincronizar([aviso('a', 2), aviso('b', 3)]);
    expect(p.programados).toBe(2);

    p.sincronizar([aviso('b', 3)]);
    expect(p.ids).toEqual(['b']);
    expect(pendientes.size).toBe(1);
  });

  it('al dispararse, muestra el aviso y deja de contarlo como armado', () => {
    const { reloj, pendientes, disparar } = relojFalso();
    const mostrados: string[] = [];
    const p = new ProgramadorAvisos(reloj, (a) => mostrados.push(a.id));

    p.sincronizar([aviso('a', 2)]);
    disparar([...pendientes.keys()][0]);

    expect(mostrados).toEqual(['a']);
    expect(p.programados).toBe(0);
  });

  it('un aviso ya vencido se programa con espera cero, no con una negativa', () => {
    const { reloj, pendientes } = relojFalso();
    const p = new ProgramadorAvisos(reloj, () => {});
    p.sincronizar([aviso('a', -5)]);
    expect([...pendientes.values()][0].ms).toBe(0);
  });

  it('cancelarTodo deja el programador en blanco', () => {
    const { reloj } = relojFalso();
    const p = new ProgramadorAvisos(reloj, () => {});
    p.sincronizar([aviso('a', 1), aviso('b', 2)]);
    p.cancelarTodo();
    expect(p.programados).toBe(0);
  });

  it('no muestra nada por su cuenta al sincronizar', () => {
    const { reloj } = relojFalso();
    const mostrar = vi.fn();
    new ProgramadorAvisos(reloj, mostrar).sincronizar([aviso('a', 1)]);
    expect(mostrar).not.toHaveBeenCalled();
  });
});
