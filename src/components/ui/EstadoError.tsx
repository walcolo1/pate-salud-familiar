'use client';

/**
 * EstadoError — algo falló, y aquí está qué hacer (C2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Antes de C2 la aplicación no tenía ningún estado de error de carga. Cuando
 * la lectura del expediente fallaba, el fallo iba a la consola y la pantalla
 * mostraba «Aún no tienes miembros registrados»: exactamente el mensaje que
 * hace que nadie reintente, porque afirma que todo está en orden.
 *
 * TRES COSAS, SIEMPRE
 * ───────────────────
 *   1. **Qué pasó**, en la lengua de quien lee, no en la del sistema.
 *   2. **Qué NO pasó**, cuando importa: aquí, que no se ha borrado nada.
 *   3. **Qué se puede hacer ahora**: un botón que de verdad reintente.
 *
 * Un error sin acción es una pared. `onReintentar` es opcional solo porque hay
 * fallos que no se arreglan reintentando —un familiar que no existe—, y en ese
 * caso el hueco lo llena `accionSecundaria` con una salida.
 *
 * `role="alert"` lo anuncia en cuanto aparece. Un error sí interrumpe: hay
 * algo que decidir.
 */

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface EstadoErrorProps {
  titulo: string;
  /** Qué ocurrió y, si viene al caso, qué no ocurrió. */
  mensaje: React.ReactNode;
  /** Vuelve a intentar la operación que falló. */
  onReintentar?: () => void;
  etiquetaReintentar?: string;
  /** Salida alternativa cuando reintentar no arregla nada. */
  accionSecundaria?: { etiqueta: string; href: string };
  /** `pantalla` ocupa el alto completo; `bloque` se queda en su sección. */
  variante?: 'pantalla' | 'bloque';
}

export default function EstadoError({
  titulo,
  mensaje,
  onReintentar,
  etiquetaReintentar = 'Reintentar',
  accionSecundaria,
  variante = 'pantalla',
}: EstadoErrorProps) {
  const contenedor =
    variante === 'pantalla'
      ? 'min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center'
      : 'bg-white p-8 rounded-3xl border border-rose-100 flex flex-col items-center justify-center gap-3 text-center';

  return (
    <div role="alert" className={contenedor}>
      <span
        aria-hidden="true"
        className="h-12 w-12 rounded-full bg-rose-50 text-rose-700 border border-rose-100 flex items-center justify-center"
      >
        <AlertTriangle className="h-5 w-5" />
      </span>

      <h2 className="text-sm font-extrabold text-slate-800">{titulo}</h2>
      <div className="text-xs text-slate-600 leading-relaxed max-w-sm">{mensaje}</div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl shadow-md shadow-teal-900/10 transition-colors"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            <span>{etiquetaReintentar}</span>
          </button>
        )}

        {accionSecundaria && (
          <Link
            href={accionSecundaria.href}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-colors"
          >
            {accionSecundaria.etiqueta}
          </Link>
        )}
      </div>
    </div>
  );
}
