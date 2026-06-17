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
  ShieldAlert,
  ClipboardList,
  Pill,
  AlertTriangle,
  Mail
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { 
    user, 
    members, 
    appointments, 
    reminders, 
    tasks,
    documents,
    medicalOrders,
    medicationPrescriptions,
    medicationDoseReminders,
    appointmentCandidates,
    pendingSyncCount,
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

  // Calculate dynamic alerts for dashboard
  const dashboardAlerts: {
    id: string;
    title: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
    memberName: string;
    href: string;
    iconType: 'order' | 'medication' | 'general';
  }[] = [];

  // 1. Pending Authorizations (EPS)
  medicalOrders
    .filter(o => !o.deletedAt && o.status === 'PENDING_AUTHORIZATION')
    .forEach(o => {
      const memberName = members.find(m => m.id === o.memberId)?.fullName.split(' ')[0] || 'Familiar';
      dashboardAlerts.push({
        id: `auth-${o.id}`,
        title: 'Trámite EPS Pendiente',
        description: `La orden "${o.title}" requiere autorización de tu EPS.`,
        severity: 'warning',
        memberName,
        href: `/members/${o.memberId}/orders`,
        iconType: 'order'
      });
    });

  // 2. Expiring Authorizations
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  medicalOrders
    .filter(o => {
      if (o.deletedAt || o.status !== 'AUTHORIZED' || !o.requiresAuthorization || !o.authorizationExpiresAt) return false;
      const diff = new Date(o.authorizationExpiresAt).getTime() - Date.now();
      return diff >= 0 && diff <= sevenDays;
    })
    .forEach(o => {
      const memberName = members.find(m => m.id === o.memberId)?.fullName.split(' ')[0] || 'Familiar';
      dashboardAlerts.push({
        id: `exp-auth-${o.id}`,
        title: 'Autorización por Vencer',
        description: `Vence el ${new Date(o.authorizationExpiresAt!).toLocaleDateString('es-CO')}: "${o.title}".`,
        severity: 'error',
        memberName,
        href: `/members/${o.memberId}/orders`,
        iconType: 'order'
      });
    });

  // 3. Authorized orders without appointments
  medicalOrders
    .filter(o => !o.deletedAt && o.status === 'AUTHORIZED' && !o.relatedAppointmentId && o.orderType !== 'MEDICATION')
    .forEach(o => {
      const memberName = members.find(m => m.id === o.memberId)?.fullName.split(' ')[0] || 'Familiar';
      dashboardAlerts.push({
        id: `no-appt-${o.id}`,
        title: 'Agendar Cita Pendiente',
        description: `Orden autorizada lista para programar: "${o.title}".`,
        severity: 'info',
        memberName,
        href: `/members/${o.memberId}/orders`,
        iconType: 'order'
      });
    });

  // 4. Missed or pending-past medication doses
  const missedDoseCountByMember: Record<string, { memberId: string; count: number }> = {};
  medicationDoseReminders
    .filter(d => {
      if (d.deletedAt) return false;
      const isPast = new Date(d.scheduledAt).getTime() < Date.now();
      return d.status === 'MISSED' || (d.status === 'PENDING' && isPast);
    })
    .forEach(d => {
      if (!missedDoseCountByMember[d.memberId]) {
        missedDoseCountByMember[d.memberId] = { memberId: d.memberId, count: 0 };
      }
      missedDoseCountByMember[d.memberId].count++;
    });

  Object.values(missedDoseCountByMember).forEach(item => {
    const memberName = members.find(m => m.id === item.memberId)?.fullName.split(' ')[0] || 'Familiar';
    dashboardAlerts.push({
      id: `missed-med-${item.memberId}`,
      title: 'Tomas Vencidad',
      description: `Tienes ${item.count} toma(s) de medicamentos pendientes o no registradas hoy.`,
      severity: 'error',
      memberName,
      href: `/members/${item.memberId}/medications`,
      iconType: 'medication'
    });
  });

  // 5. Today's upcoming medication doses
  const upcomingDoseCountByMember: Record<string, { memberId: string; count: number }> = {};
  const todayDateStr = new Date().toISOString().split('T')[0];
  medicationDoseReminders
    .filter(d => {
      if (d.deletedAt || d.status !== 'PENDING') return false;
      const isFuture = new Date(d.scheduledAt).getTime() >= Date.now();
      return d.scheduledAt.startsWith(todayDateStr) && isFuture;
    })
    .forEach(d => {
      if (!upcomingDoseCountByMember[d.memberId]) {
        upcomingDoseCountByMember[d.memberId] = { memberId: d.memberId, count: 0 };
      }
      upcomingDoseCountByMember[d.memberId].count++;
    });

  Object.values(upcomingDoseCountByMember).forEach(item => {
    const memberName = members.find(m => m.id === item.memberId)?.fullName.split(' ')[0] || 'Familiar';
    dashboardAlerts.push({
      id: `upcoming-med-${item.memberId}`,
      title: 'Tomas Programadas',
      description: `Quedan ${item.count} toma(s) de medicamento pendientes de registrar hoy.`,
      severity: 'info',
      memberName,
      href: `/members/${item.memberId}/medications`,
      iconType: 'medication'
    });
  });

  // 6. Medications ending in ≤ 3 days
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  medicationPrescriptions
    .filter(p => {
      if (p.deletedAt || p.status !== 'ACTIVE' || !p.endDate) return false;
      const diff = new Date(p.endDate).getTime() - Date.now();
      return diff >= 0 && diff <= threeDays;
    })
    .forEach(p => {
      const memberName = members.find(m => m.id === p.memberId)?.fullName.split(' ')[0] || 'Familiar';
      dashboardAlerts.push({
        id: `ending-med-${p.id}`,
        title: 'Medicamento por Terminar',
        description: `El tratamiento de "${p.name}" finaliza en menos de 3 días.`,
        severity: 'warning',
        memberName,
        href: `/members/${p.memberId}/medications`,
        iconType: 'medication'
      });
    });

  // 7. General reminders (overdue)
  reminders
    .filter(r => r.status === 'OVERDUE')
    .forEach(r => {
      const memberName = members.find(m => m.id === r.memberId)?.fullName.split(' ')[0] || 'Familiar';
      dashboardAlerts.push({
        id: `rem-${r.id}`,
        title: r.title,
        description: r.description || 'Recordatorio general pendiente.',
        severity: 'warning',
        memberName,
        href: `/reminders`,
        iconType: 'general'
      });
    });

  // 8. Gmail candidates pending review
  const pendingCandidatesCount = appointmentCandidates.filter(c => c.status === 'PENDING_REVIEW').length;
  if (pendingCandidatesCount > 0) {
    dashboardAlerts.push({
      id: 'gmail-candidates-pending',
      title: 'Citas de Gmail por Revisar',
      description: `Tienes ${pendingCandidatesCount} cita(s) importada(s) de Gmail pendientes de confirmación.`,
      severity: 'warning',
      memberName: 'Gmail',
      href: '/appointments/import',
      iconType: 'general'
    });
  }

  // 9. Sync pending changes
  if (pendingSyncCount > 0) {
    dashboardAlerts.push({
      id: 'sync-pending-changes',
      title: 'Sincronización Pendiente',
      description: `Tienes ${pendingSyncCount} cambio(s) guardado(s) localmente pendiente(s) de sincronizar con Google.`,
      severity: 'info',
      memberName: 'Nube',
      href: '/settings',
      iconType: 'general'
    });
  }

  // Sort alerts: error first, then warning, then info
  const severityWeight = { error: 3, warning: 2, info: 1 };
  dashboardAlerts.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

  // Format date helper
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };


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

  // Filter only active members for dashboard
  const activeMembers = members.filter(m => (m.status || 'ACTIVE') === 'ACTIVE');

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
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase">Mi Familia ({activeMembers.length})</h3>
          <Link href="/members" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
            <span>Ver todos</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
 
        {/* Members row */}
        <div className="flex items-center gap-3.5 overflow-x-auto pb-2 scrollbar-none w-full">
          {activeMembers.length === 0 ? (
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
              {activeMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/members/${member.id}`}
                  className="flex flex-col items-center gap-2 bg-white p-4 rounded-2xl min-w-[110px] border border-slate-100 shadow-sm shadow-slate-100/40 hover:shadow-md transition-all duration-200 active:scale-95 shrink-0"
                >
                  <div className="h-12 w-12 rounded-full bg-teal-600/10 text-teal-700 border border-teal-600/20 flex items-center justify-center font-black text-sm shrink-0">
                    {member.fullName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center w-full min-w-0">
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[90px] mx-auto">{member.fullName.split(' ')[0]}</p>
                    <span className="text-[9px] text-slate-400 font-semibold">{member.relationship === 'SELF' ? 'Tú' : member.relationship === 'CHILD' ? 'Hijo/a' : 'Cónyuge'}</span>
                    {member.documentType && member.documentNumber && (
                      <p className="text-[9px] text-teal-600 font-extrabold mt-0.5 truncate max-w-[95px] mx-auto leading-none">
                        {formatDocument(member.documentType, member.documentNumber)}
                      </p>
                    )}
                    <p className="text-[8px] text-slate-400 font-bold mt-0.5 truncate max-w-[95px] mx-auto leading-none">
                      {formatDocumentCount(getMemberDocCount(member.id))}
                    </p>
                  </div>
                </Link>
              ))}
 
              {/* Add member shortcut */}
              <Link
                href="/members/new"
                className="flex flex-col items-center justify-center gap-2 bg-slate-100/50 hover:bg-slate-100 p-4 rounded-2xl min-w-[110px] min-h-[118px] border border-dashed border-slate-200 transition-all duration-200 active:scale-95 shrink-0"
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

        {/* ── Gmail Import Card ── */}
        {pendingCandidatesCount > 0 ? (
          <Link
            href="/appointments/import"
            className="relative flex items-center gap-4 bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-sm hover:shadow-md hover:bg-amber-100/60 transition-all duration-200 col-span-2 md:col-span-1"
          >
            {/* Pulse badge */}
            <div className="relative shrink-0">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                <Mail className="h-5 w-5" />
              </div>
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-black leading-none shadow">
                {pendingCandidatesCount > 9 ? '9+' : pendingCandidatesCount}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-extrabold text-amber-800 leading-tight">Citas para importar</h4>
              <span className="text-[10px] text-amber-600 font-semibold block truncate">
                {pendingCandidatesCount} pendiente{pendingCandidatesCount !== 1 ? 's' : ''} de Gmail
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
          </Link>
        ) : (
          <Link
            href="/appointments/import"
            className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="p-3 bg-violet-50 text-violet-600 rounded-xl">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 leading-tight">Importar citas</h4>
              <span className="text-[10px] text-slate-400 font-semibold">Escanear Gmail</span>
            </div>
          </Link>
        )}
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

        {/* Alertas y Alarmas */}
        <section className="flex flex-col gap-3">
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1">Alertas Activas</h3>
          <div className="flex flex-col gap-3">
            {dashboardAlerts.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-800">Sin alertas pendientes</p>
                <p className="text-[10px] text-slate-400">No hay alarmas vencidas, trámites ni tomas urgentes.</p>
              </div>
            ) : (
              dashboardAlerts.slice(0, 5).map((alert) => {
                const getAlertIcon = (iconType: string, severity: string) => {
                  const style = severity === 'error' ? 'bg-rose-50 text-rose-600' :
                                severity === 'warning' ? 'bg-amber-50 text-amber-600' :
                                'bg-teal-50 text-teal-600';
                  
                  switch (iconType) {
                    case 'order':
                      return (
                        <div className={`p-2.5 rounded-xl ${style}`}>
                          <ClipboardList className="h-5 w-5" />
                        </div>
                      );
                    case 'medication':
                      return (
                        <div className={`p-2.5 rounded-xl ${style}`}>
                          <Pill className="h-5 w-5" />
                        </div>
                      );
                    default:
                      return (
                        <div className={`p-2.5 rounded-xl ${style}`}>
                          <AlertCircle className="h-5 w-5" />
                        </div>
                      );
                  }
                };

                const severityStyle = alert.severity === 'error' ? 'bg-rose-50/50 border-rose-100 hover:bg-rose-50' :
                                      alert.severity === 'warning' ? 'bg-amber-50/40 border-amber-100 hover:bg-amber-50/70' :
                                      'bg-white border-slate-100 hover:bg-slate-50';

                return (
                  <Link 
                    key={alert.id}
                    href={alert.href}
                    className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all duration-200 shadow-sm ${severityStyle}`}
                  >
                    {getAlertIcon(alert.iconType, alert.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className="text-xs font-extrabold text-slate-800 leading-tight truncate">{alert.title}</h4>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                          alert.severity === 'error' ? 'bg-rose-100 text-rose-600' :
                          alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>{alert.memberName}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold leading-tight">{alert.description}</p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

      </div>

    </div>
  );
}
