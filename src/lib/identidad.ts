/**
 * La sesión de la aplicación, en un solo sitio (Bloque G, G3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `SesionGoogle` sabe cuándo renovar y qué hacer si no puede, pero no sabe
 * pedirle nada a Google ni avisar a nadie: las dos cosas entran por parámetro.
 * Aquí se instancia **una vez** para toda la aplicación y se dejan los dos
 * enchufes que faltan.
 *
 * POR QUÉ ENCHUFES Y NO LLAMADAS DIRECTAS A GIS
 * ─────────────────────────────────────────────
 * `google.accounts.id.initialize` es **global y única**: quien la llama se
 * queda con la devolución de llamada. Si este módulo inicializara por su
 * cuenta, pisaría la del inicio de sesión y las credenciales dejarían de
 * llegar a quien las espera — sin error, porque no hay error: simplemente no
 * se llama al que ya no está.
 *
 * Así que la inicialización la sigue haciendo **quien dibuja el botón**, y le
 * pasa a este módulo la credencial cuando llega. G3b mueve esa inicialización a
 * un sitio único; hasta entonces, el enchufe queda sin conectar y la renovación
 * devuelve `null`, que es exactamente lo que `SesionGoogle` sabe manejar.
 */

import { SesionGoogle } from './sesionGoogle';
import { leerBackend } from './invitacionEntrante';
import type { SesionBackend } from './repositorioBackend';

/** Cómo se pide una credencial nueva. Lo conecta quien inicializa GIS. */
type Renovador = () => Promise<string | null>;
/** Qué se hace cuando ya no hay sesión. Lo conecta la interfaz. */
type Aviso = () => void;

let renovador: Renovador | null = null;
let aviso: Aviso | null = null;

/**
 * La sesión de esta pestaña.
 *
 * Una sola: dos instancias tendrían dos tokens y renovarían por separado, y la
 * mitad de las peticiones irían firmadas con el que ya caducó.
 */
export const sesionDeLaAplicacion = new SesionGoogle({
  renovar: async () => (renovador ? renovador() : null),
  ahora: () => Date.now(),
  pedirEntrarDeNuevo: () => aviso?.(),
  registrarFallo: () => {
    // A propósito en silencio: que no se pueda renovar sin molestar al usuario
    // es lo esperado en más navegadores de los que gustaría, y llenar la
    // consola de avisos de algo normal enseña a ignorarla. Lo que sí se ve es
    // el aviso de volver a entrar, que es cuando de verdad pasa algo.
  },
});

/** Conecta cómo pedirle a Google una credencial nueva. */
export function configurarRenovacion(fn: Renovador | null): void {
  renovador = fn;
}

/** Conecta qué hacer cuando hay que volver a entrar. */
export function configurarAvisoDeSesion(fn: Aviso | null): void {
  aviso = fn;
}

/**
 * Lo que el repositorio necesita: dónde está la familia y quién llama.
 *
 * La URL sale de donde la dejó E9 y **se revalida al leerla**, porque el
 * almacenamiento local lo puede escribir cualquier extensión del navegador.
 */
export function sesionBackend(): SesionBackend {
  return {
    // `localStorage`, que es donde lo escribe `/invitacion` y donde lo
    // escribe el registro del titular. Aquí ponía `sessionStorage`, y por eso
    // la validación en vivo de G4b no llegó a la hoja: la URL se guardaba en
    // un almacén y se buscaba en otro. Hay una prueba que lo fija.
    //
    // No existe en el servidor, y el árbol de Next importa este módulo
    // también allí.
    url: () => (typeof window === 'undefined' ? null : leerBackend(window.localStorage)),
    idToken: () => sesionDeLaAplicacion.idToken(),
    renovar: () => sesionDeLaAplicacion.renovarAhora(),
  };
}
