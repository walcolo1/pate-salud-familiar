'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Users, 
  Bell, 
  Calendar, 
  Plus, 
  ArrowRight, 
  Clock, 
  AlertCircle, 
  ShieldAlert 
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { 
    user, 
    members, 
    appointments, 
    reminders, 
    tasks,
    isLoading 
  } = useApp();

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

  // Get first name
  const firstName = user.displayName.split(' ')[0];

  // Get upcoming appointments (status = SCHEDULED, sorted by date ascending)
  const upcomingAppts = appointments
    .filter(a => a.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 3);

  // Get active warnings (overdue reminders or high priority tasks)
  const activeReminders = reminders
    .filter(r => r.status === 'OVERDUE' || r.status === 'PENDING')
    .slice(0, 3);

  // Format date helper
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-8 pb-10">
      
      {/* ── Welcome Banner ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-teal-700 to-teal-600 p-6 md:p-8 rounded-3xl text-white shadow-lg shadow-teal-700/10">
        <span className="text-xs font-extrabold text-teal-100 uppercase tracking-widest leading-none mb-2 block">Paté Salud Familiar</span>
        <h2 className="text-2xl md:text-3xl font-black mb-1">¡Hola, {firstName}! 👋</h2>
        <p className="text-sm text-teal-50/80 max-w-md font-medium">
          Tienes el control de la salud de tu hogar en tus manos. Aquí está el resumen de hoy.
        </p>
      </section>

      {/* ── Family Members Section ───────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase">Mi Familia ({members.length})</h3>
          <Link href="/members" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
            <span>Ver todos</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Members row */}
        <div className="flex items-center gap-3.5 overflow-x-auto pb-2 scrollbar-none w-full">
          {members.length === 0 ? (
            <div className="flex-1 bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2 shadow-sm">
              <div className="h-12 w-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold text-slate-800">Aún no tienes miembros registrados</p>
              <p className="text-[10px] text-slate-400">Comienza agregando a tu primer familiar para gestionar sus expedientes.</p>
              <Link
                href="/members/new"
                className="mt-2 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs px-4.5 py-2 rounded-xl shadow-md shadow-teal-900/10 transition-colors duration-200"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar primer familiar</span>
              </Link>
            </div>
          ) : (
            <>
              {members.map((member) => (
                <Link
                  key={member.id}
                  href={`/members/${member.id}`}
                  className="flex flex-col items-center gap-2 bg-white p-4 rounded-2xl min-w-[100px] border border-slate-100 shadow-sm shadow-slate-100/40 hover:shadow-md transition-all duration-200 active:scale-95 shrink-0"
                >
                  <div className="h-12 w-12 rounded-full bg-teal-600/10 text-teal-700 border border-teal-600/20 flex items-center justify-center font-black text-sm">
                    {member.fullName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[80px]">{member.fullName.split(' ')[0]}</p>
                    <span className="text-[10px] text-slate-400 font-semibold">{member.relationship === 'SELF' ? 'Tú' : member.relationship === 'CHILD' ? 'Hijo/a' : 'Cónyuge'}</span>
                  </div>
                </Link>
              ))}

              {/* Add member shortcut */}
              <Link
                href="/members/new"
                className="flex flex-col items-center justify-center gap-2 bg-slate-100/50 hover:bg-slate-100 p-4 rounded-2xl min-w-[100px] min-h-[108px] border border-dashed border-slate-200 transition-all duration-200 active:scale-95 shrink-0"
              >
                <div className="h-10 w-10 rounded-full bg-white text-teal-600 flex items-center justify-center border border-slate-200">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-teal-600">Añadir</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Quick Actions Grid ───────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 select-none">
        <Link
          href="/members"
          className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-800 leading-tight">Familiares</h4>
            <span className="text-[10px] text-slate-400 font-semibold">Fichas y perfiles</span>
          </div>
        </Link>

        <Link
          href="/reminders"
          className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-800 leading-tight">Recordatorios</h4>
            <span className="text-[10px] text-slate-400 font-semibold">Alarmas y tareas</span>
          </div>
        </Link>
      </section>

      {/* ── Dual Widgets Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Upcoming Appointments */}
        <section className="flex flex-col gap-3">
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1">Próximas Citas</h3>
          <div className="flex flex-col gap-3">
            {upcomingAppts.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2">
                <Calendar className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-800">No hay citas programadas</p>
                <p className="text-[10px] text-slate-400">Todo está al día en la agenda médica.</p>
              </div>
            ) : (
              upcomingAppts.map((appt) => {
                const patient = members.find(m => m.id === appt.memberId)?.fullName.split(' ')[0] || 'Familiar';
                return (
                  <div 
                    key={appt.id}
                    className="flex items-start gap-3.5 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"
                  >
                    <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl mt-0.5">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className="text-xs font-extrabold text-slate-800 leading-tight truncate">{appt.doctorName}</h4>
                        <span className="text-[9px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full uppercase">{patient}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mb-1.5">{appt.specialty} · {appt.location}</p>
                      <div className="flex items-center gap-1 text-[10px] text-teal-600 font-extrabold">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDate(appt.scheduledAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Alertas y Alamas */}
        <section className="flex flex-col gap-3">
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1">Alertas Activas</h3>
          <div className="flex flex-col gap-3">
            {activeReminders.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-800">Sin alertas pendientes</p>
                <p className="text-[10px] text-slate-400">No hay alarmas vencidas ni urgentes.</p>
              </div>
            ) : (
              activeReminders.map((reminder) => {
                const patient = members.find(m => m.id === reminder.memberId)?.fullName.split(' ')[0] || 'Familiar';
                const isOverdue = reminder.status === 'OVERDUE';
                return (
                  <div 
                    key={reminder.id}
                    className={`flex items-center gap-3.5 p-4 rounded-2xl border ${
                      isOverdue 
                        ? 'bg-rose-50/50 border-rose-100' 
                        : 'bg-white border-slate-100 shadow-sm'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${isOverdue ? 'bg-rose-100/50 text-rose-600' : 'bg-amber-50 text-amber-500'}`}>
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <h4 className="text-xs font-extrabold text-slate-800 leading-tight truncate">{reminder.title}</h4>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                          isOverdue 
                            ? 'bg-rose-100 text-rose-600' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>{patient}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold truncate">{reminder.description}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>

    </div>
  );
}
