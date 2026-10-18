'use client';

/**
 * Ficha de emergencia imprimible (Bloque N).
 *
 * Lo mínimo para urgencias, en una sola tarjeta: RH, alergias, condiciones,
 * medicamentos activos y contacto. Se imprime solo la tarjeta (ver
 * `.zona-impresion` en globals.css). Los datos vienen del expediente; lo que
 * no está registrado se dice, no se inventa.
 */

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, Droplet, Phone, Pill, Printer, ShieldAlert, Stethoscope } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import { construirFichaEmergencia } from '@/lib/fichaEmergencia';
import { fechaLocalHoy } from '@/lib/repositorioBackend';
import { descripcionEdad } from '@/lib/edad';

function Lista({ elementos, vacio }: { elementos: string[]; vacio: string }) {
  if (elementos.length === 0) return <p className="text-sm font-semibold text-slate-600">{vacio}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {elementos.map((e) => (
        <li key={e} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900">{e}</li>
      ))}
    </ul>
  );
}

export default function FichaEmergenciaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, members, healthProfiles, medicationPrescriptions, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  if (isLoading || !user) return <EstadoCarga mensaje="Cargando tu expediente…" />;

  const familiar = members.find((m) => m.id === id);
  if (!familiar) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Familiar no encontrado"
        mensaje="No hay ningún familiar con ese identificador."
        accionSecundaria={{ etiqueta: 'Volver a la lista de familiares', href: '/members' }}
      />
    );
  }

  const hoy = fechaLocalHoy();
  const ficha = construirFichaEmergencia(familiar, healthProfiles[id], medicationPrescriptions, hoy);

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div className="no-imprimir flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">
          Imprímela o guárdala como PDF y llévala en la billetera.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-teal-800"
        >
          <Printer aria-hidden className="h-4 w-4" /> Imprimir ficha
        </button>
      </div>

      {ficha.faltantes.length > 0 && (
        <div className="no-imprimir flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Falta por registrar: {ficha.faltantes.join(', ')}.{' '}
            <Link href={`/members/${id}/edit`} className="underline">Editar datos</Link> ·{' '}
            <Link href={`/members/${id}/health`} className="underline">Ficha médica</Link>
          </p>
        </div>
      )}

      <article
        aria-labelledby="titulo-ficha-emergencia"
        className="zona-impresion flex flex-col gap-4 rounded-3xl border-2 border-rose-700 bg-white p-5 shadow-sm"
      >
        <header className="flex items-start justify-between gap-3 border-b border-rose-200 pb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-rose-800">Ficha de emergencia</p>
            <h3 id="titulo-ficha-emergencia" className="text-lg font-black leading-tight text-slate-900">{ficha.nombre}</h3>
            <p className="text-xs font-semibold text-slate-700">
              Nacimiento: {ficha.fechaNacimiento} · {descripcionEdad(ficha.fechaNacimiento)}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-2xl border-2 border-rose-700 px-3 py-1.5 text-rose-800">
            <Droplet aria-hidden className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase">Grupo y RH</span>
            <span className="text-xl font-black">{ficha.grupoSanguineo ?? 'Sin registrar'}</span>
          </div>
        </header>

        <section aria-labelledby="fe-alergias">
          <h4 id="fe-alergias" className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-rose-800">
            <ShieldAlert aria-hidden className="h-4 w-4" /> Alergias
          </h4>
          <Lista elementos={ficha.alergias} vacio="Sin alergias registradas." />
        </section>

        <section aria-labelledby="fe-condiciones">
          <h4 id="fe-condiciones" className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-slate-800">
            <Stethoscope aria-hidden className="h-4 w-4" /> Condiciones
          </h4>
          <Lista elementos={ficha.condiciones} vacio="Sin condiciones registradas." />
        </section>

        <section aria-labelledby="fe-medicamentos">
          <h4 id="fe-medicamentos" className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-slate-800">
            <Pill aria-hidden className="h-4 w-4" /> Medicamentos activos
          </h4>
          <Lista
            elementos={ficha.medicamentos.map((m) => (m.detalle ? `${m.nombre} · ${m.detalle}` : m.nombre))}
            vacio="Sin medicamentos activos registrados."
          />
        </section>

        <section aria-labelledby="fe-contacto" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <h4 id="fe-contacto" className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase text-slate-800">
              <Phone aria-hidden className="h-4 w-4" /> Contacto de emergencia
            </h4>
            <p className="text-sm font-bold text-slate-900">{ficha.contactoEmergencia ?? 'Sin registrar'}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-black uppercase text-slate-800">Médico y aseguradora</h4>
            <p className="text-sm font-semibold text-slate-900">
              {[ficha.medicoTratante, ficha.seguro].filter(Boolean).join(' · ') || 'Sin registrar'}
            </p>
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-2 text-[10px] font-semibold text-slate-600">
          Generada el {hoy} desde el expediente familiar. Verifique siempre con el paciente o su acompañante.
        </footer>
      </article>
    </div>
  );
}
