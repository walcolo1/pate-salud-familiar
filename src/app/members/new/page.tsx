'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react';
import { Relationship, BloodType } from '@/domain/models';

export default function NewMemberPage() {
  const router = useRouter();
  const { user, addMember, isLoading } = useApp();
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [relationship, setRelationship] = useState<Relationship>('CHILD');
  const [bloodType, setBloodType] = useState<BloodType | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio');
      return;
    }

    if (!birthDate) {
      setError('La fecha de nacimiento es obligatoria');
      return;
    }

    addMember({
      fullName,
      birthDate,
      relationship,
      bloodType: bloodType === '' ? null : bloodType,
      notes: notes.trim() || null,
      photoUrl: null
    });

    router.replace('/members');
  };

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Navigation Header */}
      <section className="flex justify-between items-center">
        <Link 
          href="/members" 
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Cancelar</span>
        </Link>
        <h2 className="text-sm font-black text-slate-800 tracking-wide uppercase">Agregar Familiar</h2>
      </section>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
        
        {/* Error notification */}
        {error && (
          <div className="flex gap-2.5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-semibold items-center">
            <ShieldAlert className="h-4.5 w-4.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Full Name */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-700">Nombre Completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ej. Juan Pérez"
            className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200"
          />
        </div>

        {/* Birth Date */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-700">Fecha de Nacimiento</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 outline-none transition-all duration-200"
          />
        </div>

        {/* Grid for selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Relationship */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-extrabold text-slate-700">Parentesco</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship)}
              className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 outline-none transition-all duration-200"
            >
              <option value="CHILD">Hijo/a</option>
              <option value="SPOUSE">Cónyuge</option>
              <option value="PARENT">Padre/Madre</option>
              <option value="SIBLING">Hermano/a</option>
              <option value="GRANDPARENT">Abuelo/a</option>
              <option value="SELF">Titular</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>

          {/* Blood Type */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-extrabold text-slate-700">Grupo Sanguíneo</label>
            <select
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value as BloodType | '')}
              className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 outline-none transition-all duration-200"
            >
              <option value="">No asignado</option>
              <option value="O_POSITIVE">RH O+</option>
              <option value="O_NEGATIVE">RH O-</option>
              <option value="A_POSITIVE">RH A+</option>
              <option value="A_NEGATIVE">RH A-</option>
              <option value="B_POSITIVE">RH B+</option>
              <option value="B_NEGATIVE">RH B-</option>
              <option value="AB_POSITIVE">RH AB+</option>
              <option value="AB_NEGATIVE">RH AB-</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-700">Alertas o Notas Médicas (Opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alergia a la penicilina, intolerancia a la lactosa, asma activa..."
            className="h-24 p-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-all duration-200"
          />
        </div>

        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full h-13 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold rounded-2xl shadow-md shadow-teal-600/10 active:translate-y-0.5 transition-all duration-200"
        >
          <Save className="h-4.5 w-4.5" />
          <span>Guardar Familiar</span>
        </button>

      </form>

    </div>
  );
}
