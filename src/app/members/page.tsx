'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Search, Plus, User, ArrowRight } from 'lucide-react';
import { Relationship, BloodType } from '@/domain/models';

const relationshipMap: Record<Relationship, string> = {
  SELF: 'Titular',
  SPOUSE: 'Cónyuge',
  CHILD: 'Hijo/a',
  PARENT: 'Padre/Madre',
  SIBLING: 'Hermano/a',
  GRANDPARENT: 'Abuelo/a',
  OTHER: 'Otro'
};

const bloodTypeMap: Record<BloodType, string> = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A-',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B-',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB-',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O-',
  UNKNOWN: 'Desconocido'
};

export default function MembersPage() {
  const router = useRouter();
  const { user, members, documents, isLoading } = useApp();
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');

  // Helper to format document type and number visually
  const formatDocument = (type: string, number: string) => {
    if (!type || !number) return '';
    const digitsOnly = /^\d+$/.test(number);
    const formatted = digitsOnly 
      ? new Intl.NumberFormat('es-CO').format(parseInt(number, 10))
      : number;
    return `${type} ${formatted}`;
  };

  // Helper to count documents for a member
  const getMemberDocCount = (memberId: string) => {
    return documents.filter(d => d.memberId === memberId && !d.deletedAt).length;
  };

  // Helper to format document counts visually
  const formatDocumentCount = (count: number) => {
    if (count === 1) return '1 documento';
    return `${count} documentos`;
  };

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

  // Calculate age helper
  const calculateAge = (birthDateStr: string) => {
    const today = new Date();
    const birthDate = new Date(birthDateStr);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.fullName.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const status = m.status || 'ACTIVE';
    if (memberFilter === 'ACTIVE') return status === 'ACTIVE';
    if (memberFilter === 'INACTIVE') return status === 'INACTIVE';
    return true;
  });

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Header section */}
      <section className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 leading-tight">Mi Familia</h2>
          <p className="text-xs font-semibold text-slate-400">Gestiona los expedientes de tu hogar.</p>
        </div>
        <Link
          href="/members/new"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs px-4.5 py-3 rounded-2xl shadow-md shadow-teal-600/10 active:translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          <span>Agregar</span>
        </Link>
      </section>

      {/* Search Bar */}
      <section className="relative">
        <span className="absolute left-4.5 top-1/2 -translate-y-1/2 text-slate-400">
          <Search className="h-4.5 w-4.5" />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar familiar por nombre..."
          className="w-full h-13 pl-12 pr-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-2xl shadow-sm shadow-slate-100/40 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
        />
      </section>

      {/* Filters row */}
      <section className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mt-2">
        {[
          { label: 'Activos', value: 'ACTIVE' },
          { label: 'Inactivos', value: 'INACTIVE' },
          { label: 'Todos', value: 'ALL' }
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setMemberFilter(item.value as any)}
            className={`px-4 h-9.5 text-xs font-bold rounded-full transition-all duration-200 shrink-0 ${
              memberFilter === item.value 
                ? 'bg-slate-800 text-white' 
                : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      {/* Grid of members */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredMembers.length === 0 ? (
          <div className="col-span-full bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <User className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No se encontraron familiares</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Prueba buscando con otro nombre o agrega un nuevo familiar con el botón de la parte superior.
            </p>
          </div>
        ) : (
          filteredMembers.map((member) => {
            const age = calculateAge(member.birthDate);
            return (
              <Link
                key={member.id}
                href={`/members/${member.id}`}
                className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm shadow-slate-100/40 hover:shadow-md transition-all duration-200 group"
              >
                {/* Avatar */}
                <div className="relative h-14 w-14 rounded-full bg-teal-600/10 text-teal-700 border border-teal-600/20 flex items-center justify-center font-black text-base shrink-0 overflow-hidden group-hover:bg-teal-600 group-hover:text-white transition-all duration-300">
                  {member.avatarUrl ? (
                    <>
                      <span className="absolute inset-0 flex items-center justify-center">
                        {member.fullName.substring(0, 2).toUpperCase()}
                      </span>
                      <img 
                        src={member.avatarUrl} 
                        alt={member.fullName}
                        className="h-full w-full object-cover relative z-10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </>
                  ) : (
                    member.fullName.substring(0, 2).toUpperCase()
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-extrabold text-slate-800 truncate leading-none">{member.fullName}</h4>
                    {(member.status || 'ACTIVE') === 'INACTIVE' && (
                      <span className="text-[8px] font-extrabold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 uppercase leading-none">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-bold mb-1.5">
                    {relationshipMap[member.relationship]} · {age} {age === 1 ? 'año' : 'años'}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {member.bloodType && member.bloodType !== 'UNKNOWN' && (
                      <span className="text-[9px] font-extrabold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-600/10 uppercase leading-none">
                        RH {bloodTypeMap[member.bloodType]}
                      </span>
                    )}
                    {member.documentType && member.documentNumber && (
                      <span className="text-[9px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-600/10 uppercase leading-none">
                        {formatDocument(member.documentType, member.documentNumber)}
                      </span>
                    )}
                    <span className="text-[9px] font-extrabold bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 uppercase leading-none">
                      {formatDocumentCount(getMemberDocCount(member.id))}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-teal-600 group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            );
          })
        )}
      </section>

    </div>
  );
}
