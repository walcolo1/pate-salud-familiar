'use client';

/**
 * Vacunas de una mascota (Bloque D, D3).
 *
 * El estado de cada vacuna se calcula al pintar, nunca se guarda: una vacuna
 * marcada como «al día» en la base de datos sigue diciéndolo el día después de
 * vencer. Aquí se deriva de dos fechas y siempre es cierto.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import EstadoVacio from '@/components/ui/EstadoVacio';
import FormularioVacunaMascota from '@/components/miembros/FormularioVacunaMascota';
import { NOMBRE_ESPECIE } from '@/domain/mascotas';
import {
  estadoDeVacuna,
  fechaLarga,
  vacunasDe,
  type EstadoVacuna,
} from '@/lib/vacunasMascota';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Info,
  Plus,
  Syringe,
} from 'lucide-react';

/** Cada estado con su icono y su etiqueta: el color nunca informa solo. */
const ESTILO: Record<EstadoVacuna, { clase: string; icono: typeof Info; etiqueta: string }> = {
  'sin-refuerzo': {
    clase: 'bg-slate-50 text-slate-600 border-slate-200',
    icono: Info,
    etiqueta: 'Sin refuerzo',
  },
  'al-dia': {
    clase: 'bg-teal-50 text-teal-700 border-teal-100',
    icono: CheckCircle2,
    etiqueta: 'Al día',
  },
  proxima: {
    clase: 'bg-amber-50 text-amber-700 border-amber-100',
    icono: CalendarClock,
    etiqueta: 'Próxima',
  },
  vencida: {
    clase: 'bg-rose-50 text-rose-700 border-rose-100',
    icono: AlertTriangle,
    etiqueta: 'Vencida',
  },
};

export default function VacunasMascotaPage() {
  const router = useRouter();
  const params = useParams<{ id: string; petId: string }>();
  const id = params?.id ?? '';
  const petId = params?.petId ?? '';

  const { user, isLoading, members, pets, petVaccines, addPetVaccine } = useApp();
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const member = members.find((m) => m.id === id);
  const mascota = (pets ?? []).find((p) => p.id === petId && !p.deletedAt);
  const lista = useMemo(() => vacunasDe(petVaccines ?? [], petId), [petVaccines, petId]);

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
          <span>Registrar vacuna</span>
        </button>
      </section>

      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-3">
        <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
          <Syringe className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-black text-slate-800 leading-tight">
            Vacunas de {mascota.nombre}
          </h2>
          <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
            {NOMBRE_ESPECIE[mascota.especie]} ·{' '}
            {lista.length === 0
              ? 'sin registros'
              : `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Cartilla de vacunación">
        {lista.length === 0 ? (
          <EstadoVacio
            icono={Syringe}
            titulo="Aún no hay vacunas registradas"
            descripcion="Apunta las que ya tenga y la fecha del siguiente refuerzo. Aparecerá en la agenda y se avisará cuando se acerque."
            accion={{
              tipo: 'boton',
              etiqueta: 'Registrar vacuna',
              onClick: () => setFormularioAbierto(true),
            }}
          />
        ) : (
          lista.map((vacuna) => {
            const estado = estadoDeVacuna(vacuna);
            const estilo = ESTILO[estado.estado];
            const Icono = estilo.icono;

            return (
              <article
                key={vacuna.id}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`h-10 w-10 shrink-0 rounded-2xl border flex items-center justify-center ${estilo.clase}`}
                  >
                    <Icono className="h-4.5 w-4.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-extrabold text-slate-800 truncate">
                        {vacuna.vacuna}
                      </h3>
                      <span
                        className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${estilo.clase}`}
                      >
                        {estilo.etiqueta}
                      </span>
                    </div>

                    <p className="text-[10px] font-bold text-slate-600 mt-1">
                      Aplicada el {fechaLarga(vacuna.fecha)}
                    </p>

                    {/* El estado, en texto: el color solo acompaña. */}
                    <p className="text-[11px] text-slate-700 font-semibold mt-1.5 leading-relaxed">
                      {estado.mensaje}
                    </p>

                    {(vacuna.laboratorio || vacuna.lote || vacuna.veterinario) && (
                      <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
                        {[
                          vacuna.laboratorio ? `Laboratorio: ${vacuna.laboratorio}` : null,
                          vacuna.lote ? `Lote: ${vacuna.lote}` : null,
                          vacuna.veterinario ? `Veterinario: ${vacuna.veterinario}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <FormularioVacunaMascota
        abierto={formularioAbierto}
        nombreMascota={mascota.nombre}
        onCerrar={() => setFormularioAbierto(false)}
        onGuardar={(entrada) => addPetVaccine({ petId, ...entrada })}
      />
    </div>
  );
}
