'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Clock, 
  Calendar, 
  Activity, 
  Plus, 
  FileText, 
  Beaker, 
  Bell, 
  Info,
  ShieldAlert
} from 'lucide-react';
import { HistoryEventType, MedicalHistoryEvent } from '@/domain/models';

export default function HistoryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, history, isLoading } = useApp();

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

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <h3 className="font-extrabold text-slate-800 text-lg">Familiar no encontrado</h3>
      </div>
    );
  }

  const memberHistory = history
    .filter(h => h.memberId === id)
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

  const getEventMeta = (type: HistoryEventType) => {
    switch (type) {
      case 'APPOINTMENT':
        return { icon: Calendar, color: 'bg-teal-50 text-teal-600 border-teal-100' };
      case 'CHECKUP':
        return { icon: Activity, color: 'bg-orange-50 text-orange-600 border-orange-100' };
      case 'VACCINE':
        return { icon: Plus, color: 'bg-blue-50 text-blue-600 border-blue-100' };
      case 'EXAM':
        return { icon: Beaker, color: 'bg-purple-50 text-purple-600 border-purple-100' };
      case 'DOCUMENT':
        return { icon: FileText, color: 'bg-cyan-50 text-cyan-600 border-cyan-100' };
      case 'REMINDER':
        return { icon: Bell, color: 'bg-amber-50 text-amber-600 border-amber-100' };
      default:
        return { icon: Info, color: 'bg-slate-50 text-slate-500 border-slate-200' };
    }
  };

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
        <h2 className="text-sm font-black text-slate-800 tracking-wide uppercase">Historial Clínico</h2>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Línea de Tiempo de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Consolidado cronológico de todos los sucesos médicos.</p>
      </section>

      {/* Timeline Section */}
      <section className="relative pl-6 flex flex-col gap-6">
        
        {/* Vertical line line */}
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />

        {memberHistory.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3 ml-2">
            <Clock className="h-10 w-10 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-800">Historial vacío</p>
            <p className="text-xs text-slate-400 max-w-xs">No se registran eventos cronológicos para este familiar.</p>
          </div>
        ) : (
          memberHistory.map((event) => {
            const meta = getEventMeta(event.eventType);
            const EventIcon = meta.icon;

            return (
              <div 
                key={event.id}
                className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm ml-2"
              >
                {/* Timeline node dot */}
                <span className="absolute -left-9 top-6 h-5 w-5 rounded-full bg-slate-200 border-4 border-slate-50 flex items-center justify-center z-10">
                  <span className="h-2 w-2 rounded-full bg-teal-600" />
                </span>

                {/* Left side info */}
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`p-3 rounded-2xl border ${meta.color} shrink-0 mt-0.5`}>
                    <EventIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 mb-1 leading-tight">{event.title}</h4>
                    {event.description && (
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">{event.description}</p>
                    )}
                  </div>
                </div>

                {/* Right side Date */}
                <div className="text-xs font-extrabold text-teal-600 self-end sm:self-center shrink-0">
                  {new Date(event.eventDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            );
          })
        )}
      </section>

    </div>
  );
}
