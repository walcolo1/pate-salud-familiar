'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Plus, 
  FileText, 
  CloudCheck, 
  Cloud, 
  Download, 
  Trash2, 
  Save, 
  Activity, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { DocumentType } from '@/domain/models';

const docTypeMap: Record<DocumentType, string> = {
  PDF: 'Archivo PDF',
  IMAGE: 'Imagen Médica',
  LAB_RESULT: 'Resultado de Laboratorio',
  PRESCRIPTION: 'Fórmula Médica',
  CERTIFICATE: 'Certificado Médico',
  MEDICAL_ORDER: 'Orden de Examen',
  OTHER: 'Otro documento'
};

export default function DocumentsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    documents, 
    uploadDocument, 
    deleteDocument, 
    driveSyncEnabled,
    isLoading,
    driveStatus,
    driveError,
    shareDocumentWithMember,
    revokeDocumentShare
  } = useApp();

  const [showAddForm, setShowAddForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Form states
  const [fileName, setFileName] = useState('');
  const [docType, setDocType] = useState<DocumentType>('PRESCRIPTION');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const getUploadStatusInfo = () => {
    if (!driveSyncEnabled) {
      return {
        title: 'Guardando localmente',
        description: 'Guardando el archivo de forma segura en el almacenamiento local...',
        isPending: false,
        isSuccess: true
      };
    }
    
    switch (driveStatus) {
      case 'connecting':
        return {
          title: 'Conectando con Drive',
          description: 'Estableciendo conexión con Google Drive...',
          isPending: true
        };
      case 'authorizing':
        return {
          title: 'Esperando permiso',
          description: 'Por favor, autoriza el acceso a Google Drive en la ventana emergente...',
          isPending: true
        };
      case 'subiendo':
        return {
          title: 'Subiendo archivo',
          description: 'Transfiriendo el archivo clínico a tu cuenta de Google Drive...',
          isPending: true
        };
      case 'subido':
        return {
          title: 'Subido correctamente',
          description: '¡El documento ha sido guardado y sincronizado con éxito en tu Google Drive!',
          isPending: false,
          isSuccess: true
        };
      case 'error':
        const isAccessDenied = driveError && (
          driveError.toLowerCase().includes('access_denied') || 
          driveError.toLowerCase().includes('403') ||
          driveError.toLowerCase().includes('tester')
        );
        const isAuthError = isAccessDenied || (driveError && (
          driveError.toLowerCase().includes('denegado') || 
          driveError.toLowerCase().includes('auth') || 
          driveError.toLowerCase().includes('permission') || 
          driveError.toLowerCase().includes('popup') || 
          driveError.toLowerCase().includes('oauth') ||
          driveError.toLowerCase().includes('cancel')
        ));
        
        let errorDesc = driveError || 'Ocurrió un problema durante la carga del documento.';
        if (isAccessDenied) {
          errorDesc = 'La cuenta no está autorizada como tester en Google Cloud. Agrega este correo en OAuth Test Users y vuelve a intentar.';
        }

        return {
          title: isAuthError ? 'Error de autorización' : 'Error de subida',
          description: errorDesc,
          isPending: false,
          isError: true
        };
      default:
        return {
          title: 'Procesando',
          description: 'Preparando archivo...',
          isPending: true
        };
    }
  };

  const resetForm = () => {
    setFileName('');
    setDocType('PRESCRIPTION');
    setDescription('');
    setSelectedFile(null);
    setIsUploading(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setShowAddForm(false);
    setIsUploading(true);

    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
    const finalFileName = fileName ? (fileName.endsWith(ext) ? fileName : `${fileName}${ext}`) : selectedFile.name;

    await uploadDocument(id, {
      fileName: finalFileName,
      fileType: docType,
      description: description || undefined
    }, selectedFile);
  };

  const memberDocs = documents
    .filter(d => d.memberId === id)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

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
          <span>Subir documento</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Documentos de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Recetas, reportes y fórmulas clínicas guardadas de forma segura.</p>
      </section>

      {/* Documents List */}
      <section className="flex flex-col gap-3.5">
        {memberDocs.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <FileText className="h-10 w-10 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-800">No hay documentos guardados</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Sube fórmulas de medicamentos o reportes de laboratorio. Se guardarán de forma privada en tu espacio de Google Drive.
            </p>
          </div>
        ) : (
          memberDocs.map((doc) => (
            <div 
              key={doc.id}
              className="bg-white p-4.5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 group"
            >
              {/* Doc Icon */}
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl shrink-0">
                <FileText className="h-5 w-5" />
              </div>

              {/* Title & info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-extrabold text-slate-800 truncate mb-0.5">{doc.fileName}</h4>
                <p className="text-[10px] text-slate-400 font-bold mb-1">
                  {docTypeMap[doc.documentType]} · {new Date(doc.uploadedAt).toLocaleDateString('es-CO')}
                  {doc.fileSize && ` · ${Math.round(doc.fileSize / 1024)} KB`}
                  {doc.mimeType && ` · ${doc.mimeType.split('/').pop()?.toUpperCase()}`}
                </p>
                {doc.description && (
                  <p className="text-[10px] text-slate-500 font-semibold italic truncate">{doc.description}</p>
                )}
              </div>

              {/* Sync and delete actions */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 mr-1">
                  {doc.syncStatus === 'SYNCED' ? (
                    <>
                      <Cloud className="h-4 w-4 text-teal-600" />
                      <span className="text-[9px] font-bold text-teal-600">Drive</span>
                    </>
                  ) : doc.syncStatus === 'SYNC_ERROR' ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                      <span className="text-[9px] font-bold text-rose-500">Error Drive</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="h-4 w-4 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-400">Local</span>
                    </>
                  )}
                </div>

                {member.email && doc.syncStatus === 'SYNCED' && (
                  <div className="flex items-center gap-1.5 mr-1">
                    {doc.shareStatus === 'SHARED' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-extrabold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full uppercase leading-none">
                          Compartido
                        </span>
                        <button
                          onClick={() => revokeDocumentShare(doc.id)}
                          className="text-[9px] font-black text-rose-600 hover:text-rose-800 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-xl transition-all duration-200"
                          title={`Revocar acceso a ${doc.sharedWithEmail}`}
                        >
                          Revocar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => shareDocumentWithMember(doc.id, member.email!)}
                        className="text-[9px] font-black text-teal-600 hover:text-teal-800 bg-teal-50 border border-teal-100 px-2.5 py-0.5 rounded-xl transition-all duration-200"
                      >
                        Compartir
                      </button>
                    )}
                  </div>
                )}

                {doc.driveUrl && (
                  <a 
                    href={doc.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 hover:bg-teal-50 text-slate-400 hover:text-teal-600 rounded-xl transition-all duration-200"
                    title="Abrir en Google Drive"
                  >
                    <ExternalLink className="h-4.5 w-4.5" />
                  </a>
                )}

                <button 
                  onClick={() => deleteDocument(doc.id)}
                  className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all duration-200"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Uploading Modal Backdrop with Detailed Statuses */}
      {isUploading && (() => {
        const info = getUploadStatusInfo();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center gap-5 text-center">
              {info.isPending && (
                <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
              )}
              {info.isSuccess && (
                <CheckCircle2 className="h-12 w-12 text-teal-600" />
              )}
              {info.isError && (
                <AlertCircle className="h-12 w-12 text-rose-500" />
              )}
              
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 mb-1">{info.title}</h4>
                <p className="text-xs text-slate-400 px-2 leading-relaxed">{info.description}</p>
                {info.isError && driveError && (
                  <p className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded-xl mt-2 font-mono break-all max-h-24 overflow-y-auto">
                    {driveError}
                  </p>
                )}
                {info.isError && (
                  <p className="text-[9px] text-amber-600 font-bold mt-2">
                    ⚠ Nota: El documento se guardó localmente como respaldo.
                  </p>
                )}
              </div>

              {!info.isPending && (
                <button
                  onClick={resetForm}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-extrabold text-xs rounded-xl transition-colors"
                >
                  Entendido
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Document Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Subir Documento Clínico</h3>
            
            <form onSubmit={handleUpload} className="flex flex-col gap-4">
              {/* File Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Seleccionar Archivo (PDF, JPG, PNG)</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                    if (file) {
                      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                      setFileName(baseName);
                    }
                  }}
                  className="w-full text-xs font-semibold text-slate-800 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer border border-dashed border-slate-200 p-2 rounded-xl"
                />
              </div>

              {/* File Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre del Archivo en App</label>
                <input
                  type="text"
                  required
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Ej. Receta_Losartan_Carlos"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Document Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Tipo de Documento</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocumentType)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="PRESCRIPTION">Fórmula Médica (Receta)</option>
                  <option value="LAB_RESULT">Resultado de Laboratorio</option>
                  <option value="MEDICAL_ORDER">Orden Médica</option>
                  <option value="CERTIFICATE">Certificado Clínico</option>
                  <option value="PDF">Archivo PDF General</option>
                  <option value="IMAGE">Imagen Médica (Radiografía, etc.)</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Detalles / Indicaciones (Opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Vigente por 3 meses, control lipídico, etc."
                  className="h-16 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedFile(null);
                    setFileName('');
                  }}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>Subir</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
