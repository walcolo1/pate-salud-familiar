'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const member = members.find(m => m.id === id);
  const profile = healthProfiles[id];

  if (!member || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center select-none">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h3 className="font-extrabold text-slate-800 text-lg">Perfil de salud no encontrado</h3>
        <Link href="/members" className="text-sm font-bold text-teal-600 hover:underline">
          Volver a la lista de familiares
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Navigation Header */}
      <section className="flex justify-between items-center">
        <Link 
          href={`/members/${id}`} 
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al perfil</span>
        </Link>
        <h2 className="text-sm font-black text-slate-800 tracking-wide uppercase">Ficha Médica</h2>
      </section>

      {/* Member summary block */}
      <section className="bg-gradient-to-r from-slate-800 to-slate-700 p-5 rounded-3xl text-white shadow-md">
        <h3 className="font-extrabold text-lg">{member.fullName}</h3>
        <p className="text-xs text-slate-300 font-semibold mt-1">
          Ficha clínica · Última actualización: {new Date(profile.lastUpdated).toLocaleDateString('es-CO')}
        </p>
      </section>

      {/* Allergies Card */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
          <h4 className="font-extrabold text-xs tracking-wide uppercase">Alergias</h4>
        </div>
        <hr className="border-slate-50" />
        {profile.allergies.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold">No se reportan alergias conocidas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.allergies.map((allergy, i) => (
              <span key={i} className="text-xs font-extrabold bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl border border-rose-100">
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
          <p className="text-xs text-slate-400 font-semibold">No se reportan condiciones médicas crónicas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.chronicConditions.map((cond, i) => (
              <span key={i} className="text-xs font-extrabold bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl border border-amber-100">
                {cond}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Current Medications */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-teal-600">
          <Activity className="h-5 w-5" />
          <h4 className="font-extrabold text-xs tracking-wide uppercase">Medicamentos Actuales</h4>
        </div>
        <hr className="border-slate-50" />
        {profile.currentMedications.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold">No consume medicamentos de rutina actualmente.</p>
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
            <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">Médico de cabecera</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.primaryDoctor || 'No asignado'}</p>
          </div>
        </div>

        {/* Insurance */}
        <div className="flex items-center gap-4.5">
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">Entidad de Salud (EPS)</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.insuranceInfo || 'No asignada'}</p>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="flex items-center gap-4.5">
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">Contacto de Emergencia</span>
            <p className="text-xs font-extrabold text-slate-700">{profile.emergencyContact || 'No asignado'}</p>
          </div>
        </div>
      </section>

    </div>
  );
}
