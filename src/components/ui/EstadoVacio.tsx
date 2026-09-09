'use client';

/**
 * EstadoVacio — no hay nada todavía, y esto es lo que se puede hacer (C2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Había catorce versiones de esta caja, todas parecidas y ninguna igual:
 * distintos tamaños de texto, distintos rellenos, unas con el icono dentro de
 * un círculo y otras no. Y sobre todo, **una sola ofrecía qué hacer**. Las
 * demás se limitaban a constatar el vacío: «No hay citas médicas». Cierto, y
 * completamente inútil para quien acaba de llegar.
 *
 * Por eso `accion` está en el contrato aunque sea opcional: hay vacíos que no
 * tienen acción —un filtro que no encuentra nada se arregla cambiando el
 * filtro, no creando una cita—, pero el hueco tiene que doler al escribirlo.
 *
 * NO ES UN ERROR
 * ──────────────
 * Un expediente vacío es un estado normal y así se anuncia: sin `role="alert"`
 * y sin colores de alarma. Si lo que ocurre es que la carga falló, eso es
 * `EstadoError` — y distinguirlos es justo el objeto de C2.
 */

import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface EstadoVacioProps {
  /** Icono decorativo. Nunca es la única forma de entender el estado. */
  icono: LucideIcon;
  titulo: string;
  /** Qué falta y por qué se ve así. Una frase. */
  descripcion?: React.ReactNode;
  /** Qué se puede hacer. Un enlace o un botón, no los dos. */
  accion?:
    | { tipo: 'enlace'; etiqueta: string; href: string }
    | { tipo: 'boton'; etiqueta: string; onClick: () => void };
  /** `seccion` es la caja completa; `compacto` cabe dentro de una tarjeta. */
  variante?: 'seccion' | 'compacto';
}

const CLASES_ACCION =
  'mt-2 inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4.5 py-2 rounded-xl shadow-md shadow-teal-900/10 transition-colors';

export default function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
  variante = 'seccion',
}: EstadoVacioProps) {
  const contenedor =
    variante === 'seccion'
      ? 'bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3'
      : 'bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2 shadow-sm';

  return (
    <div className={contenedor}>
      <span
        aria-hidden="true"
        className="h-12 w-12 rounded-full bg-slate-50 text-slate-500 border border-slate-100 flex items-center justify-center"
      >
        <Icono className="h-5 w-5" />
      </span>

      <p className="text-sm font-bold text-slate-800">{titulo}</p>
      {descripcion && (
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">{descripcion}</p>
      )}

      {accion?.tipo === 'enlace' && (
        <Link href={accion.href} className={CLASES_ACCION}>
          {accion.etiqueta}
        </Link>
      )}
      {accion?.tipo === 'boton' && (
        <button type="button" onClick={accion.onClick} className={CLASES_ACCION}>
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
