'use client';

/**
 * NavegacionFicha — moverse entre las secciones sin volver al perfil (C3.3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada una de las nueve secciones tenía un único enlace: «Volver al perfil».
 * Para pasar de las citas a las vacunas había que subir al perfil y bajar otra
 * vez, y eso se repite cada vez que alguien revisa el expediente de alguien —
 * que es exactamente el uso diario de esta aplicación.
 *
 * Aquí están las nueve, más el perfil, en una barra que se desplaza. La
 * sección actual se marca con `aria-current="page"`: no basta el color, porque
 * quien navega con lector de pantalla no lo ve.
 */

import React from 'react';
import Link from 'next/link';
import {
  Beaker,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Heart,
  HeartPulse,
  Pill,
  Syringe,
  User,
} from 'lucide-react';

export const SECCIONES_FICHA = [
  { segmento: null, etiqueta: 'Perfil', icono: User },
  { segmento: 'health', etiqueta: 'Ficha médica', icono: Heart },
  { segmento: 'appts', etiqueta: 'Citas', icono: Calendar },
  { segmento: 'checkups', etiqueta: 'Controles', icono: HeartPulse },
  { segmento: 'vaccines', etiqueta: 'Vacunas', icono: Syringe },
  { segmento: 'exams', etiqueta: 'Exámenes', icono: Beaker },
  { segmento: 'documents', etiqueta: 'Documentos', icono: FileText },
  { segmento: 'orders', etiqueta: 'Órdenes', icono: ClipboardList },
  { segmento: 'medications', etiqueta: 'Medicamentos', icono: Pill },
  { segmento: 'history', etiqueta: 'Historial', icono: Clock },
] as const;

export default function NavegacionFicha({
  id,
  actual,
}: {
  id: string;
  /** Segmento activo; `null` en el perfil. */
  actual: string | null;
}) {
  return (
    <nav aria-label="Secciones del expediente" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1.5 px-1 pb-1 w-max">
        {SECCIONES_FICHA.map(({ segmento, etiqueta, icono: Icono }) => {
          const activo = segmento === actual;
          const href = segmento ? `/members/${id}/${segmento}` : `/members/${id}`;
          return (
            <li key={etiqueta}>
              <Link
                href={href}
                aria-current={activo ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 h-9 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition-colors ${
                  activo
                    ? 'bg-teal-700 text-white shadow-md shadow-teal-900/10'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Icono aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
