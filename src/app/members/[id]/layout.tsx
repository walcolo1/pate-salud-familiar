'use client';

/**
 * Armazón de la ficha del familiar (C3.3).
 *
 * LO QUE ESTABA REPETIDO
 * ──────────────────────
 * Las nueve secciones traían la misma cabecera copiada —un enlace «Volver al
 * perfil» y poco más— y ninguna decía **de quién** es el expediente que se
 * está mirando. Con la aplicación abierta en «Vacunas» no había forma de saber
 * si eran las de un hijo o las del titular sin volver atrás.
 *
 * Aquí se resuelve una sola vez: quién es, su edad, y una barra para saltar
 * entre secciones sin pasar por el perfil.
 *
 * Es un componente de cliente y lee la ruta con `useParams` en lugar de la
 * propiedad `params`, que en esta versión de Next es una promesa. Así el
 * armazón se comporta igual que las páginas que envuelve.
 *
 * NO ENVUELVE AL PERFIL NI AL FORMULARIO DE EDICIÓN. El perfil ya trae su
 * propia cabecera —repetirla sería el mismo defecto al revés— y la edición es
 * un formulario a pantalla completa donde una barra de navegación invita a
 * salirse a medio rellenar.
 */

import React from 'react';
import Link from 'next/link';
import { useParams, useSelectedLayoutSegment } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import NavegacionFicha from '@/components/miembros/NavegacionFicha';
import { descripcionEdad } from '@/lib/edad';
import { ArrowLeft } from 'lucide-react';

/** Secciones que se pintan sin el armazón. */
const SIN_ARMAZON = new Set([null, 'edit']);

export default function LayoutFichaFamiliar({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const segmento = useSelectedLayoutSegment();
  const { members, isLoading } = useApp();

  const id = params?.id ?? '';
  if (SIN_ARMAZON.has(segmento)) return <>{children}</>;

  const familiar = members?.find((m) => m.id === id);

  // Mientras carga, o si el familiar no existe, el armazón no se pinta: de eso
  // ya se encarga cada página, que es quien sabe qué enseñar en su lugar.
  if (isLoading || !familiar) return <>{children}</>;

  const edad = descripcionEdad(familiar.birthDate);
  const inactivo = (familiar.status || 'ACTIVE') === 'INACTIVE';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <Link
          href="/members"
          className="flex items-center gap-1.5 self-start text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>Todos los familiares</span>
        </Link>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-11 w-11 shrink-0 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center text-sm font-black"
          >
            {familiar.fullName.slice(0, 2).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black text-slate-800 truncate leading-tight">
              {familiar.fullName}
            </h1>
            <p className="text-[10px] font-bold text-slate-500 leading-none mt-1">
              {edad ?? 'Edad no registrada'}
              {familiar.bloodType ? ` · ${familiar.bloodType.replace('_POSITIVE', '+').replace('_NEGATIVE', '−')}` : ''}
            </p>
          </div>

          {inactivo && (
            <span className="shrink-0 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Inactivo
            </span>
          )}
        </div>

        <NavegacionFicha id={id} actual={segmento} />
      </header>

      {children}
    </div>
  );
}
