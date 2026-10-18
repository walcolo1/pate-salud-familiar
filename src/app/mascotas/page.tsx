'use client';

/**
 * Mascotas de la familia, en primer nivel.
 *
 * Las mascotas ya tenían su sitio dentro de la ficha de cada familiar
 * (`/members/[id]/pets`), pero había que saber que estaban allí. Esta
 * pantalla las reúne todas, deja darlas de alta sin pasar antes por un
 * familiar —se elige quién está a cargo, por defecto el titular— y lleva en
 * un clic a su peso, sus vacunas y su historial.
 *
 * `?nueva=1` abre el alta directamente: es a donde llevan los accesos del
 * panel principal.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useConfirmacion } from '@/context/Confirmacion';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoVacio from '@/components/ui/EstadoVacio';
import FormularioMascota from '@/components/miembros/FormularioMascota';
import ListaMascotas from '@/components/miembros/ListaMascotas';
import type { Pet } from '@/domain/mascotas';
import { PawPrint, Plus, Users } from 'lucide-react';

type Filtro = 'ACTIVAS' | 'INACTIVAS' | 'TODAS';

export default function MascotasPage() {
  const router = useRouter();
  const { user, isLoading, members, pets, petVaccines, addPet, updatePet, setPetActiva } = useApp();
  const confirmar = useConfirmacion();

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editando, setEditando] = useState<Pet | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVAS');

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  // Quién puede estar a cargo: los familiares activos, el titular primero.
  const responsables = useMemo(
    () =>
      members
        .filter((m) => (m.status ?? 'ACTIVE') === 'ACTIVE')
        .sort((a, b) => (a.relationship === 'SELF' ? -1 : b.relationship === 'SELF' ? 1 : a.fullName.localeCompare(b.fullName, 'es')))
        .map((m) => ({ id: m.id, nombre: m.relationship === 'SELF' ? `${m.fullName} (titular)` : m.fullName })),
    [members],
  );
  const nombreDe = useMemo(() => new Map(members.map((m) => [m.id, m.fullName])), [members]);

  const todas = useMemo(
    () =>
      (pets ?? [])
        .filter((p) => !p.deletedAt)
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')),
    [pets],
  );
  const visibles = todas.filter((p) => (filtro === 'TODAS' ? true : filtro === 'ACTIVAS' ? p.activo : !p.activo));
  const activas = todas.filter((p) => p.activo).length;

  const abrirNueva = () => {
    setEditando(null);
    setFormularioAbierto(true);
  };

  // `?nueva=1`: viene del panel principal y quiere dar de alta ya. Se lee de
  // `window` y no con `useSearchParams` para no obligar a toda la página a
  // renderizarse en el cliente, y se limpia para que un F5 no la reabra.
  useEffect(() => {
    if (typeof window === 'undefined' || isLoading || !user || responsables.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('nueva') !== '1') return;
    window.history.replaceState(null, '', window.location.pathname);
    // Fuera del render del efecto: abrir el diálogo es una consecuencia de
    // haber llegado aquí, no parte de pintar la página.
    const t = setTimeout(() => {
      setEditando(null);
      setFormularioAbierto(true);
    }, 0);
    return () => clearTimeout(t);
  }, [isLoading, user, responsables.length]);

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

  if (isLoading || !user) return <EstadoCarga mensaje="Cargando tu expediente…" />;

  const titular = responsables[0]?.id ?? '';

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Mascotas</h1>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            {todas.length === 0
              ? 'Su peso, sus vacunas y su historial veterinario, junto al resto de la familia.'
              : `${activas} ${activas === 1 ? 'activa' : 'activas'} · ${todas.length} en total`}
          </p>
        </div>
        {responsables.length > 0 && (
          <button
            type="button"
            onClick={abrirNueva}
            className="self-start sm:self-auto flex items-center gap-2 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span>Añadir mascota</span>
          </button>
        )}
      </section>

      {responsables.length === 0 ? (
        <EstadoVacio
          icono={Users}
          titulo="Primero, un familiar"
          descripcion="Cada mascota está a cargo de alguien de la familia. Registra al menos un familiar y vuelve aquí."
          accion={{ tipo: 'enlace', etiqueta: 'Agregar familiar', href: '/members/new' }}
        />
      ) : (
        <>
          {todas.length > 0 && (
            <div role="group" aria-label="Filtrar mascotas" className="flex gap-2">
              {(
                [
                  ['ACTIVAS', 'Activas'],
                  ['INACTIVAS', 'Inactivas'],
                  ['TODAS', 'Todas'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    filtro === valor
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}

          {todas.length > 0 && visibles.length === 0 ? (
            <EstadoVacio
              variante="compacto"
              icono={PawPrint}
              titulo={filtro === 'INACTIVAS' ? 'Ninguna mascota inactiva' : 'Ninguna mascota activa'}
              descripcion="Cambia el filtro para ver las demás."
            />
          ) : (
            <ListaMascotas
              mascotas={visibles}
              vacunas={petVaccines ?? []}
              responsableDe={(id) => nombreDe.get(id) ?? null}
              onNueva={abrirNueva}
              onEditar={(m) => {
                setEditando(m);
                setFormularioAbierto(true);
              }}
              onCambiarEstado={(m) => void cambiarEstado(m)}
            />
          )}
        </>
      )}

      <FormularioMascota
        abierto={formularioAbierto}
        mascota={editando}
        memberId={editando?.memberId ?? titular}
        responsables={responsables}
        onCerrar={() => setFormularioAbierto(false)}
        onGuardar={(borrador) => (editando ? updatePet(editando.id, borrador) : addPet(borrador))}
      />
    </div>
  );
}
