'use client';

/**
 * ConfirmDialog — diálogo accesible sobre <dialog> nativo (A6-F2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se usa el elemento nativo en lugar de una librería porque `showModal()` ya
 * aporta de fábrica lo que una implementación a mano suele fallar: atrapa el
 * foco, cierra con Escape, marca el fondo como inerte para los lectores de
 * pantalla y devuelve el foco al elemento que lo abrió. Cero dependencias.
 *
 * ALCANCE DELIBERADAMENTE ESTRECHO
 * ────────────────────────────────
 * En A6-F2 este componente se usa solo en el cierre de sesión. La sustitución
 * de los 50 `alert`/`confirm` del resto de la app es la tarea C5.
 */

import React, { useEffect, useId, useRef } from 'react';

export type TonoOpcion = 'primario' | 'peligro' | 'neutro';

export interface OpcionDialogo {
  id: string;
  etiqueta: string;
  tono: TonoOpcion;
  onSelect: () => void | Promise<void>;
  /** Recibe el foco al abrirse. Debe ser la opción MENOS destructiva. */
  focoInicial?: boolean;
}

export interface ConfirmDialogProps {
  abierto: boolean;
  titulo: string;
  descripcion: React.ReactNode;
  opciones: OpcionDialogo[];
  /** Se invoca al cancelar con Escape o con el botón correspondiente. */
  onCerrar: () => void;
  /** Bloquea toda interacción, incluido Escape. */
  ocupado?: boolean;
  /** Texto de estado anunciado por lectores de pantalla mientras se opera. */
  mensajeOcupado?: string;
}

const CLASES_TONO: Record<TonoOpcion, string> = {
  primario:
    'bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold shadow-md shadow-teal-600/20',
  peligro:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold shadow-md shadow-red-600/20',
  neutro:
    'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold',
};

export default function ConfirmDialog({
  abierto,
  titulo,
  descripcion,
  opciones,
  onCerrar,
  ocupado = false,
  mensajeOcupado,
}: ConfirmDialogProps) {
  const refDialogo = useRef<HTMLDialogElement | null>(null);
  const idTitulo = useId();
  const idDescripcion = useId();

  // Abrir y cerrar de verdad el elemento nativo, no solo ocultarlo con CSS:
  // showModal() es lo que activa el foco atrapado y la inercia del fondo.
  useEffect(() => {
    const d = refDialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);

  // Escape. Mientras se está purgando no se admite cancelar.
  useEffect(() => {
    const d = refDialogo.current;
    if (!d) return;
    const alCancelar = (e: Event) => {
      e.preventDefault();
      if (!ocupado) onCerrar();
    };
    d.addEventListener('cancel', alCancelar);
    return () => d.removeEventListener('cancel', alCancelar);
  }, [ocupado, onCerrar]);

  // Foco inicial en la opción menos destructiva.
  useEffect(() => {
    if (!abierto) return;
    const d = refDialogo.current;
    if (!d) return;
    const preferido = d.querySelector<HTMLButtonElement>('[data-foco-inicial="true"]');
    (preferido ?? d.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [abierto, opciones]);

  return (
    <dialog
      ref={refDialogo}
      aria-labelledby={idTitulo}
      aria-describedby={idDescripcion}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={idTitulo} className="text-lg font-extrabold leading-tight text-slate-900">
          {titulo}
        </h2>

        <div id={idDescripcion} className="text-sm font-medium leading-relaxed text-slate-600">
          {descripcion}
        </div>

        {ocupado && mensajeOcupado && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-teal-700">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
            />
            {mensajeOcupado}
          </p>
        )}

        <div className="mt-1 flex flex-col gap-2">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              data-foco-inicial={o.focoInicial ? 'true' : undefined}
              disabled={ocupado}
              onClick={() => {
                void o.onSelect();
              }}
              className={`h-12 rounded-2xl px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${CLASES_TONO[o.tono]}`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
