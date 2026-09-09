'use client';

/**
 * Avisos — sustituto accesible de `window.alert` para confirmaciones de éxito
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `alert` detiene la aplicación entera para decir «listo». Es lo más ruidoso
 * posible para lo menos importante: obliga a un clic para seguir, no se puede
 * leer con la pantalla ocupada en otra cosa y, en un PWA instalado, aparece
 * como un aviso del sistema que ni siquiera parece de la aplicación.
 *
 * Aquí se sustituye por una región viva: el mensaje aparece abajo, el lector de
 * pantalla lo anuncia sin robar el foco, y desaparece solo. Nadie tiene que
 * despedirse de una notificación de éxito.
 *
 * QUÉ NO PASA POR AQUÍ
 * ────────────────────
 * Los errores recuperables —«no se pudo revocar», «el archivo no es válido»—
 * siguen usando `alert` a propósito: interrumpen porque hay algo que decidir,
 * y su sustitución por mensajes en el sitio donde ocurrió el fallo es trabajo
 * de C1.5, no de este paso.
 *
 * `aria-live="polite"` y no `assertive`: nada de lo que se anuncia aquí es tan
 * urgente como para cortar a media frase lo que el lector esté leyendo.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/** Un aviso vive este tiempo antes de retirarse solo. */
export const DURACION_AVISO_MS = 5000;

type Aviso = { id: number; texto: string };

const ContextoAvisos = createContext<((texto: string) => void) | null>(null);

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);

  const avisar = useCallback((texto: string) => {
    const id = siguienteId.current++;
    setAvisos((previos) => [...previos, { id, texto }]);
    temporizadores.current.push(
      setTimeout(() => setAvisos((previos) => previos.filter((a) => a.id !== id)), DURACION_AVISO_MS),
    );
  }, []);

  // Los temporizadores no pueden sobrevivir al desmontaje: dispararían un
  // `setState` sobre un árbol que ya no existe.
  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}

      {/*
        La región existe SIEMPRE, aunque esté vacía. Un contenedor que aparece
        y desaparece del DOM no se anuncia: el lector de pantalla necesita
        haberla observado antes de que le llegue el texto.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col items-center gap-2 px-4"
      >
        {avisos.map((a) => (
          <p
            key={a.id}
            className="pointer-events-auto max-w-md rounded-2xl bg-slate-900/95 px-4 py-3 text-center text-xs font-bold leading-relaxed text-white shadow-2xl backdrop-blur-sm"
          >
            {a.texto}
          </p>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

/** Devuelve `avisar(texto)`: anuncia sin interrumpir y se retira solo. */
export function useAviso() {
  const avisar = useContext(ContextoAvisos);
  if (!avisar) {
    throw new Error('useAviso requiere <AvisosProvider> por encima en el árbol.');
  }
  return avisar;
}
