'use client';

import React, { useEffect } from 'react';
import EstadoError from '@/components/ui/EstadoError';
import EstadoCarga from '@/components/ui/EstadoCarga';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ShieldAlert, 
  Heart, 
  Activity, 
  AlertTriangle,
  User,
  Phone,
  AlertCircle
} from 'lucide-react';

export default function HealthProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, healthProfiles, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <EstadoCarga mensaje="Cargando tu expediente…" />
    );
  }

  const member = members.find(m => m.id === id);
  const profile = healthProfiles[id];

  if (!member || !profile) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Perfil de salud no encontrado"
        mensaje="Tu expediente se abrió correctamente, pero no hay ningún familiar con ese identificador. Puede que se haya eliminado, o que el enlace esté mal."
        accionSecundaria={{ etiqueta: 'Volver a la lista de familiares', href: '/members' }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      

      {/* Member summary block */}
      <section className="bg-gradient-to-r from-slate-800 to-slate-700 p-5 rounded-3xl text-white shadow-md">
        <h3 className="font-extrabold text-lg">{member.fullName}</h3>
        <p className="text-xs text-slate-300 font-semibold mt-1">
          Ficha clínica · Última actualización: {new Date(profile.lastUpdated).toLocaleDateString('es-CO')}
        </p>
      </section>

      {/* Allergies Card */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-rose-700">
          <AlertTriangle className="h-5 w-5" />
          <h4 className="font-extrabold text-xs tracking-wide uppercase">Alergias</h4>
        </div>
        <hr className="border-slate-50" />
        {profile.allergies.length === 0 ? (
          <p className="text-xs text-slate-500 font-semibold">No se reportan alergias conocidas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.allergies.map((allergy, i) => (
              <span key={i} className="text-xs font-extrabold bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-100">
                ⚠️ {allergy}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Chronic Conditions */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-amber-500">
          <AlertCircle className="h-5 w-5" />
          <h4 className="font-extrabold text-xs tracking-wide uppercase">Condiciones Crónicas</h4>
        </div>
        <hr className="border-slate-50" />
        {profile.chronicConditions.length === 0 ? (
          <p className="text-xs text-slate-500 font-semibold">No se reportan condiciones médicas crónicas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.chronicConditions.map((cond, i) => (
              <span key={i} className="text-xs font-extrabold bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-100">
                {cond}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Current Medications */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-teal-700">
          <Activity className="h-5 w-5" />
          <h4 className="font-extrabold text-xs tracking-wide uppercase">Medicamentos Actuales</h4>
        </div>
        <hr className="border-slate-50" />
        {profile.currentMedications.length === 0 ? (
          <p className="text-xs text-slate-500 font-semibold">No consume medicamentos de rutina actualmente.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {profile.currentMedications.map((med, i) => (
              <div key={i} className="p-3 bg-teal-50/50 border border-teal-100/50 text-xs font-semibold text-teal-800 rounded-xl">
                💊 {med}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Operational details */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Información Operativa</h4>
        <hr className="border-slate-50" />

        {/* Doctor */}
        <div className="flex items-center gap-4.5">
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
            <User className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold block leading-none mb-1">Médico de cabecera</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.primaryDoctor || 'No asignado'}</p>
          </div>
        </div>

        {/* Insurance */}
        <div className="flex items-center gap-4.5">
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold block leading-none mb-1">Entidad de Salud (EPS)</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.insuranceInfo || 'No asignada'}</p>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="flex items-center gap-4.5">
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold block leading-none mb-1">Contacto de Emergencia</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.emergencyContact || 'No asignado'}</p>
          </div>
        </div>
      </section>

    </div>
  );
}
