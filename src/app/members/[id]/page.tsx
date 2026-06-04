'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Edit3, 
  ShieldAlert, 
  Heart, 
  Calendar, 
  Activity, 
  Plus, 
  ChevronRight, 
  FileText, 
  Beaker, 
  Clock,
  HeartPulse
} from 'lucide-react';
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

export default function MemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    appointments, 
    vaccines, 
    isLoading,
    inactivateMember,
    reactivateMember,
    deleteMember,
    updateMember,
    sharedReports,
    generateAndShareMemberReport,
    revokeMemberReportShare,
    documents,
    shareDocumentWithMember,
    revokeDocumentShare
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

  const member = members.find(m => m.id === id);

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center select-none">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h3 className="font-extrabold text-slate-800 text-lg">Miembro no encontrado</h3>
        <Link href="/members" className="text-sm font-bold text-teal-600 hover:underline">
          Volver a la lista de familiares
        </Link>
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

  // Helper to format document type and number visually
  const formatDocument = (type: string, number: string) => {
    if (!type || !number) return '';
    const digitsOnly = /^\d+$/.test(number);
    const formatted = digitsOnly 
      ? new Intl.NumberFormat('es-CO').format(parseInt(number, 10))
      : number;
    return `${type} ${formatted}`;
  };

  const getMemberDocCount = (memberId: string) => {
    return documents.filter(d => d.memberId === memberId && !d.deletedAt).length;
  };

  const formatDocumentCount = (count: number) => {
    if (count === 1) return '1 documento';
    return `${count} documentos`;
  };

  const age = calculateAge(member.birthDate);

  // Stats for badges
  const nextAppt = appointments
    .filter(a => a.memberId === id && a.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  const pendingVaccines = vaccines
    .filter(v => v.memberId === id && v.status === 'SCHEDULED').length;

  const categories = [
    {
      title: 'Ficha Médica',
      description: 'Alergias, medicamentos y condiciones crónicas',
      href: `/members/${id}/health`,
      icon: Heart,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100/50',
      badge: null
    },
    {
      title: 'Citas Médicas',
      description: nextAppt 
        ? `Prox: ${nextAppt.doctorName} (${new Date(nextAppt.scheduledAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })})` 
        : 'Ver historial de citas y programar',
      href: `/members/${id}/appts`,
      icon: Calendar,
      color: 'bg-teal-50 text-teal-600 border-teal-100/50',
      badge: nextAppt ? 'Programada' : null,
      badgeColor: 'bg-teal-100 text-teal-700'
    },
    {
      title: 'Controles Periódicos',
      description: 'Chequeos físicos y preventivos de salud',
      href: `/members/${id}/checkups`,
      icon: HeartPulse,
      color: 'bg-orange-50 text-orange-600 border-orange-100/50',
      badge: null
    },
    {
      title: 'Vacunas',
      description: pendingVaccines > 0 
        ? `${pendingVaccines} dosis programadas` 
        : 'Cartilla de vacunación al día',
      href: `/members/${id}/vaccines`,
      icon: Plus,
      color: 'bg-blue-50 text-blue-600 border-blue-100/50',
      badge: pendingVaccines > 0 ? `${pendingVaccines}` : null,
      badgeColor: 'bg-red-500 text-white font-bold'
    },
    {
      title: 'Exámenes Clínicos',
      description: 'Análisis de laboratorio y reportes médicos',
      href: `/members/${id}/exams`,
      icon: Beaker,
      color: 'bg-purple-50 text-purple-600 border-purple-100/50',
      badge: null
    },
    {
      title: 'Documentos y Fórmulas',
      description: 'Archivo digital de recetas médicas en Drive',
      href: `/members/${id}/documents`,
      icon: FileText,
      color: 'bg-cyan-50 text-cyan-600 border-cyan-100/50',
      badge: null
    },
    {
      title: 'Historial Completo',
      description: 'Línea de tiempo cronológica de salud',
      href: `/members/${id}/history`,
      icon: Clock,
      color: 'bg-slate-50 text-slate-600 border-slate-200/60',
      badge: null
    }
  ];

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Navigation Header */}
      <section className="flex justify-between items-center">
        <Link 
          href="/members" 
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver</span>
        </Link>
        <Link
          href={`/members/${id}/edit`}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all duration-200"
        >
          <Edit3 className="h-4 w-4" />
          <span>Editar perfil</span>
        </Link>
      </section>

      {/* Member Profile Card */}
      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-5 items-center md:items-start">
        {/* Avatar */}
        <div className="h-16 w-16 rounded-full bg-teal-600/10 text-teal-700 border border-teal-600/20 flex items-center justify-center font-black text-xl shrink-0">
          {member.fullName.substring(0, 2).toUpperCase()}
        </div>

        {/* Text details */}
        <div className="flex-1 text-center md:text-left min-w-0">
          <div className="flex items-center justify-center md:justify-start gap-2.5 mb-1.5 flex-wrap">
            <h2 className="text-2xl font-black text-slate-800 leading-tight">{member.fullName}</h2>
            {(member.status || 'ACTIVE') === 'INACTIVE' ? (
              <span className="text-[9px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full uppercase leading-none">
                Inactivo
              </span>
            ) : (
              <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full uppercase leading-none">
                Activo
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 text-xs font-semibold text-slate-400">
            <span>{relationshipMap[member.relationship]}</span>
            <span>·</span>
            <span>{age} {age === 1 ? 'año' : 'años'} ({member.birthDate})</span>
            {member.bloodType && member.bloodType !== 'UNKNOWN' && (
              <>
                <span>·</span>
                <span className="text-teal-600 font-extrabold uppercase">RH {bloodTypeMap[member.bloodType]}</span>
              </>
            )}
            {member.documentType && member.documentNumber && (
              <>
                <span>·</span>
                <span className="text-blue-600 font-extrabold uppercase">
                  {formatDocument(member.documentType, member.documentNumber)}
                </span>
              </>
            )}
            <span>·</span>
            <span className="text-slate-500 font-extrabold">
              {formatDocumentCount(getMemberDocCount(member.id))}
            </span>
          </div>
        </div>
      </section>

      {/* Notes / warning banner */}
      {member.notes && (
        <section className="flex gap-3.5 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
          <ShieldAlert className="h-5.5 w-5.5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-extrabold text-rose-800 leading-none mb-1">Nota médica relevante</h4>
            <p className="text-xs text-rose-700/80 leading-relaxed font-semibold">{member.notes}</p>
          </div>
        </section>
      )}

      {/* Categories header */}
      <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1 mt-4">Expedientes de Salud</h3>

      {/* Categories listing */}
      <section className="flex flex-col gap-3">
        {categories.map((cat, index) => {
          const CatIcon = cat.icon;
          return (
            <Link
              key={index}
              href={cat.href}
              className="flex items-center gap-4 bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 group"
            >
              {/* Category Icon */}
              <div className={`p-3 rounded-xl border ${cat.color} shrink-0`}>
                <CatIcon className="h-5 w-5" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-extrabold text-slate-800 mb-0.5 leading-none">{cat.title}</h4>
                <p className="text-[10px] text-slate-400 font-semibold truncate leading-tight">{cat.description}</p>
              </div>

              {/* Optional badge */}
              {cat.badge && (
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${cat.badgeColor || 'bg-slate-100 text-slate-600'}`}>
                  {cat.badge}
                </span>
              )}

              {/* Arrow */}
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-teal-600 transition-colors" />
            </Link>
          );
        })}
      </section>

      {/* Portal de Acceso Familiar */}
      {member.email && (
        <>
          <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1 mt-4">Portal de Acceso Familiar</h3>
          <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 mb-0.5">Estado del acceso</h4>
                <p className="text-[10px] text-slate-400 font-semibold">{member.email}</p>
              </div>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase leading-none ${
                member.permissionStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                member.permissionStatus === 'INVITED' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
                member.permissionStatus === 'REVOKED' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {member.permissionStatus === 'ACTIVE' ? 'Activo' :
                 member.permissionStatus === 'INVITED' ? 'Invitado' :
                 member.permissionStatus === 'REVOKED' ? 'Revocado' : 'Sin invitar'}
              </span>
            </div>

            <div className="flex gap-2">
              {member.permissionStatus !== 'ACTIVE' && member.permissionStatus !== 'INVITED' ? (
                <button
                  onClick={() => {
                    updateMember(member.id, { 
                      permissionStatus: 'INVITED',
                      canAccessPortal: true 
                    });
                    alert(`Invitación enviada al correo ${member.email}. En esta fase simulada, puedes simular el rol asignándolo en Configuración.`);
                  }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors text-center"
                >
                  Invitar / Habilitar Acceso
                </button>
              ) : (
                <button
                  onClick={() => {
                    updateMember(member.id, { 
                      permissionStatus: 'REVOKED',
                      canAccessPortal: false 
                    });
                    alert(`Acceso revocado para el miembro ${member.fullName}.`);
                  }}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors text-center"
                >
                  Revocar Acceso
                </button>
              )}

              {member.permissionStatus === 'INVITED' && (
                <button
                  onClick={() => {
                    updateMember(member.id, { permissionStatus: 'ACTIVE' });
                    alert(`Simulación: El miembro ha aceptado la invitación. Estado actualizado a Activo.`);
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors text-center animate-pulse"
                >
                  Aceptar Invitación (Simulación)
                </button>
              )}
            </div>

            {/* Granular Permissions Summary */}
            {member.canAccessPortal && member.permissions && (
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex flex-col gap-2 font-semibold text-[10px] text-slate-500">
                <span className="font-bold text-slate-600">Permisos granulares asignados:</span>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] mt-1 list-none leading-relaxed">
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canManageOwnProfile ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Gestionar perfil propio: {member.permissions.canManageOwnProfile ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canManageOwnAppointments ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Gestionar citas propias: {member.permissions.canManageOwnAppointments ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canManageOwnDocuments ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Gestionar documentos propios: {member.permissions.canManageOwnDocuments ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canViewOwnHistory ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Ver historial propio: {member.permissions.canViewOwnHistory ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canUploadDocuments ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Cargar documentos propios: {member.permissions.canUploadDocuments ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canExportOwnData ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Exportar datos propios: {member.permissions.canExportOwnData ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canViewFamilyData ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Ver datos familiares: {member.permissions.canViewFamilyData ? 'Sí' : 'No'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${member.permissions.canManageFamilyData ? 'bg-teal-500' : 'bg-slate-300'}`} />
                    <span>Gestionar datos familiares: {member.permissions.canManageFamilyData ? 'Sí' : 'No'}</span>
                  </li>
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {/* Compartición segura Google-native */}
      <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1 mt-4">Compartición segura</h3>
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        {!member.email ? (
          <div className="bg-amber-50 p-4 border border-amber-100 rounded-2xl flex flex-col gap-1">
            <h4 className="text-xs font-extrabold text-amber-800">Compartición inhabilitada</h4>
            <p className="text-[10px] text-amber-700 leading-relaxed font-semibold">
              Agrega un correo al miembro para habilitar la compartición segura.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-extrabold text-slate-700">Canal de seguridad habilitado</h4>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                Correo destino: <strong className="text-slate-600">{member.email}</strong>
              </p>
              <p className="text-[9px] text-teal-600 font-bold mt-1 leading-normal">
                ℹ Solo se compartirá información de este miembro. No se comparte la base familiar completa por seguridad.
              </p>
            </div>

            <button
              onClick={async () => {
                try {
                  await generateAndShareMemberReport(member.id, member.email!);
                } catch (err: any) {
                  alert(`Error: ${err.message}`);
                }
              }}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors text-center"
            >
              Crear y compartir Reporte Clínico (Sheets)
            </button>

            {/* List of reports */}
            {sharedReports.filter(r => r.memberId === member.id).length > 0 && (
              <div className="flex flex-col gap-2.5 mt-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide px-1">Reportes individuales compartidos</span>
                <div className="flex flex-col gap-2">
                  {sharedReports
                    .filter(r => r.memberId === member.id)
                    .map((rep) => (
                      <div key={rep.id} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-extrabold text-slate-800 truncate">Reporte {rep.memberName}</span>
                          <span className="text-[9px] text-slate-400 font-bold">
                            Compartido: {new Date(rep.sharedAt).toLocaleDateString('es-CO')}
                          </span>
                          <span className={`inline-block w-fit text-[8px] font-black px-1.5 py-0.5 rounded uppercase mt-1 leading-none ${
                            rep.shareStatus === 'SHARED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {rep.shareStatus === 'SHARED' ? 'Compartido' : 'Acceso Revocado'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {rep.shareStatus === 'SHARED' && (
                            <>
                              <a
                                href={rep.spreadsheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-white border border-slate-200 text-slate-600 hover:text-teal-600 p-2 rounded-xl text-[9px] font-black hover:bg-teal-50 transition-colors"
                              >
                                Abrir
                              </a>
                              <button
                                onClick={async () => {
                                  try {
                                    await revokeMemberReportShare(rep.id);
                                  } catch (err: any) {
                                    alert(`Error al revocar: ${err.message}`);
                                  }
                                }}
                                className="bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 p-2 rounded-xl text-[9px] font-black transition-colors"
                              >
                                Revocar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* List of shared documents */}
            {documents.filter(d => d.memberId === member.id && d.shareStatus === 'SHARED').length > 0 && (
              <div className="flex flex-col gap-2.5 mt-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide px-1">Documentos compartidos</span>
                <div className="flex flex-col gap-2">
                  {documents
                    .filter(d => d.memberId === member.id && d.shareStatus === 'SHARED')
                    .map((doc) => (
                      <div key={doc.id} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-extrabold text-slate-800 truncate">{doc.fileName}</span>
                          <span className="text-[9px] text-slate-400 font-semibold truncate">
                            Compartido con: {doc.sharedWithEmail}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await revokeDocumentShare(doc.id);
                            } catch (err: any) {
                              alert(`Error al revocar: ${err.message}`);
                            }
                          }}
                          className="bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 p-2 rounded-xl text-[9px] font-black shrink-0 transition-colors"
                        >
                          Revocar
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Acciones de Administración */}
      <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase px-1 mt-4">Acciones de Administración</h3>
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-2.5">
          {(member.status || 'ACTIVE') !== 'INACTIVE' ? (
            <button
              onClick={() => {
                if (window.confirm(`¿Estás seguro de que deseas marcar como INACTIVO a ${member.fullName}? Su historial clínico se conservará, pero ya no aparecerá en las pantallas principales.`)) {
                  inactivateMember(member.id);
                  alert(`${member.fullName} ha sido marcado como inactivo.`);
                }
              }}
              className="flex-1 min-w-[140px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl shadow-sm transition-colors text-center"
            >
              Inactivar Familiar
            </button>
          ) : (
            <button
              onClick={() => {
                reactivateMember(member.id);
                alert(`${member.fullName} ha sido reactivado con éxito.`);
              }}
              className="flex-1 min-w-[140px] py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs rounded-xl border border-emerald-100 shadow-sm transition-colors text-center"
            >
              Reactivar Familiar
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${member.fullName}? Esta acción no se puede deshacer.`)) {
                const success = deleteMember(member.id);
                if (success) {
                  alert(`${member.fullName} ha sido eliminado permanentemente.`);
                  router.push('/members');
                } else {
                  alert(`No se puede eliminar a ${member.fullName} porque tiene historial médico asociado (citas, vacunas, documentos, exámenes, etc.). Por favor, inactívalo en su lugar.`);
                }
              }
            }}
            className="flex-1 min-w-[140px] py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs rounded-xl border border-rose-100 shadow-sm transition-colors text-center"
          >
            Eliminar Familiar
          </button>
        </div>
      </section>

    </div>
  );
}
