'use client';

/**
 * Peso de una mascota (Bloque D, D2).
 *
 * La alerta de desviación no depende del color: lleva icono, texto y un
 * `role="status"`. Alguien que no distinga el ámbar del rojo tiene que poder
 * saber igual de bien si el animal está diez o treinta por ciento fuera de su
 * peso.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import EstadoVacio from '@/components/ui/EstadoVacio';
import GraficaPeso from '@/components/miembros/GraficaPeso';
import FormularioPeso from '@/components/miembros/FormularioPeso';
import { NOMBRE_ESPECIE } from '@/domain/mascotas';
import { resumenDePeso, serieDePesos, type NivelDesviacion } from '@/lib/pesoMascota';
import { ArrowLeft, AlertTriangle, CheckCircle2, Info, Plus, Scale } from 'lucide-react';

/** Cada nivel con su icono y su texto: el color nunca va solo. */
const ESTILO_NIVEL: Record<
  NivelDesviacion,
  { clase: string; icono: typeof Info; etiqueta: string }
> = {
  'sin-referencia': {
    clase: 'bg-slate-50 text-slate-700 border-slate-200',
    icono: Info,
    etiqueta: 'Sin referencia',
  },
  normal: {
    clase: 'bg-teal-50 text-teal-700 border-teal-100',
    icono: CheckCircle2,
    etiqueta: 'En rango',
  },
  advertencia: {
    clase: 'bg-amber-50 text-amber-700 border-amber-100',
    icono: AlertTriangle,
    etiqueta: 'Conviene vigilarlo',
  },
  alerta: {
    clase: 'bg-rose-50 text-rose-700 border-rose-100',
    icono: AlertTriangle,
    etiqueta: 'Consulta al veterinario',
  },
};

export default function PesoMascotaPage() {
  const router = useRouter();
  const params = useParams<{ id: string; petId: string }>();
  const id = params?.id ?? '';
  const petId = params?.petId ?? '';

  const { user, isLoading, members, pets, petWeights, addPetWeight } = useApp();
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const member = members.find((m) => m.id === id);
  const mascota = (pets ?? []).find((p) => p.id === petId && !p.deletedAt);
  const serie = useMemo(() => serieDePesos(petWeights ?? [], petId), [petWeights, petId]);

  if (isLoading || !user) return <EstadoCarga mensaje="Cargando tu expediente…" />;

  if (!member || !mascota) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Mascota no encontrada"
        mensaje="Tu expediente se abrió correctamente, pero no hay ninguna mascota con ese identificador. Puede que se haya eliminado, o que el enlace esté mal."
        accionSecundaria={{ etiqueta: 'Volver a las mascotas', href: `/members/${id}/pets` }}
      />
    );
  }

  const { ultimo, variacion, desviacion } = resumenDePeso(mascota, petWeights ?? []);
  const estilo = ESTILO_NIVEL[desviacion.nivel];
  const Icono = estilo.icono;

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      <section className="flex justify-between items-center gap-3">
        <Link
          href={`/members/${id}/pets`}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>Mascotas</span>
        </Link>

        <button
          onClick={() => setFormularioAbierto(true)}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          <span>Registrar peso</span>
        </button>
      </section>

      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Scale className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-800 leading-tight">
              Peso de {mascota.nombre}
            </h2>
            <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
              {NOMBRE_ESPECIE[mascota.especie]}
              {mascota.pesoIdealKg != null ? ` · ideal ${mascota.pesoIdealKg} kg` : ''}
            </p>
          </div>
        </div>

        {/* Último pesaje y tendencia. */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[130px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[9px] font-extrabold uppercase text-slate-600 leading-none">
              Último pesaje
            </p>
            <p className="text-sm font-black text-slate-800 mt-1.5 tabular-nums">
              {ultimo ? `${ultimo.pesoKg} kg` : 'Sin registros'}
            </p>
          </div>

          <div className="flex-1 min-w-[130px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[9px] font-extrabold uppercase text-slate-600 leading-none">
              Respecto al anterior
            </p>
            <p className="text-sm font-black text-slate-800 mt-1.5 tabular-nums">
              {variacion === null
                ? '—'
                : `${variacion > 0 ? '+' : ''}${variacion} kg`}
            </p>
          </div>
        </div>

        {/*
          La alerta: icono, etiqueta y frase. El color acompaña, no informa
          por su cuenta.
        */}
        <p
          role="status"
          className={`flex items-start gap-2 rounded-2xl border p-3 text-[11px] font-bold leading-relaxed ${estilo.clase}`}
        >
          <Icono aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>{estilo.etiqueta}.</strong> {desviacion.mensaje}
          </span>
        </p>
      </section>

      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm" aria-label="Evolución del peso">
        {serie.length === 0 ? (
          <EstadoVacio
            icono={Scale}
            titulo="Aún no hay registros de peso"
            descripcion="Anota el peso cada vez que lo peses. Con dos o tres registros ya se ve la tendencia, y con el peso ideal puesto se avisa si se desvía."
            accion={{
              tipo: 'boton',
              etiqueta: 'Registrar peso',
              onClick: () => setFormularioAbierto(true),
            }}
          />
        ) : (
          <GraficaPeso
            serie={serie}
            pesoIdeal={mascota.pesoIdealKg}
            nombreMascota={mascota.nombre}
          />
        )}
      </section>

      <FormularioPeso
        abierto={formularioAbierto}
        nombreMascota={mascota.nombre}
        onCerrar={() => setFormularioAbierto(false)}
        onGuardar={(entrada) => addPetWeight({ petId, ...entrada })}
      />
    </div>
  );
}
