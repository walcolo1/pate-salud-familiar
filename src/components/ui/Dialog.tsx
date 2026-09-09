'use client';

/**
 * Dialog — diálogo accesible genérico sobre `<dialog>` nativo (C1.3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Los formularios de la aplicación vivían en `<div className="fixed inset-0">`.
 * Eso pinta algo que PARECE un diálogo pero no lo es: el foco sigue paseándose
 * por la página de debajo, Escape no cierra, y un lector de pantalla anuncia el
 * contenido del fondo como si estuviera disponible. Once formularios clínicos
 * —vacunas, medicamentos, órdenes, exámenes— estaban así.
 *
 * POR QUÉ EL ELEMENTO NATIVO Y NO UNA BIBLIOTECA
 * ──────────────────────────────────────────────
 * `showModal()` trae de fábrica justo lo que una implementación a mano suele
 * fallar: atrapa el foco, cierra con Escape, marca el fondo como inerte para
 * la tecnología asistiva y devuelve el foco al elemento que abrió el diálogo.
 * Cero dependencias nuevas, y el navegador mantiene el comportamiento.
 *
 * RELACIÓN CON ConfirmDialog
 * ──────────────────────────
 * `ConfirmDialog` (A6-F2) resuelve un caso concreto: preguntar y ofrecer
 * opciones. Este es su hermano genérico: envuelve contenido arbitrario —casi
 * siempre un formulario— con las mismas garantías. No se fusionan porque sus
 * contratos son distintos: uno recibe opciones, el otro recibe hijos.
 */

import React, { useEffect, useId, useRef } from 'react';

export interface DialogProps {
  abierto: boolean;
  /** Encabezado visible. Es además el nombre accesible del diálogo. */
  titulo: string;
  /** Texto opcional bajo el título. */
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  /** Escape, botón de cierre y clic en el fondo. */
  onCerrar: () => void;
  /**
   * Cerrar al pulsar fuera del diálogo.
   *
   * Por defecto NO: estos diálogos contienen formularios a medio rellenar, y
   * un clic descuidado en el fondo tirando media hora de datos clínicos es
   * peor que un clic de más en «Cancelar».
   */
  cerrarAlPulsarFuera?: boolean;
  /** Ancho máximo. `md` para formularios; `sm` para avisos cortos. */
  ancho?: 'sm' | 'md';
  /** Oculta la X de la esquina cuando el contenido ya trae sus propios botones. */
  sinBotonCerrar?: boolean;
}

const ANCHOS: Record<NonNullable<DialogProps['ancho']>, string> = {
  sm: 'w-[min(24rem,calc(100vw-2rem))]',
  md: 'w-[min(28rem,calc(100vw-2rem))]',
};

export default function Dialog({
  abierto,
  titulo,
  descripcion,
  children,
  onCerrar,
  cerrarAlPulsarFuera = false,
  ancho = 'md',
  sinBotonCerrar = false,
}: DialogProps) {
  const refDialogo = useRef<HTMLDialogElement | null>(null);
  const idTitulo = useId();
  const idDescripcion = useId();

  // Abrir y cerrar el elemento DE VERDAD, no solo ocultarlo con CSS:
  // `showModal()` es lo que activa el foco atrapado y la inercia del fondo.
  useEffect(() => {
    const d = refDialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    else if (!abierto && d.open) d.close();
  }, [abierto]);

  // Escape. El navegador dispara `cancel`; se intercepta para que el estado de
  // React y el del elemento no se desincronicen.
  useEffect(() => {
    const d = refDialogo.current;
    if (!d) return;
    const alCancelar = (e: Event) => {
      e.preventDefault();
      onCerrar();
    };
    d.addEventListener('cancel', alCancelar);
    return () => d.removeEventListener('cancel', alCancelar);
  }, [onCerrar]);

  // El primer campo del formulario recibe el foco. Si no hay ninguno, lo toma
  // el diálogo, para que el lector de pantalla empiece por el título y no por
  // el final del documento.
  useEffect(() => {
    if (!abierto) return;
    const d = refDialogo.current;
    if (!d) return;
    const primero = d.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, [data-foco-inicial="true"]',
    );
    (primero ?? d).focus();
  }, [abierto]);

  /**
   * Clic en el fondo.
   *
   * El `<dialog>` ocupa solo su caja, así que un clic cuyo objetivo es el
   * propio elemento cayó necesariamente en el `::backdrop`.
   */
  const alPulsar = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (!cerrarAlPulsarFuera) return;
    if (e.target === refDialogo.current) onCerrar();
  };

  return (
    <dialog
      ref={refDialogo}
      onClick={alPulsar}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
      className={`m-auto max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm ${ANCHOS[ancho]}`}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 id={idTitulo} className="text-base font-extrabold leading-tight text-slate-800">
              {titulo}
            </h2>
            {descripcion && (
              <p id={idDescripcion} className="text-xs font-semibold text-slate-400">
                {descripcion}
              </p>
            )}
          </div>

          {!sinBotonCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label={`Cerrar ${titulo}`}
              className="-mr-1 -mt-1 shrink-0 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>

        {children}
      </div>
    </dialog>
  );
}
