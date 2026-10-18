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
import FormularioMascota from '@/components/miembros/FormularioMascota';
import ListaMascotas from '@/components/miembros/ListaMascotas';
import { useConfirmacion } from '@/context/Confirmacion';
import { mascotasDe, type Pet } from '@/domain/mascotas';
import { PawPrint, Plus } from 'lucide-react';

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

      <ListaMascotas
        mascotas={lista}
        vacunas={petVaccines ?? []}
        onNueva={abrirNueva}
        onEditar={abrirEdicion}
        onCambiarEstado={(m) => void cambiarEstado(m)}
      />

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
