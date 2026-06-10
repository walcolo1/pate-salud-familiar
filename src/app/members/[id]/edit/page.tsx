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
  const { user, members, updateMember, isLoading } = useApp();

  const [fullName, setFullName] = useState('');
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
      documentNumber: normalizedDocNumber
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

        {/* Acceso al Portal Familiar */}
        <hr className="border-slate-100" />
        <h4 className="text-xs font-extrabold text-slate-800 tracking-wide uppercase px-1">Acceso al Portal Familiar</h4>

        {/* Email */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-700">Correo Electrónico (Opcional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="h-12 px-4.5 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200"
          />
        </div>

        {/* Toggle Portal Access */}
        {email.trim() !== '' && (
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">Habilitar acceso al portal</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">Permite iniciar sesión con este correo y ver su expediente</p>
            </div>
            <button 
              type="button"
              onClick={() => setCanAccessPortal(!canAccessPortal)}
              className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                canAccessPortal ? 'bg-teal-600 flex justify-end' : 'bg-slate-200 flex justify-start'
              }`}
            >
              <span className="w-4.5 h-4.5 rounded-full bg-white shadow" />
            </button>
          </div>
        )}

        {/* Permission Status and Granular Permissions checkboxes */}
        {email.trim() !== '' && canAccessPortal && (
          <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl flex flex-col gap-4">
            {/* Permission Status */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-extrabold text-slate-700">Estado de Invitación</label>
              <select
                value={permissionStatus}
                onChange={(e) => setPermissionStatus(e.target.value as any)}
                className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-all duration-200"
              >
                <option value="NONE">Sin invitar</option>
                <option value="INVITED">Invitación enviada</option>
                <option value="ACTIVE">Invitación aceptada / Activa</option>
                <option value="REVOKED">Acceso revocado</option>
              </select>
            </div>

            {/* Granular checkboxes */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-extrabold text-slate-700">Permisos Granulares</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                {[
                  { label: 'Gestionar su perfil propio', checked: canManageOwnProfile, setter: setCanManageOwnProfile },
                  { label: 'Gestionar citas propias', checked: canManageOwnAppointments, setter: setCanManageOwnAppointments },
                  { label: 'Gestionar documentos propios', checked: canManageOwnDocuments, setter: setCanManageOwnDocuments },
                  { label: 'Ver su historial propio', checked: canViewOwnHistory, setter: setCanViewOwnHistory },
                  { label: 'Cargar documentos propios', checked: canUploadDocuments, setter: setCanUploadDocuments },
                  { label: 'Exportar datos propios', checked: canExportOwnData, setter: setCanExportOwnData },
                  { label: 'Ver datos de toda la familia', checked: canViewFamilyData, setter: setCanViewFamilyData },
                  { label: 'Gestionar datos de toda la familia', checked: canManageFamilyData, setter: setCanManageFamilyData }
                ].map((perm, idx) => (
                  <label key={idx} className="flex items-center gap-2.5 cursor-pointer hover:text-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={perm.checked}
                      onChange={(e) => perm.setter(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500/20 h-4.5 w-4.5 cursor-pointer accent-teal-600"
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
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
