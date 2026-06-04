'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Mail, 
  Search, 
  Check, 
  X, 
  AlertTriangle, 
  Loader2, 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Activity, 
  ArrowLeft, 
  Settings, 
  AlertCircle, 
  Filter,
  CheckCircle2,
  Edit2
} from 'lucide-react';
import Link from 'next/link';

export default function AppointmentsImportPage() {
  const router = useRouter();
  const { 
    user,
    isLoading,
    members,
    emailSources,
    appointmentCandidates,
    updateAppointmentCandidate,
    importAppointmentFromCandidate,
    scanGmailForAppointmentsAction,
    gmailStatus,
    gmailError,
    connectGmail
  } = useApp();

  const [rangeDays, setRangeDays] = useState(90);
  const [filterStatus, setFilterStatus] = useState<'PENDING_REVIEW' | 'IMPORTED' | 'IGNORED' | 'DUPLICATE'>('PENDING_REVIEW');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // States for inline candidate editing
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editPatientName, setEditPatientName] = useState('');
  const [editMemberId, setEditMemberId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDoctor, setEditDoctor] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editNotes, setEditNotes] = useState('');

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

  const activeSources = emailSources.filter(s => s.enabled);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const count = await scanGmailForAppointmentsAction(rangeDays);
      setScanResult(`Escaneo completado. Se encontraron ${count} nuevas citas pendientes de revisión.`);
    } catch (err: any) {
      console.error('Error during scan:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleStartEdit = (cand: any) => {
    setEditingCandidateId(cand.id);
    
    // Find matched member ID if name matches a member
    const matchedMember = members.find(
      m => m.fullName.toLowerCase() === (cand.detectedPatientName || '').toLowerCase() && m.status !== 'DELETED'
    );
    setEditMemberId(matchedMember ? matchedMember.id : '');
    setEditPatientName(cand.detectedPatientName || '');
    setEditDate(cand.detectedDate || '');
    setEditTime(cand.detectedTime || '');
    setEditDoctor(cand.detectedDoctor || '');
    setEditSpecialty(cand.detectedSpecialty || 'Medicina General');
    setEditLocation(cand.detectedLocation || '');
    setEditReason(`Importada desde correo: ${cand.subject}`);
    setEditNotes(`Snippet: ${cand.rawSnippet}`);
  };

  const handleSaveEdit = (candId: string) => {
    updateAppointmentCandidate(candId, {
      detectedPatientName: editPatientName,
      detectedDate: editDate,
      detectedTime: editTime,
      detectedDoctor: editDoctor,
      detectedSpecialty: editSpecialty,
      detectedLocation: editLocation,
      confidence: 'HIGH' // Upgrade confidence on manual edit
    });
    setEditingCandidateId(null);
  };

  const handleImport = async (cand: any) => {
    // Determine target member ID
    let targetMemberId = editMemberId;
    if (editingCandidateId !== cand.id) {
      // Find matching member from state
      const matched = members.find(
        m => m.fullName.toLowerCase() === (cand.detectedPatientName || '').toLowerCase() && m.status !== 'DELETED'
      );
      if (matched) {
        targetMemberId = matched.id;
      }
    }

    if (!targetMemberId) {
      alert('Error: Debes asociar un miembro familiar antes de importar la cita.');
      return;
    }

    try {
      const details = {
        memberId: targetMemberId,
        date: editingCandidateId === cand.id ? editDate : cand.detectedDate,
        time: editingCandidateId === cand.id ? editTime : cand.detectedTime,
        doctorName: editingCandidateId === cand.id ? editDoctor : (cand.detectedDoctor || 'Médico'),
        specialty: editingCandidateId === cand.id ? editSpecialty : (cand.detectedSpecialty || 'Medicina General'),
        location: editingCandidateId === cand.id ? editLocation : (cand.detectedLocation || 'Consultorio'),
        reason: editingCandidateId === cand.id ? editReason : `Importada desde correo: ${cand.subject}`,
        notes: editingCandidateId === cand.id ? editNotes : `Snippet: ${cand.rawSnippet}`
      };

      await importAppointmentFromCandidate(cand.id, targetMemberId, details);
      alert('Cita importada exitosamente en la aplicación y sincronizada.');
      if (editingCandidateId === cand.id) {
        setEditingCandidateId(null);
      }
    } catch (err: any) {
      alert(`Error al importar: ${err.message}`);
    }
  };

  const handleIgnore = (candId: string) => {
    if (confirm('¿Estás seguro de ignorar esta cita sugerida? No se volverá a escanear.')) {
      updateAppointmentCandidate(candId, { status: 'IGNORED' as const });
    }
  };

  const filteredCandidates = appointmentCandidates.filter(c => c.status === filterStatus);

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-black text-slate-800 leading-tight">Importar citas desde correo</h2>
            <p className="text-xs font-semibold text-slate-400">Escanea remitentes en tu Gmail y agéndalos con un solo toque.</p>
          </div>
        </div>
        <Link href="/settings" className="p-2.5 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-xl transition-all shadow-sm border border-slate-100 flex items-center gap-1.5 text-xs font-bold bg-white">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Configurar Remitentes</span>
        </Link>
      </section>

      {/* Explicación de privacidad */}
      <div className="p-4.5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 text-blue-800 text-[11px] leading-relaxed font-semibold shadow-sm">
        <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-blue-950 block text-xs mb-0.5">Seguridad y Privacidad Garantizada</span>
          <p>La app solo leerá correos de los remitentes que configures para detectar programaciones de citas médicas. Los tokens de acceso se manejan estrictamente en memoria y no se guardan en el dispositivo.</p>
        </div>
      </div>

      {/* Control panel & scan */}
      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Escanear cuentas de Gmail</h4>
          <p className="text-[10px] text-slate-400 font-semibold">Configura el rango de tiempo y busca sugerencias de citas.</p>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-4 font-semibold text-[11px] text-slate-500">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Rango de días */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase">Rango de días recientes</label>
              <select
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value))}
                className="h-10 px-3 bg-white border border-slate-200 focus:border-teal-500 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                <option value={30}>Últimos 30 días</option>
                <option value={90}>Últimos 90 días</option>
                <option value={180}>Últimos 180 días</option>
              </select>
            </div>

            {/* Remitentes activos info */}
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase leading-none mb-1">Fuentes de correo activas</span>
              <div className="font-extrabold text-slate-700">
                {activeSources.length === 0 ? (
                  <span className="text-rose-500">Ningún remitente activo. Agrega uno en Configuración.</span>
                ) : (
                  <span>{activeSources.length} remitente(s) activo(s) listado(s).</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-200/50 pt-4">
            <button
              onClick={handleScan}
              disabled={scanning || activeSources.length === 0}
              className="py-2.5 px-5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Escaneando correos...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Buscar citas en Gmail</span>
                </>
              )}
            </button>
            
            {user.provider === 'mock' && (
              <button
                onClick={async () => {
                  setScanning(true);
                  try {
                    await scanGmailForAppointmentsAction(90);
                    setScanResult('Escaneo de sandbox completado exitosamente.');
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  } finally {
                    setScanning(false);
                  }
                }}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all"
              >
                Simular correos sandbox (Mock)
              </button>
            )}
          </div>
        </div>

        {scanResult && (
          <div className="bg-emerald-50 text-emerald-700 p-3.5 border border-emerald-100 rounded-2xl text-[11px] leading-relaxed font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            <span>{scanResult}</span>
          </div>
        )}

        {gmailError && (
          <div className="bg-rose-50 text-rose-700 p-3.5 border border-rose-100 rounded-2xl text-[11px] leading-relaxed font-bold flex items-center gap-2">
            <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
            <span>{gmailError}</span>
          </div>
        )}
      </section>

      {/* Candidatos e Importación */}
      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Citas médicas detectadas</h4>
            <p className="text-[10px] text-slate-400 font-semibold">Revisa y aprueba las sugerencias para registrarlas en tu expediente familiar.</p>
          </div>

          {/* Selector de filtro */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-100 rounded-xl w-fit">
            <button
              onClick={() => setFilterStatus('PENDING_REVIEW')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black leading-none transition-all ${
                filterStatus === 'PENDING_REVIEW' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilterStatus('IMPORTED')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black leading-none transition-all ${
                filterStatus === 'IMPORTED' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Importadas
            </button>
            <button
              onClick={() => setFilterStatus('DUPLICATE')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black leading-none transition-all ${
                filterStatus === 'DUPLICATE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Duplicadas
            </button>
            <button
              onClick={() => setFilterStatus('IGNORED')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black leading-none transition-all ${
                filterStatus === 'IGNORED' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Ignoradas
            </button>
          </div>
        </div>

        <hr className="border-slate-50" />

        {/* Listado de sugerencias */}
        <div className="flex flex-col gap-4">
          {/* Info banner for IGNORED tab */}
          {filterStatus === 'IGNORED' && filteredCandidates.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-[10px] font-semibold leading-relaxed flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-xs mb-0.5">Sin citas ignoradas aún</span>
                <p>Cuando el filtro <strong>&quot;Solo citas futuras&quot;</strong> está activo, las citas detectadas cuya fecha ya pasó se ignoran automáticamente y aparecerán aquí. Puedes activar este filtro en <strong>Configuración → Escaneo automático</strong>.</p>
              </div>
            </div>
          )}
          {filterStatus === 'IGNORED' && filteredCandidates.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-[10px] font-semibold leading-relaxed flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p>Estas citas fueron descartadas automáticamente porque su fecha detectada ya pasó. Si una fue descartada por error, puedes editarla manualmente en la pestaña <strong>Pendientes</strong> después de cambiar la fecha.</p>
            </div>
          )}
          {filteredCandidates.length === 0 && filterStatus !== 'IGNORED' ? (
            <div className="text-center py-10 text-slate-400 text-xs font-semibold">
              No hay citas médicas registradas en esta pestaña. Presiona &quot;Buscar citas en Gmail&quot; arriba para escanear.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredCandidates.map((cand) => {
                const matchedMember = members.find(
                  m => m.fullName.toLowerCase() === (cand.detectedPatientName || '').toLowerCase() && m.status !== 'DELETED'
                );
                const hasPatientMatched = !!matchedMember;
                const isLowConfidence = cand.confidence === 'LOW';
                
                // User must select a member manually if none is matched automatically
                const isImportDisabled = (!hasPatientMatched && editingCandidateId !== cand.id) || 
                                         (!editMemberId && editingCandidateId === cand.id) ||
                                         (!cand.detectedDate || !cand.detectedTime);

                return (
                  <div
                    key={cand.id}
                    className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col gap-4 font-semibold text-[11px] text-slate-600 relative overflow-hidden"
                  >
                    {/* Confidencia badge */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-400 font-bold">Confianza de extracción:</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none ${
                          cand.confidence === 'HIGH' ? 'bg-emerald-100 text-emerald-800' :
                          cand.confidence === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {cand.confidence === 'HIGH' ? 'Alta' :
                           cand.confidence === 'MEDIUM' ? 'Media' : 'Baja'}
                        </span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-medium">Recibido: {new Date(cand.receivedAt).toLocaleDateString('es-CO')}</span>
                    </div>

                    {/* Email info summary */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col gap-1">
                      <p className="text-slate-800 font-extrabold text-[11.5px] leading-tight truncate">{cand.subject}</p>
                      <p className="text-[9.5px] text-slate-400 font-bold">De: {cand.sourceEmail}</p>
                      <p className="text-[10px] text-slate-500 font-medium italic mt-1 leading-normal">&quot;{cand.rawSnippet}&quot;</p>
                    </div>

                    {/* Alertas de Validación */}
                    {!hasPatientMatched && editingCandidateId !== cand.id && cand.status === 'PENDING_REVIEW' && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-700 text-[10px] leading-relaxed flex items-start gap-2">
                        <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-rose-950 block text-[10.5px]">Paciente no detectado o ambiguo</span>
                          <p>Por seguridad, debes presionar &quot;Editar Detalles&quot; y asociar esta cita a un familiar de tu grupo antes de poder importarla.</p>
                        </div>
                      </div>
                    )}

                    {isLowConfidence && editingCandidateId !== cand.id && cand.status === 'PENDING_REVIEW' && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-700 text-[10px] leading-relaxed flex items-start gap-2">
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-950 block text-[10.5px]">Confianza baja detectada</span>
                          <p>Algunos campos de la cita (fecha, hora o médico) no pudieron ser extraídos con precisión. Presiona &quot;Editar Detalles&quot; para corregirlos e importarla.</p>
                        </div>
                      </div>
                    )}

                    {/* Visualización de Datos Extraídos */}
                    {editingCandidateId !== cand.id ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Paciente</span>
                            <span className={`text-xs font-black ${hasPatientMatched ? 'text-teal-700' : 'text-slate-400'}`}>
                              {cand.detectedPatientName || 'No detectado'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Fecha</span>
                            <span className="text-xs font-black text-slate-700">{cand.detectedDate || 'No detectada'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Hora</span>
                            <span className="text-xs font-black text-slate-700">{cand.detectedTime || 'No detectada'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Especialidad</span>
                            <span className="text-xs font-black text-slate-700">{cand.detectedSpecialty || 'Medicina General'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Médico</span>
                            <span className="text-xs font-black text-slate-700">{cand.detectedDoctor || 'Médico'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-[8.5px] text-slate-400 uppercase font-bold block leading-none mb-0.5">Ubicación</span>
                            <span className="text-xs font-black text-slate-700">{cand.detectedLocation || 'Consultorio'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Formulario de Edición Inline */
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col gap-3">
                        <span className="font-bold text-slate-800 text-[11px] block border-b border-slate-100 pb-1.5">Corregir sugerencia de cita</span>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          
                          {/* Selector de Miembro */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Familiar Paciente</label>
                            <select
                              value={editMemberId}
                              onChange={(e) => {
                                setEditMemberId(e.target.value);
                                const selected = members.find(m => m.id === e.target.value);
                                if (selected) {
                                  setEditPatientName(selected.fullName);
                                }
                              }}
                              className="h-9 px-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                            >
                              <option value="">-- Seleccionar familiar --</option>
                              {members.filter(m => m.status !== 'DELETED').map(m => (
                                <option key={m.id} value={m.id}>{m.fullName} ({m.relationship})</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Fecha</label>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Hora</label>
                            <input
                              type="time"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Especialidad</label>
                            <input
                              type="text"
                              value={editSpecialty}
                              onChange={(e) => setEditSpecialty(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Médico</label>
                            <input
                              type="text"
                              value={editDoctor}
                              onChange={(e) => setEditDoctor(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[8.5px] text-slate-400 uppercase font-bold">Ubicación</label>
                            <input
                              type="text"
                              value={editLocation}
                              onChange={(e) => setEditLocation(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2.5 mt-2 border-t border-slate-100 pt-2.5">
                          <button
                            onClick={() => setEditingCandidateId(null)}
                            className="py-1.5 px-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] rounded-lg"
                          >
                            Cancelar Edición
                          </button>
                          <button
                            onClick={() => handleSaveEdit(cand.id)}
                            className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg"
                          >
                            Guardar Cambios
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Botones de acción del candidato */}
                    {cand.status === 'PENDING_REVIEW' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/40 pt-4 mt-1">
                        <div className="flex items-center gap-2">
                          {editingCandidateId !== cand.id ? (
                            <button
                              onClick={() => handleStartEdit(cand)}
                              className="py-2 px-3.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Editar sugerencia</span>
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleIgnore(cand.id)}
                            className="py-2 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-xl font-bold text-[10px] transition-colors"
                          >
                            Ignorar sugerencia
                          </button>
                        </div>

                        <button
                          onClick={() => handleImport(cand)}
                          disabled={isImportDisabled}
                          className="py-2 px-4.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-transparent text-white rounded-xl font-black text-[10.5px] transition-all flex items-center gap-1 leading-none shadow-sm"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Importar Cita Médica</span>
                        </button>
                      </div>
                    )}

                    {cand.status === 'IMPORTED' && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-700 text-[10px] leading-relaxed flex items-center gap-2 mt-1">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                        <span>Esta cita ya ha sido importada exitosamente en el expediente médico.</span>
                      </div>
                    )}

                    {cand.status === 'DUPLICATE' && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-700 text-[10px] leading-relaxed flex items-center gap-2 mt-1">
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                        <span>Sugerencia duplicada: Ya existe una cita idéntica en el expediente.</span>
                      </div>
                    )}

                    {cand.status === 'IGNORED' && (
                      <div className="bg-slate-200/50 border border-slate-300/40 rounded-xl p-3 text-slate-500 text-[10px] leading-relaxed flex items-center gap-2 mt-1">
                        <X className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Sugerencia descartada.</span>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
