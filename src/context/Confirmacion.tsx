'use client';

/**
 * Confirmación — sustituto accesible de `window.confirm` (C1.3b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `window.confirm` bloquea el hilo y devuelve un booleano, y por eso resultaba
 * cómodo: `if (confirm(...)) borrar()`. El precio es alto. El cuadro lo pinta
 * el navegador, así que no tiene nombre accesible propio, no se puede probar
 * por rol, no se puede estilar, y en un PWA instalado aparece como un aviso
 * del sistema que no parece venir de la aplicación. Algunos navegadores lo
 * suprimen del todo en pestañas de segundo plano: la pregunta desaparece y el
 * flujo se queda a medias sin que nadie decida nada.
 *
 * Este proveedor conserva la ergonomía y quita el precio:
 *
 *     if (await confirmar({ titulo, descripcion, etiquetaConfirmar })) borrar();
 *
 * Por dentro es un `ConfirmDialog` sobre `<dialog>` nativo: foco atrapado,
 * fondo inerte, Escape que cierra y foco devuelto al botón que lo abrió.
 *
 * ESCAPE SIEMPRE CANCELA
 * ──────────────────────
 * La promesa se resuelve a `false` en todo camino que no sea pulsar el botón
 * de confirmación: Escape, «Cancelar» y el desmontaje del proveedor. Una
 * pregunta que se cierra sola nunca puede borrar nada.
 *
 * EL FOCO NO EMPIEZA EN EL BOTÓN DESTRUCTIVO
 * ──────────────────────────────────────────
 * `Cancelar` es quien recibe el foco al abrirse. Un Intro reflejo —el gesto
 * más natural cuando algo aparece de golpe— cancela, no destruye.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ConfirmDialog, { type TonoOpcion } from '@/components/ui/ConfirmDialog';

export interface SolicitudConfirmacion {
  titulo: string;
  descripcion: React.ReactNode;
  /** Texto del botón que ejecuta la acción. Debe decir QUÉ hace. */
  etiquetaConfirmar: string;
  etiquetaCancelar?: string;
  /** `peligro` para lo irreversible; `primario` para el resto. */
  tono?: Extract<TonoOpcion, 'peligro' | 'primario'>;
}

type Pendiente = { solicitud: SolicitudConfirmacion; resolver: (v: boolean) => void };

const ContextoConfirmacion = createContext<
  ((solicitud: SolicitudConfirmacion) => Promise<boolean>) | null
>(null);

export function ConfirmacionProvider({ children }: { children: React.ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  // Espejo de la pregunta en curso, para poder resolverla al desmontar sin que
  // el efecto de limpieza dependa del estado y se reejecute en cada pregunta.
  const refPendiente = useRef<Pendiente | null>(null);
  useEffect(() => {
    refPendiente.current = pendiente;
  }, [pendiente]);

  const confirmar = useCallback((solicitud: SolicitudConfirmacion) => {
    return new Promise<boolean>((resolver) => {
      setPendiente((anterior) => {
        // Si ya había una pregunta abierta se cancela: dos diálogos modales a
        // la vez dejarían una promesa colgada para siempre. Resolver aquí es
        // idempotente —una promesa ya resuelta ignora el segundo intento—, así
        // que la doble invocación del modo estricto no cambia nada.
        anterior?.resolver(false);
        return { solicitud, resolver };
      });
    });
  }, []);

  // Nadie se queda esperando una respuesta que ya no puede llegar.
  useEffect(() => {
    return () => refPendiente.current?.resolver(false);
  }, []);

  const responder = useCallback((valor: boolean) => {
    setPendiente((actual) => {
      actual?.resolver(valor);
      return null;
    });
  }, []);

  const s = pendiente?.solicitud;

  return (
    <ContextoConfirmacion.Provider value={confirmar}>
      {children}
      <ConfirmDialog
        abierto={!!pendiente}
        titulo={s?.titulo ?? ''}
        descripcion={s?.descripcion ?? ''}
        onCerrar={() => responder(false)}
        opciones={[
          {
            id: 'confirmar',
            etiqueta: s?.etiquetaConfirmar ?? 'Continuar',
            tono: s?.tono ?? 'peligro',
            onSelect: () => responder(true),
          },
          {
            id: 'cancelar',
            etiqueta: s?.etiquetaCancelar ?? 'Cancelar',
            tono: 'neutro',
            focoInicial: true,
            onSelect: () => responder(false),
          },
        ]}
      />
    </ContextoConfirmacion.Provider>
  );
}

/**
 * Devuelve `confirmar(solicitud): Promise<boolean>`.
 *
 * Falla en voz alta si no hay proveedor: un `confirmar` que devolviera `false`
 * en silencio convertiría cada botón destructivo en un botón que no hace nada,
 * y eso tardaría semanas en notarse.
 */
export function useConfirmacion() {
  const confirmar = useContext(ContextoConfirmacion);
  if (!confirmar) {
    throw new Error('useConfirmacion requiere <ConfirmacionProvider> por encima en el árbol.');
  }
  return confirmar;
}
