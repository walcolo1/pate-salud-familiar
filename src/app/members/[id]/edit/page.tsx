'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react';
import { Relationship, BloodType, MemberDocumentType } from '@/domain/models';

export default function EditMemberPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    updateMember, 
    isLoading, 
    currentUserRole,
    createInvitation,
    resendInvitation,
    revokeInvitation
  } = useApp();

  const [fullName, setFullName] = useState('');
  const [linkedEmail, setLinkedEmail] = useState('');
  const [accessRole, setAccessRole] = useState<'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER'>('MEMBER');
  const [birthDate, setBirthDate] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('CHILD');
  const [bloodType, setBloodType] = useState<BloodType | ''>('');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');
  const [canAccessPortal, setCanAccessPortal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'NONE' | 'INVITED' | 'ACTIVE' | 'REVOKED'>('NONE');
  const [documentType, setDocumentType] = useState<MemberDocumentType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Granular permissions states
  const [canManageOwnProfile, setCanManageOwnProfile] = useState(true);
  const [canManageOwnAppointments, setCanManageOwnAppointments] = useState(true);
  const [canManageOwnDocuments, setCanManageOwnDocuments] = useState(true);
  const [canViewOwnHistory, setCanViewOwnHistory] = useState(true);
  const [canUploadDocuments, setCanUploadDocuments] = useState(true);
  const [canExportOwnData, setCanExportOwnData] = useState(false);
  const [canViewFamilyData, setCanViewFamilyData] = useState(false);
  const [canManageFamilyData, setCanManageFamilyData] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  const member = members.find(m => m.id === id);

  useEffect(() => {
    if (member && !isInitialized) {
      setFullName(member.fullName);
      setBirthDate(member.birthDate);
      setRelationship(member.relationship);
      setBloodType(member.bloodType || '');
      setNotes(member.notes || '');
      setEmail(member.email || '');
      setCanAccessPortal(member.canAccessPortal || false);
      setPermissionStatus(member.permissionStatus || 'NONE');
      if (member.documentType) {
        setDocumentType(member.documentType);
      }
      if (member.documentNumber) {
        setDocumentNumber(member.documentNumber);
      }
      setLinkedEmail(member.linkedEmail || '');
      setAccessRole(member.accessRole || 'MEMBER');
      
      const perms = member.permissions || {
        canManageOwnProfile: true,
        canManageOwnAppointments: true,
        canManageOwnDocuments: true,
        canViewOwnHistory: true,
        canUploadDocuments: true,
        canExportOwnData: false,
        canViewFamilyData: false,
        canManageFamilyData: false
      };
      
      setCanManageOwnProfile(perms.canManageOwnProfile);
      setCanManageOwnAppointments(perms.canManageOwnAppointments);
      setCanManageOwnDocuments(perms.canManageOwnDocuments);
      setCanViewOwnHistory(perms.canViewOwnHistory);
      setCanUploadDocuments(perms.canUploadDocuments);
      setCanExportOwnData(perms.canExportOwnData);
      setCanViewFamilyData(perms.canViewFamilyData);
      setCanManageFamilyData(perms.canManageFamilyData);
      setIsInitialized(true);
    }
  }, [member, isInitialized]);

  // Sugerir tipo de documento según la fecha de nacimiento (solo si se altera activamente tras inicializar)
  useEffect(() => {
    if (!isInitialized || !birthDate) return;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    if (age < 18) {
      setDocumentType('TI');
    } else {
      setDocumentType('CC');
    }
  }, [birthDate, isInitialized]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

    if (!documentNumber.trim()) {
      setError('El número de documento es obligatorio');
      return;
    }

    // Validar duplicados de documento en miembros activos/inactivos, excluyendo el actual
    const normalizedDocNumber = documentNumber.trim();
    const duplicateExists = members.some(
      (m) =>
        m.id !== id &&
        m.status !== 'DELETED' &&
        m.documentNumber?.trim().toLowerCase() === normalizedDocNumber.toLowerCase()
    );

    if (duplicateExists) {
      setError('El número de documento ya está registrado para otro miembro familiar');
      return;
    }

    const permissions = {
      canManageOwnProfile,
      canManageOwnAppointments,
      canManageOwnDocuments,
      canViewOwnHistory,
      canUploadDocuments,
      canExportOwnData,
      canViewFamilyData,
      canManageFamilyData
    };

    updateMember(id, {
      fullName,
      birthDate,
      relationship,
      bloodType: bloodType === '' ? null : bloodType,
      notes: notes.trim() || null,
      email: email.trim() || null,
      canAccessPortal,
      permissionStatus: canAccessPortal ? permissionStatus : 'NONE',
      permissions: canAccessPortal ? permissions : null,
      documentType,
      documentNumber: normalizedDocNumber,
      linkedEmail: linkedEmail.trim() || null,
      accessRole
    });

    router.replace(`/members/${id}`);
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
          <span>Cancelar</span>
        </Link>
        <h2 className="text-sm font-black text-slate-800 tracking-wide uppercase">Editar Familiar</h2>
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

        {/* Document Type and Document Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-extrabold text-slate-700">Tipo de Documento</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as any)}
              className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 outline-none transition-all duration-200"
            >
              <option value="CC">Cédula de Ciudadanía (CC)</option>
              <option value="TI">Tarjeta de Identidad (TI)</option>
              <option value="CE">Cédula de Extranjería (CE)</option>
              <option value="PASSPORT">Pasaporte (PASSPORT)</option>
              <option value="OTHER">Otro (OTHER)</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-extrabold text-slate-700">Número de Documento</label>
            <input
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="Ej. 1020304050"
              className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200"
            />
          </div>
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

        {/* Acceso del Miembro */}
        {currentUserRole === 'FAMILY_ADMIN' && (
          <>
            <hr className="border-slate-100" />
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 tracking-wide uppercase px-1">Acceso del miembro</h4>
                {member.invitationStatus && member.invitationStatus !== 'NONE' && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                    member.invitationStatus === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    member.invitationStatus === 'PENDING' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {member.invitationStatus === 'ACCEPTED' ? 'Aceptada' :
                     member.invitationStatus === 'PENDING' ? 'Pendiente' :
                     member.invitationStatus === 'REVOKED' ? 'Revocada' :
                     member.invitationStatus === 'EXPIRED' ? 'Expirada' : 'Ninguno'}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-4 p-4.5 bg-slate-50 rounded-2xl border border-slate-100">
                {/* Correo Vinculado */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-extrabold text-slate-700">Correo Electrónico Vinculado</label>
                  <input
                    type="email"
                    value={linkedEmail}
                    onChange={(e) => setLinkedEmail(e.target.value)}
                    placeholder="ejemplo@gmail.com"
                    disabled={member.invitationStatus === 'PENDING' || member.invitationStatus === 'ACCEPTED'}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 disabled:opacity-60 disabled:bg-slate-50"
                  />
                </div>

                {/* Rol de Acceso */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-extrabold text-slate-700">Rol de Acceso</label>
                  <select
                    value={accessRole}
                    onChange={(e) => setAccessRole(e.target.value as any)}
                    disabled={member.invitationStatus === 'PENDING' || member.invitationStatus === 'ACCEPTED'}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-all duration-200 disabled:opacity-60 disabled:bg-slate-50"
                  >
                    <option value="MEMBER">Miembro (Solo ve sus datos propios)</option>
                    <option value="CAREGIVER">Cuidador (Gestiona familiares asignados)</option>
                    <option value="VIEWER">Visor (Solo lectura)</option>
                    <option value="OWNER">Titular (Acceso completo y administración)</option>
                  </select>
                </div>

                {/* Botones de acción */}
                <div className="flex flex-wrap gap-2.5 mt-2">
                  {(!member.invitationStatus || member.invitationStatus === 'NONE' || member.invitationStatus === 'REVOKED' || member.invitationStatus === 'EXPIRED') && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!linkedEmail.trim()) {
                          alert('Por favor ingresa un correo electrónico para enviar la invitación.');
                          return;
                        }
                        try {
                          await createInvitation(id, linkedEmail.trim(), accessRole);
                          alert('Invitación creada exitosamente y archivos compartidos.');
                        } catch (err: any) {
                          alert(`Error al crear invitación: ${err.message}`);
                        }
                      }}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl transition-all duration-200"
                    >
                      Enviar Invitación
                    </button>
                  )}

                  {member.invitationStatus === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await resendInvitation(member.invitationId || '');
                          } catch (err: any) {
                            alert(`Error al reenviar invitación: ${err.message}`);
                          }
                        }}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold rounded-xl transition-all duration-200"
                      >
                        Reenviar Invitación
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm('¿Estás seguro de que deseas revocar esta invitación pendiente?')) {
                            try {
                              await revokeInvitation(member.invitationId || '');
                            } catch (err: any) {
                              alert(`Error al revocar invitación: ${err.message}`);
                            }
                          }
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition-all duration-200"
                      >
                        Revocar Acceso
                      </button>
                    </>
                  )}

                  {member.invitationStatus === 'ACCEPTED' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('¿Estás seguro de que deseas revocar el acceso a este miembro? Perderá la conexión a la base familiar.')) {
                          try {
                            await revokeInvitation(member.invitationId || '');
                          } catch (err: any) {
                            alert(`Error al revocar acceso: ${err.message}`);
                          }
                        }
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition-all duration-200"
                    >
                      Revocar Acceso
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

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
          <span>Guardar Cambios</span>
        </button>

      </form>

    </div>
  );
}
