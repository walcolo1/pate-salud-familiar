'use client';

/**
 * Mascotas de un familiar (Bloque D, D1).
 *
 * Primera pantalla del módulo veterinario: dar de alta, listar, editar y
 * marcar como inactiva. Los pesos (D2), las vacunas (D3) y el historial (D4)
 * llegan después, y por eso aquí cada tarjeta ya reserva su sitio.
 *
 * Nace con los tres estados del Bloque C —carga, vacío y error— en vez de
 * añadirlos luego: eso fue exactamente lo que costó C2.
 */

import React, { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import EstadoVacio from '@/components/ui/EstadoVacio';
import FormularioMascota from '@/components/miembros/FormularioMascota';
import { useConfirmacion } from '@/context/Confirmacion';
import { NOMBRE_ESPECIE, NOMBRE_SEXO, mascotasDe, type Pet } from '@/domain/mascotas';
import { descripcionEdad } from '@/lib/edad';
import { vacunasPendientes } from '@/lib/vacunasMascota';
import Link from 'next/link';
import { PawPrint, Plus, Pencil, Power, Scale, Stethoscope, Syringe } from 'lucide-react';

export default function PetsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, isLoading, members, pets, petVaccines, addPet, updatePet, setPetActiva } = useApp();
  const confirmar = useConfirmacion();

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editando, setEditando] = useState<Pet | null>(null);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const member = members.find((m) => m.id === id);
  const lista = useMemo(() => mascotasDe(pets ?? [], id), [pets, id]);

  if (isLoading || !user) {
    return <EstadoCarga mensaje="Cargando tu expediente…" />;
  }

  if (!member) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Familiar no encontrado"
        mensaje="Tu expediente se abrió correctamente, pero no hay ningún familiar con ese identificador. Puede que se haya eliminado, o que el enlace esté mal."
        accionSecundaria={{ etiqueta: 'Volver a la lista de familiares', href: '/members' }}
      />
    );
  }

  const abrirNueva = () => {
    setEditando(null);
    setFormularioAbierto(true);
  };

  const abrirEdicion = (mascota: Pet) => {
    setEditando(mascota);
    setFormularioAbierto(true);
  };

  const cambiarEstado = async (mascota: Pet) => {
    if (!mascota.activo) {
      setPetActiva(mascota.id, true);
      return;
    }
    const aceptado = await confirmar({
      titulo: 'Marcar mascota como inactiva',
      descripcion: `${mascota.nombre} dejará de aparecer entre las mascotas activas. Su historial se conserva y puede reactivarse cuando quieras.`,
      etiquetaConfirmar: 'Marcar inactiva',
      tono: 'primario',
    });
    if (aceptado) setPetActiva(mascota.id, false);
  };

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      <section className="flex justify-end items-center">
        <button
          onClick={abrirNueva}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          <span>Registrar mascota</span>
        </button>
      </section>

      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-3">
        <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
          <PawPrint className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-black text-slate-800 leading-tight">Mascotas</h2>
          <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
            {lista.length === 0
              ? 'Sin mascotas registradas'
              : `${lista.length} ${lista.length === 1 ? 'mascota' : 'mascotas'} a cargo de ${member.fullName}`}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Mascotas registradas">
        {lista.length === 0 ? (
          <EstadoVacio
            icono={PawPrint}
            titulo="Sin mascotas registradas"
            descripcion="Registra a la primera para llevar su peso, sus vacunas y su historial veterinario en el mismo sitio que el resto de la familia."
            accion={{ tipo: 'boton', etiqueta: 'Registrar mascota', onClick: abrirNueva }}
          />
        ) : (
          lista.map((mascota) => {
            const edad = mascota.fechaNacimiento ? descripcionEdad(mascota.fechaNacimiento) : null;
            // Vacunas vencidas o a punto: la insignia lleva número Y el enlace
            // lo dice en su nombre accesible, porque un punto de color no se
            // oye.
            const pendientes = vacunasPendientes(
              (petVaccines ?? []).filter((v) => v.petId === mascota.id),
            ).length;
            return (
              <article
                key={mascota.id}
                className={`bg-white p-5 rounded-3xl border shadow-sm flex flex-col gap-3 ${
                  mascota.activo ? 'border-slate-100' : 'border-slate-200 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center"
                  >
                    <PawPrint className="h-4.5 w-4.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-extrabold text-slate-800 truncate">
                        {mascota.nombre}
                      </h3>
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                        {NOMBRE_ESPECIE[mascota.especie]}
                      </span>
                      {!mascota.activo && (
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Inactiva
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] font-bold text-slate-600 mt-1 leading-relaxed">
                      {[
                        mascota.raza,
                        NOMBRE_SEXO[mascota.sexo],
                        edad,
                        mascota.pesoActualKg != null ? `${mascota.pesoActualKg} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>

                    {mascota.notas && (
                      <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">{mascota.notas}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 justify-end flex-wrap">
                  <Link
                    href={`/members/${id}/pets/${mascota.id}/peso`}
                    aria-label={`Ver el peso de ${mascota.nombre}`}
                    className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Scale aria-hidden="true" className="h-3.5 w-3.5" />
                    Peso
                  </Link>
                  <Link
                    href={`/members/${id}/pets/${mascota.id}/vacunas`}
                    aria-label={
                      pendientes > 0
                        ? `Ver las vacunas de ${mascota.nombre}: ${pendientes} por revisar`
                        : `Ver las vacunas de ${mascota.nombre}`
                    }
                    className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Syringe aria-hidden="true" className="h-3.5 w-3.5" />
                    Vacunas
                    {pendientes > 0 && (
                      <span className="ml-0.5 px-1.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                        {pendientes}
                      </span>
                    )}
                  </Link>
                  <Link
                    href={`/members/${id}/pets/${mascota.id}/historial`}
                    aria-label={`Ver el historial de ${mascota.nombre}`}
                    className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Stethoscope aria-hidden="true" className="h-3.5 w-3.5" />
                    Historial
                  </Link>
                  <button
                    onClick={() => abrirEdicion(mascota)}
                    className="px-3.5 h-8.5 text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => void cambiarEstado(mascota)}
                    className="px-3.5 h-8.5 text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Power aria-hidden="true" className="h-3.5 w-3.5" />
                    {mascota.activo ? 'Marcar inactiva' : 'Reactivar'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <FormularioMascota
        abierto={formularioAbierto}
        mascota={editando}
        memberId={id}
        onCerrar={() => setFormularioAbierto(false)}
        onGuardar={(borrador) =>
          editando ? updatePet(editando.id, borrador) : addPet(borrador)
        }
      />
    </div>
  );
}
