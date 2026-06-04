'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Plus, 
  Save, 
  Clock, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Loader2, 
  FileText, 
  Upload, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Calendar,
  Sparkles,
  ClipboardList
} from 'lucide-react';
import { MedicalOrderType, MedicalOrderStatus, MedicalOrder } from '@/domain/models';

const orderTypeMap: Record<MedicalOrderType, string> = {
  SPECIALIST_APPOINTMENT: 'Cita Especialista',
  LAB_EXAM: 'Examen de Laboratorio',
  IMAGING: 'Imagenología / Rx',
  PROCEDURE: 'Procedimiento / Cirugía',
  MEDICATION: 'Fórmula de Medicamento',
  THERAPY: 'Terapia / Rehabilitación',
  OTHER: 'Otro Procedimiento'
};

const statusLabelMap: Record<MedicalOrderStatus, string> = {
  PENDING_AUTHORIZATION: 'Pendiente Autorización',
  AUTHORIZED: 'Autorizada',
  DENIED: 'Negada',
  APPOINTMENT_PENDING: 'Pendiente Cita',
  APPOINTMENT_SCHEDULED: 'Cita Agendada',
  COMPLETED: 'Atendida / Cerrada',
  CANCELLED: 'Cancelada'
};

export default function MedicalOrdersPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    medicalOrders, 
    documents,
    addMedicalOrder, 
    updateMedicalOrder, 
    deleteMedicalOrder,
    createAppointmentFromOrder,
    uploadDocument,
    isLoading,
    driveSyncEnabled,
    driveStatus,
    driveError
  } = useApp();

  const [filter, setFilter] = useState<MedicalOrderStatus | 'ALL'>('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAuthFormId, setShowAuthFormId] = useState<string | null>(null);
  const [showScheduleFormId, setShowScheduleFormId] = useState<string | null>(null);
  
  // File upload state
  const [uploadingForOrderId, setUploadingForOrderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // New order form state
  const [title, setTitle] = useState('');
  const [orderType, setOrderType] = useState<MedicalOrderType>('SPECIALIST_APPOINTMENT');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().split('T')[0]);
  const [expiresAt, setExpiresAt] = useState('');
  const [requiresAuthorization, setRequiresAuthorization] = useState(true);
  const [epsOrProvider, setEpsOrProvider] = useState('');
  const [ipsOrClinic, setIpsOrClinic] = useState('');
  const [notes, setNotes] = useState('');

  // Authorization details form state
  const [authNumber, setAuthNumber] = useState('');
  const [authDate, setAuthDate] = useState(new Date().toISOString().split('T')[0]);
  const [authExpiresAt, setAuthExpiresAt] = useState('');
  const [authStatus, setAuthStatus] = useState<'AUTHORIZED' | 'DENIED'>('AUTHORIZED');

  // Appointment schedule form state
  const [apptDoctor, setApptDoctor] = useState('');
  const [apptSpecialty, setApptSpecialty] = useState('');
  const [apptScheduledAt, setApptScheduledAt] = useState('');
  const [apptLocation, setApptLocation] = useState('');
  const [apptReason, setApptReason] = useState('');
  const [apptNotes, setApptNotes] = useState('');

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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !issuedAt) return;

    addMedicalOrder({
      memberId: id,
      title,
      orderType,
      doctorName: doctorName || null,
      specialty: specialty || null,
      issuedAt,
      expiresAt: expiresAt || null,
      requiresAuthorization,
      epsOrProvider: epsOrProvider || null,
      ipsOrClinic: ipsOrClinic || null,
      notes: notes || null,
      status: requiresAuthorization ? 'PENDING_AUTHORIZATION' : 'AUTHORIZED'
    });

    // Reset form
    setTitle('');
    setOrderType('SPECIALIST_APPOINTMENT');
    setDoctorName('');
    setSpecialty('');
    setIssuedAt(new Date().toISOString().split('T')[0]);
    setExpiresAt('');
    setRequiresAuthorization(true);
    setEpsOrProvider('');
    setIpsOrClinic('');
    setNotes('');
    setShowAddForm(false);
  };

  const handleAuthorizationSubmit = (order: MedicalOrder) => {
    if (authStatus === 'AUTHORIZED') {
      updateMedicalOrder(order.id, {
        status: 'AUTHORIZED',
        authorizationStatus: 'AUTHORIZED',
        authorizationNumber: authNumber || null,
        authorizationDate: authDate || null,
        authorizationExpiresAt: authExpiresAt || null,
        epsOrProvider: epsOrProvider || order.epsOrProvider || null,
        ipsOrClinic: ipsOrClinic || order.ipsOrClinic || null
      });
    } else {
      updateMedicalOrder(order.id, {
        status: 'DENIED',
        authorizationStatus: 'DENIED'
      });
    }
    
    // Reset authorization state
    setAuthNumber('');
    setAuthDate(new Date().toISOString().split('T')[0]);
    setAuthExpiresAt('');
    setShowAuthFormId(null);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showScheduleFormId || !apptScheduledAt || !apptReason) return;

    createAppointmentFromOrder(showScheduleFormId, {
      memberId: id,
      doctorName: apptDoctor,
      specialty: apptSpecialty,
      scheduledAt: apptScheduledAt,
      location: apptLocation || null,
      reason: apptReason,
      notes: apptNotes || null,
      status: 'SCHEDULED'
    });

    // Reset schedule state
    setApptDoctor('');
    setApptSpecialty('');
    setApptScheduledAt('');
    setApptLocation('');
    setApptReason('');
    setApptNotes('');
    setShowScheduleFormId(null);
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadingForOrderId) return;

    setIsUploading(true);

    try {
      const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
      const finalFileName = `Orden_${title.replace(/\s+/g, '_')}_${Date.now()}${ext}`;

      const docId = await uploadDocument(id, {
        fileName: finalFileName,
        fileType: 'MEDICAL_ORDER',
        description: `Documento adjunto a orden: ${title}`
      }, selectedFile);

      // Link order to document
      updateMedicalOrder(uploadingForOrderId, {
        documentId: docId
      });

      setSelectedFile(null);
      setUploadingForOrderId(null);
    } catch (err) {
      console.error('Error al subir documento de orden:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const filteredOrders = medicalOrders.filter(o => {
    const isMember = o.memberId === id;
    const isNotDeleted = !o.deletedAt;
    if (!isNotDeleted || !isMember) return false;
    if (filter === 'ALL') return true;
    return o.status === filter;
  }).sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  const getStatusBadge = (status: MedicalOrderStatus) => {
    switch (status) {
      case 'PENDING_AUTHORIZATION':
        return <span className="text-[10px] font-extrabold bg-amber-50 text-amber-600 px-2.5 py-0.5 rounded-full border border-amber-600/10 shrink-0">Pendiente EPS</span>;
      case 'AUTHORIZED':
        return <span className="text-[10px] font-extrabold bg-teal-50 text-teal-600 px-2.5 py-0.5 rounded-full border border-teal-600/10 shrink-0">Autorizada</span>;
      case 'DENIED':
        return <span className="text-[10px] font-extrabold bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full border border-rose-600/10 shrink-0">Negada</span>;
      case 'APPOINTMENT_PENDING':
        return <span className="text-[10px] font-extrabold bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-600/10 shrink-0">Pendiente Agendar</span>;
      case 'APPOINTMENT_SCHEDULED':
        return <span className="text-[10px] font-extrabold bg-purple-50 text-purple-600 px-2.5 py-0.5 rounded-full border border-purple-600/10 shrink-0">Cita Agendada</span>;
      case 'COMPLETED':
        return <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-600/10 shrink-0">Cerrada / Atendida</span>;
      case 'CANCELLED':
        return <span className="text-[10px] font-extrabold bg-slate-50 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200 shrink-0">Cancelada</span>;
      default:
        return null;
    }
  };

  const getSheetsSyncBadge = (order: any) => {
    const status = order.syncStatus || 'PENDING_SYNC';
    if (status === 'SYNCED') {
      return (
        <span className="text-[9px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full border border-teal-600/10 uppercase">
          ✓ Sheets
        </span>
      );
    }
    return (
      <span className="text-[9px] font-extrabold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-600/10 uppercase animate-pulse">
        Pendiente Sheets
      </span>
    );
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
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          <span>Nueva Orden</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Órdenes y Autorizaciones de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Administra órdenes médicas, trámites de EPS y agendamiento de citas.</p>
      </section>

      {/* Filters row */}
      <section className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
        {[
          { label: 'Todas', value: 'ALL' },
          { label: 'Pendientes EPS', value: 'PENDING_AUTHORIZATION' },
          { label: 'Autorizadas', value: 'AUTHORIZED' },
          { label: 'Citas Agendadas', value: 'APPOINTMENT_SCHEDULED' },
          { label: 'Cerradas', value: 'COMPLETED' }
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value as any)}
            className={`px-4 h-9.5 text-xs font-bold rounded-full transition-all duration-200 shrink-0 ${
              filter === item.value 
                ? 'bg-slate-800 text-white' 
                : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      {/* Orders List */}
      <section className="flex flex-col gap-3.5">
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No hay órdenes registradas</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Registra tus órdenes de citas con especialistas, laboratorios o terapias y lleva control del estado de tu trámite.
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const document = documents.find(d => d.id === order.documentId);
            return (
              <div 
                key={order.id}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 leading-tight mb-0.5">{order.title}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-bold">{orderTypeMap[order.orderType]}</span>
                      <span className="text-slate-300 text-[10px]">·</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Emitida: {new Date(order.issuedAt).toLocaleDateString('es-CO')}</span>
                      <span className="text-slate-300 text-[10px]">·</span>
                      {getSheetsSyncBadge(order)}
                    </div>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                <hr className="border-slate-50" />

                {/* Details list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500 font-semibold">
                  {order.doctorName && (
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Médico Emisor</span>
                      <span>{order.doctorName} {order.specialty && `(${order.specialty})`}</span>
                    </div>
                  )}
                  {order.epsOrProvider && (
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">EPS / Aseguradora</span>
                      <span>{order.epsOrProvider}</span>
                    </div>
                  )}
                  {order.ipsOrClinic && (
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">IPS / Centro Clínico</span>
                      <span>{order.ipsOrClinic}</span>
                    </div>
                  )}
                  {order.expiresAt && (
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Fecha Vence</span>
                      <span className={new Date(order.expiresAt).getTime() < Date.now() ? 'text-rose-600 font-extrabold' : ''}>
                        {new Date(order.expiresAt).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  )}
                </div>

                {order.notes && (
                  <div className="p-3 bg-slate-50/50 rounded-xl">
                    <span className="text-[9px] text-slate-400 font-extrabold block leading-none mb-1 uppercase">Indicaciones / Observaciones</span>
                    <p className="text-xs text-slate-500 italic">{order.notes}</p>
                  </div>
                )}

                {/* Authorization Status Panel */}
                {order.requiresAuthorization && (
                  <div className="bg-slate-50/50 border border-slate-100/50 p-4.5 rounded-2xl flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      {order.authorizationStatus === 'AUTHORIZED' ? (
                        <ShieldCheck className="h-4.5 w-4.5 text-teal-600 shrink-0" />
                      ) : order.authorizationStatus === 'DENIED' ? (
                        <ShieldAlert className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                      ) : (
                        <Shield className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                      )}
                      <h5 className="text-xs font-extrabold text-slate-800">Estado de Trámite de Autorización</h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[11px] font-semibold text-slate-500">
                      <div>
                        <span className="text-[9px] text-slate-400 font-extrabold block uppercase leading-none mb-1">Número de Autorización</span>
                        <span>{order.authorizationNumber || 'Pendiente de registrar'}</span>
                      </div>
                      {order.authorizationDate && (
                        <div>
                          <span className="text-[9px] text-slate-400 font-extrabold block uppercase leading-none mb-1">Fecha de Aprobación</span>
                          <span>{new Date(order.authorizationDate).toLocaleDateString('es-CO')}</span>
                        </div>
                      )}
                    </div>

                    {order.status === 'PENDING_AUTHORIZATION' && (
                      <div className="flex gap-2 justify-end mt-2">
                        <button
                          onClick={() => {
                            setAuthStatus('AUTHORIZED');
                            setShowAuthFormId(order.id);
                          }}
                          className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-600/10 hover:bg-teal-100 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Registrar Aprobación
                        </button>
                        <button
                          onClick={() => {
                            setAuthStatus('DENIED');
                            setShowAuthFormId(order.id);
                          }}
                          className="px-3.5 h-8.5 text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-600/10 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Negar Trámite
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Document Attached Panel */}
                <div className="bg-slate-50/30 p-4.5 rounded-2xl border border-slate-100/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h6 className="text-xs font-extrabold text-slate-800">Documento Adjunto (PDF / Foto)</h6>
                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                        {document ? `${document.fileName}` : 'No hay documento adjuntado a esta orden.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2.5 shrink-0 justify-end">
                    {document?.driveUrl ? (
                      <a 
                        href={document.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="h-9 px-3.5 hover:bg-teal-50 text-slate-500 hover:text-teal-600 border border-slate-200/60 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1"
                      >
                        <span>Ver Documento</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <button
                        onClick={() => setUploadingForOrderId(order.id)}
                        className="h-9 px-3.5 bg-teal-50 hover:bg-teal-100 text-teal-700 hover:text-teal-800 border border-teal-600/10 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Adjuntar Soporte</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Scheduling Actions */}
                {(order.status === 'AUTHORIZED' || order.status === 'APPOINTMENT_PENDING') && (
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      onClick={() => {
                        setApptDoctor(order.doctorName || '');
                        setApptSpecialty(order.specialty || '');
                        setApptReason(`Consulta/Procedimiento de orden: ${order.title}`);
                        setShowScheduleFormId(order.id);
                      }}
                      className="px-4 h-9.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 active:translate-y-0.5 transition-all duration-200"
                    >
                      <Calendar className="h-4 w-4" />
                      <span>Agendar Cita Médica</span>
                    </button>
                  </div>
                )}

                {order.status === 'APPOINTMENT_SCHEDULED' && (
                  <div className="flex items-center justify-between mt-1 text-[11px] font-semibold bg-purple-50/40 p-3.5 rounded-xl border border-purple-100">
                    <span className="text-purple-700 font-extrabold">✓ Cita agendada para esta orden</span>
                    <button
                      onClick={() => updateMedicalOrder(order.id, { status: 'COMPLETED' })}
                      className="px-3.5 h-7.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[10px] font-extrabold rounded-lg shadow-sm"
                    >
                      Cerrar Orden
                    </button>
                  </div>
                )}

                {order.status === 'COMPLETED' && (
                  <div className="flex items-center text-[11px] font-semibold bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-100 text-emerald-700 font-extrabold">
                    ✓ Orden completada y cerrada.
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Add Order Modal Backdrop */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Registrar Nueva Orden Médica</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Título de la Orden / Descripción</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Ecografía de Abdomen Total o Consulta Cardiología"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Order Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Tipo de Requerimiento</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as MedicalOrderType)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="SPECIALIST_APPOINTMENT">Cita con Especialista</option>
                  <option value="LAB_EXAM">Exámenes de Laboratorio</option>
                  <option value="IMAGING">Imagenología (Rx, Tac, Rmn, Eco)</option>
                  <option value="PROCEDURE">Procedimiento Ambulatorio o Cirugía</option>
                  <option value="THERAPY">Terapia (Física, Ocupacional, etc.)</option>
                  <option value="MEDICATION">Fórmula de Medicamento Recetado</option>
                  <option value="OTHER">Otro requerimiento clínico</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* Doctor */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Médico Emisor</label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Ej. Dra. Julia Pérez"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>

                {/* Specialty */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Especialidad</label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="Ej. Ginecología"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* Date */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha Emisión</label>
                  <input
                    type="date"
                    required
                    value={issuedAt}
                    onChange={(e) => setIssuedAt(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                {/* Expires */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Vencimiento (Opcional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Requires Authorization Checkbox */}
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
                <input
                  type="checkbox"
                  id="requiresAuthorization"
                  checked={requiresAuthorization}
                  onChange={(e) => setRequiresAuthorization(e.target.checked)}
                  className="h-4.5 w-4.5 text-teal-600 border-slate-300 focus:ring-teal-500 rounded cursor-pointer"
                />
                <label htmlFor="requiresAuthorization" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Esta orden requiere trámite de autorización en EPS
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* EPS */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">EPS / Aseguradora</label>
                  <input
                    type="text"
                    value={epsOrProvider}
                    onChange={(e) => setEpsOrProvider(e.target.value)}
                    placeholder="Ej. Sura, Sanitas"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>

                {/* Clinic */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">IPS sugerida / Clínica</label>
                  <input
                    type="text"
                    value={ipsOrClinic}
                    onChange={(e) => setIpsOrClinic(e.target.value)}
                    placeholder="Ej. Clínica Las Américas"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Indicaciones clínicas / Observaciones</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Llevar orden física original, ayuno de 8h, etc."
                  className="h-16 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>Guardar Orden</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authorization form modal */}
      {showAuthFormId && (() => {
        const order = medicalOrders.find(o => o.id === showAuthFormId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <h3 className="font-extrabold text-base text-slate-800 mb-4">
                {authStatus === 'AUTHORIZED' ? 'Registrar Aprobación de Autorización' : 'Registrar Negación de Autorización'}
              </h3>
              
              <div className="flex flex-col gap-4">
                {authStatus === 'AUTHORIZED' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-slate-700 uppercase">Número de Autorización</label>
                      <input
                        type="text"
                        required
                        value={authNumber}
                        onChange={(e) => setAuthNumber(e.target.value)}
                        placeholder="Ej. AUT-894729"
                        className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha Aprobación</label>
                        <input
                          type="date"
                          required
                          value={authDate}
                          onChange={(e) => setAuthDate(e.target.value)}
                          className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-extrabold text-slate-700 uppercase">Vence Autorización</label>
                        <input
                          type="date"
                          value={authExpiresAt}
                          onChange={(e) => setAuthExpiresAt(e.target.value)}
                          className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-rose-50 text-rose-700 rounded-xl flex gap-3 text-xs leading-relaxed">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                    <div>
                      <p className="font-extrabold">Trámite Negado</p>
                      <p className="mt-0.5">La orden se marcará como negada. Podrás reiniciarla o editarla en el futuro si obtienes aprobación tras recurso.</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAuthFormId(null)}
                    className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleAuthorizationSubmit(order)}
                    className={`flex-1 h-11 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors ${
                      authStatus === 'AUTHORIZED'
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/10'
                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10'
                    }`}
                  >
                    <Save className="h-4 w-4" />
                    <span>Guardar Registro</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Schedule Appointment Form Modal */}
      {showScheduleFormId && (() => {
        const order = medicalOrders.find(o => o.id === showScheduleFormId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <h3 className="font-extrabold text-base text-slate-800 mb-4">Agendar Cita desde Orden</h3>
              
              <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre del Médico</label>
                  <input
                    type="text"
                    required
                    value={apptDoctor}
                    onChange={(e) => setApptDoctor(e.target.value)}
                    placeholder="Ej. Dr. Andrés Restrepo"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Especialidad</label>
                  <input
                    type="text"
                    required
                    value={apptSpecialty}
                    onChange={(e) => setApptSpecialty(e.target.value)}
                    placeholder="Ej. Cardiología"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha y Hora Agendada</label>
                  <input
                    type="datetime-local"
                    required
                    value={apptScheduledAt}
                    onChange={(e) => setApptScheduledAt(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Lugar de Consulta</label>
                  <input
                    type="text"
                    value={apptLocation}
                    onChange={(e) => setApptLocation(e.target.value)}
                    placeholder="Ej. Clínica Las Américas - Piso 3"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Motivo / Síntomas</label>
                  <input
                    type="text"
                    required
                    value={apptReason}
                    onChange={(e) => setApptReason(e.target.value)}
                    placeholder="Ej. Consulta por cefalea o examen de ecografía"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Notas adicionales / Preparación</label>
                  <textarea
                    value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)}
                    placeholder="Llevar orden física original, ayuno de 8h..."
                    className="h-16 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
                  />
                </div>

                <div className="flex gap-2.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowScheduleFormId(null)}
                    className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-colors"
                  >
                    <Calendar className="h-4 w-4" />
                    <span>Programar Cita</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Add Document upload modal backdrop */}
      {uploadingForOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Adjuntar Soporte de Orden</h3>
            
            <form onSubmit={handleDocumentUpload} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Seleccionar Documento (PDF, Imagen)</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] || null);
                  }}
                  className="w-full text-xs font-semibold text-slate-800 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer border border-dashed border-slate-200 p-2 rounded-xl"
                />
              </div>

              {isUploading && (
                <div className="flex items-center gap-2 text-xs font-bold text-teal-600 p-2.5 bg-teal-50 rounded-xl">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Subiendo y guardando documento en Google Drive...</span>
                </div>
              )}

              <div className="flex gap-2.5 mt-2.5">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadingForOrderId(null);
                  }}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Subir Soporte</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
