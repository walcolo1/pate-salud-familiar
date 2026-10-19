'use client';

/** Piezas comunes del centro de control de la mascota (Bloque O). */

import React from 'react';

export const CAMPO =
  'h-11 w-full px-3 bg-white border border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-colors disabled:bg-slate-100';
export const BOTON =
  'h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50';
export const BOTON_SECUNDARIO =
  'h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[11px] font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50';

export function Campo({ id, etiqueta, children, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-[10px] font-extrabold uppercase text-slate-700">{etiqueta}</label>
      {children}
      {ayuda && <p id={`${id}-ayuda`} className="text-[10px] font-semibold text-slate-600">{ayuda}</p>}
    </div>
  );
}

export function Tarjeta({ titulo, children, accion, id }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode; id?: string }) {
  const idTitulo = id ?? `t-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={idTitulo} className="text-sm font-extrabold text-slate-800">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

const TONOS = {
  verde: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rojo: 'bg-rose-50 text-rose-800 border-rose-200',
  ambar: 'bg-amber-50 text-amber-900 border-amber-200',
  gris: 'bg-slate-100 text-slate-700 border-slate-200',
  azul: 'bg-sky-50 text-sky-900 border-sky-200',
} as const;

export function Chip({ tono = 'gris', children }: { tono?: keyof typeof TONOS; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${TONOS[tono]}`}>{children}</span>;
}

export function Errores({ problemas }: { problemas: Array<{ campo: string; mensaje: string }> }) {
  if (problemas.length === 0) return null;
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800">
      <ul className="flex flex-col gap-1">
        {problemas.map((p) => <li key={`${p.campo}${p.mensaje}`}>{p.mensaje}</li>)}
      </ul>
    </div>
  );
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const numeroOpcional = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')));
