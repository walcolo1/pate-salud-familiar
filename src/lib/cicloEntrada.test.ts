import { describe, it, expect, vi, afterEach } from 'vitest';
import { SesionGoogle, tokenFalsoParaPruebas } from './sesionGoogle';
import { VigiaSesion, PLAZO_CREDENCIAL_MS } from './vigiaSesion';
import { CargaAlEntrar } from './cargaAlEntrar';

/**
 * Cierre del Bloque H · volver a entrar, con las piezas de verdad.
 *
 * La validación en vivo: tras cerrar sesión y volver a entrar, el `id_token`
 * se perdió con una recarga y la aplicación se quedó sin credencial y sin
 * decirlo —«La sesión caducó», «Mi familia (0)»—. Aquí `SesionGoogle`,
 * `VigiaSesion` y `CargaAlEntrar` se ensamblan como en AppContext, y solo el
 * reloj es falso.
 */

afterEach(() => vi.useRealTimers());

function montar() {
  vi.useFakeTimers();
  const ahora = () => Date.now();
  const sesion = new SesionGoogle({ renovar: async () => null, ahora, pedirEntrarDeNuevo: () => {}, registrarFallo: () => {} });
  const usuario = { activo: false };
  const avisos: boolean[] = [];
  const vigia = new VigiaSesion({
    programar: (fn, ms) => setTimeout(fn, ms),
    cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    hayCredencial: () => sesion.vigente,
    alCambiar: (v) => avisos.push(v),
  });
  const cargar = vi.fn(async () => {});
  const carga = new CargaAlEntrar({
    hayHoja: () => true,
    hayIdentidad: () => sesion.vigente && usuario.activo,
    cargar,
  });
  // El mismo cableado que AppContext: la credencial limpia el aviso y carga.
  sesion.alRecibir(() => {
    vigia.llegoCredencial();
    void carga.intentar();
  });
  const entraUsuario = () => {
    usuario.activo = true;
    vigia.usuarioActivo(true);
    void carga.intentar();
  };
  return { sesion, vigia, carga, cargar, avisos, entraUsuario };
}

const drenar = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('recarga sin credencial → aviso → volver a entrar → expediente', () => {
  it('pide entrar, y al llegar la credencial baja el aviso y carga, sin recargar', async () => {
    const { sesion, vigia, cargar, avisos, entraUsuario } = montar();

    // Tras la recarga: el usuario está en el almacenamiento, el token no.
    entraUsuario();
    await drenar();
    expect(cargar).not.toHaveBeenCalled();

    // GIS no devuelve la credencial en silencio.
    vi.advanceTimersByTime(PLAZO_CREDENCIAL_MS);
    expect(vigia.hayQueEntrar).toBe(true);

    // Pulsa el botón de Google del aviso.
    sesion.recibir(tokenFalsoParaPruebas(Date.now() + 60 * 60 * 1000));
    await drenar();

    expect(vigia.hayQueEntrar).toBe(false);
    expect(avisos).toEqual([true, false]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('la credencial antes que el usuario (el caso de /login) también acaba cargando', async () => {
    const { sesion, cargar, entraUsuario, vigia } = montar();
    sesion.recibir(tokenFalsoParaPruebas(Date.now() + 60 * 60 * 1000));
    await drenar();
    expect(cargar).not.toHaveBeenCalled(); // aún no hay usuario: signIn no ha restaurado nada

    entraUsuario();
    await drenar();
    expect(cargar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PLAZO_CREDENCIAL_MS * 2);
    expect(vigia.hayQueEntrar).toBe(false);
  });
});
