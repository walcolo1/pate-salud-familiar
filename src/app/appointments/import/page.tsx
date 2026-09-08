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
  Edit2,
  Upload
} from 'lucide-react';
import Link from 'next/link';
import {
  validarAdjunto,
  mensajeRechazoAdjunto,
  AVISO_ADJUNTO_NO_EXTRAIBLE,
  TIPOS_ADJUNTO_ACEPTADOS,
} from '@/lib/importacionManual';
import { extraerTextoPdf, mensajeResultadoPdf } from '@/lib/extraerTextoPdf';

export default function AppointmentsImportPage() {
  const router = useRouter();
  const { 
    user,
    isLoading,
    members,
    appointmentCandidates,
    updateAppointmentCandidate,
    importAppointmentFromCandidate,
    crearCandidatoManual,
  } = useApp();

  // Bloque B · Entrada manual. No hay token, ni estado de conexión, ni
  // escaneo: lo único que existe es el texto que la persona aporta.
  const [textoPegado, setTextoPegado] = useState('');
  const [avisoAdjunto, setAvisoAdjunto] = useState<string | null>(null);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [nombreAdjunto, setNombreAdjunto] = useState<string | null>(null);
  const [leyendoPdf, setLeyendoPdf] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'PENDING_REVIEW' | 'IMPORTED' | 'IGNORED' | 'DUPLICATE'>('PENDING_REVIEW');
  const [resultado, setResultado] = useState<string | null>(null);

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

  /**
   * Crea el borrador a partir del texto pegado.
   *
   * Nada viaja a ningún servidor: el análisis ocurre en este navegador. Y el
   * resultado es un borrador, nunca una cita.
   */
  const handleCrearBorrador = () => {
    setErrorAdjunto(null);
    const candidato = crearCandidatoManual(textoPegado, nombreAdjunto);
    if (!candidato) {
      setResultado(null);
      setErrorAdjunto('Pega el texto del correo antes de crear el borrador.');
      return;
    }
    setResultado(
      candidato.status === 'IGNORED'
        ? 'La cita detectada ya pasó, así que el borrador quedó marcado como ignorado. Puedes verlo en la pestaña «Ignoradas».'
        : 'Borrador creado. Revísalo abajo, corrige lo que haga falta y confírmalo.',
    );
    setTextoPegado('');
    setNombreAdjunto(null);
    setAvisoAdjunto(null);
    setFilterStatus(candidato.status === 'IGNORED' ? 'IGNORED' : 'PENDING_REVIEW');
  };

  /**
   * Adjuntar un archivo.
   *
   * El archivo NO se envía a ningún sitio: ni el PDF, ni su texto, ni su
   * nombre. De un .txt o un .eml se lee el texto directamente; de un PDF se
   * extrae con pdf.js dentro de este navegador, con su worker servido desde
   * el propio origen.
   *
   * De una imagen no se extrae nada: haría falta OCR, que no entra en esta
   * fase. Y un PDF escaneado es una imagen dentro de un PDF, así que tampoco.
   * En ambos casos se dice con claridad y la persona completa el borrador a
   * mano, en lugar de dejar un botón que aparenta hacer algo que no hace.
   */
  const handleAdjuntar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    setResultado(null);
    setAvisoAdjunto(null);
    setErrorAdjunto(null);

    const veredicto = validarAdjunto({
      name: archivo.name,
      type: archivo.type,
      size: archivo.size,
    });

    if (!veredicto.ok) {
      setErrorAdjunto(mensajeRechazoAdjunto(veredicto.motivo));
      return;
    }

    setNombreAdjunto(archivo.name);

    if (veredicto.extraible) {
      const texto = await archivo.text();
      setTextoPegado(texto);
      setAvisoAdjunto(`Se leyó el texto de «${archivo.name}». Revísalo y crea el borrador.`);
      return;
    }

    if (archivo.type === 'application/pdf') {
      setLeyendoPdf(true);
      try {
        const datos = new Uint8Array(await archivo.arrayBuffer());
        const resultado = await extraerTextoPdf(datos);

        if (resultado.estado === 'ok') {
          setTextoPegado(resultado.texto);
          setAvisoAdjunto(`Se leyó el texto de «${archivo.name}». Revísalo y crea el borrador.`);
        } else {
          // PDF escaneado, dañado o cifrado: se dice lo que pasó y se deja el
          // camino abierto, en vez de fingir una extracción vacía.
          setErrorAdjunto(mensajeResultadoPdf(resultado));
        }
      } finally {
        setLeyendoPdf(false);
      }
      return;
    }

    setAvisoAdjunto(`«${archivo.name}». ${AVISO_ADJUNTO_NO_EXTRAIBLE}`);
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
            <h2 className="text-2xl font-black text-slate-800 leading-tight">Importar una cita</h2>
            <p className="text-xs font-semibold text-slate-400">Pega el texto del correo de tu EPS o adjunta el documento.</p>
          </div>
        </div>
        <Link href="/settings" className="p-2.5 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-xl transition-all shadow-sm border border-slate-100 flex items-center gap-1.5 text-xs font-bold bg-white">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Ajustes</span>
        </Link>
      </section>

      {/* Explicación de privacidad */}
      <div className="p-4.5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 text-blue-800 text-[11px] leading-relaxed font-semibold shadow-sm">
        <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-blue-950 block text-xs mb-0.5">La aplicación no lee tu correo</span>
          <p>Nunca pide acceso a tu buzón. Tú decides qué pegar o adjuntar, el análisis ocurre en este dispositivo y nada se envía a ningún servicio externo. Lo que se crea es un borrador: ninguna cita se registra sin que la revises y la confirmes.</p>
        </div>
      </div>

      {/* Entrada manual (Bloque B) */}
      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Pega el correo o adjunta el documento</h4>
          <p className="text-[10px] text-slate-400 font-semibold">
            Copia el texto del mensaje que te envió la EPS. Se reconocerán paciente, fecha, hora, médico, especialidad y lugar.
          </p>
        </div>

        <textarea
          id="texto-cita"
          value={textoPegado}
          onChange={(e) => setTextoPegado(e.target.value)}
          rows={7}
          placeholder="Pega aquí el texto del correo…"
          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:border-violet-500 text-slate-900 font-medium resize-y"
        />

        {avisoAdjunto && (
          <div id="aviso-adjunto" className="p-3.5 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-[11px] leading-relaxed font-semibold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{avisoAdjunto}</span>
          </div>
        )}

        {errorAdjunto && (
          <div id="error-adjunto" className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-[11px] leading-relaxed font-bold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorAdjunto}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <label
            htmlFor="adjunto-cita"
            className="cursor-pointer py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-[11px] rounded-xl shadow-sm flex items-center gap-2 w-fit transition-all"
          >
            {leyendoPdf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span id="leyendo-pdf">Leyendo el documento…</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Adjuntar PDF, imagen o texto</span>
              </>
            )}
          </label>
          <input
            id="adjunto-cita"
            type="file"
            accept={TIPOS_ADJUNTO_ACEPTADOS.join(',')}
            onChange={handleAdjuntar}
            className="hidden"
          />

          <button
            id="btn-crear-borrador"
            type="button"
            onClick={handleCrearBorrador}
            disabled={!textoPegado.trim()}
            className="py-2.5 px-5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-[11px] rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <Check className="h-4 w-4" />
            <span>Crear borrador</span>
          </button>
        </div>

        {resultado && (
          <div id="resultado-borrador" className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-[11px] leading-relaxed font-semibold flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{resultado}</span>
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
              No hay borradores en esta pestaña. Pega el texto de un correo arriba y presiona &quot;Crear borrador&quot;.
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
