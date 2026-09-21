/**
 * Qué columna es cada campo (Bloque G, G0)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un descriptor por colección. Lo que no esté aquí ni en `DESCARTADOS` hace
 * fallar la prueba de cobertura: es la regla que impide que un campo se quede
 * por el camino en silencio.
 *
 * DOS MODELOS PUEDEN ESCRIBIR EN LA MISMA PESTAÑA
 * ───────────────────────────────────────────────
 * `members` y `healthProfiles` escriben los dos en `PERFIL_HUMANO`, cada uno su
 * parte: uno la identidad, otro lo clínico. Es una fila por paciente con dos
 * dueños, y por eso `members` tiene **dos** descriptores.
 */

import type { Descriptor } from './mapeoFilas';

const c = (columna: string, tipo?: Descriptor['campos'][string]['tipo']) => ({ columna, tipo });

/**
 * Colección → dónde se escribe.
 *
 * Una colección puede necesitar más de una pestaña; por eso es una lista.
 */
export const DESCRIPTORES: Record<string, readonly Descriptor[]> = {
  members: [
    {
      pestana: 'PACIENTES',
      pacienteDesde: 'id',
      campos: {
        id: c('id'),
        fullName: c('nombre'),
        relationship: c('relacion'),
        status: c('activo'),
        notes: c('notas'),
        photoUrl: c('foto_url'),
      },
    },
    {
      // La otra mitad de un familiar humano. `healthProfiles` escribe en esta
      // misma fila su parte clínica.
      pestana: 'PERFIL_HUMANO',
      pacienteDesde: 'id',
      campos: {
        birthDate: c('fecha_nacimiento'),
        bloodType: c('tipo_sangre'),
        documentType: c('documento_tipo'),
        documentNumber: c('documento_numero'),
        email: c('email'),
      },
    },
  ],

  healthProfiles: [
    {
      pestana: 'PERFIL_HUMANO',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        allergies: c('alergias', 'lista'),
        chronicConditions: c('condiciones', 'lista'),
        currentMedications: c('medicamentos_actuales', 'lista'),
        primaryDoctor: c('medico_cabecera'),
        insuranceInfo: c('seguro'),
        emergencyContact: c('telefono_emergencia'),
      },
    },
  ],

  appointments: [
    {
      pestana: 'CITAS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        reason: c('titulo'),
        specialty: c('especialidad'),
        doctorName: c('profesional'),
        location: c('institucion'),
        date: c('fecha'),
        time: c('hora'),
        status: c('estado'),
        medicalOrderId: c('orden_id'),
        googleCalendarEventId: c('evento_calendario_id'),
        notes: c('notas'),
        documentIds: c('documentos_ids', 'lista'),
        completedAt: c('completada_en'),
        reminderPolicy: c('politica_recordatorio'),
      },
    },
  ],

  vaccines: [
    {
      pestana: 'VACUNAS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        vaccineName: c('vacuna'),
        doseNumber: c('dosis_numero', 'numero'),
        dateApplied: c('fecha'),
        nextDoseDate: c('proxima_dosis'),
        institution: c('institucion'),
        batchNumber: c('lote'),
        notes: c('notas'),
      },
    },
  ],

  checkups: [
    {
      pestana: 'CONTROLES',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        checkupType: c('tipo'),
        scheduledDate: c('fecha_programada'),
        completedDate: c('fecha_realizada'),
        status: c('estado'),
        results: c('notas'),
        nextCheckupDate: c('proxima_fecha'),
        doctorName: c('profesional'),
      },
    },
  ],

  exams: [
    {
      pestana: 'EXAMENES',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        examName: c('nombre'),
        performedDate: c('fecha'),
        laboratory: c('institucion'),
        status: c('estado'),
        resultSummary: c('notas'),
        orderedBy: c('solicitado_por'),
        orderedDate: c('solicitada_en'),
        documentIds: c('documentos_ids', 'lista'),
      },
    },
  ],

  examResults: [
    {
      pestana: 'EXAMENES_RESULTADOS',
      campos: {
        id: c('id'),
        examId: c('examen_id'),
        parameterName: c('parametro'),
        value: c('valor'),
        unit: c('unidad'),
        referenceRange: c('rango_referencia'),
        isAbnormal: c('fuera_de_rango', 'booleano'),
      },
    },
  ],

  documents: [
    {
      pestana: 'DOCUMENTOS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        fileName: c('titulo'),
        documentType: c('tipo'),
        driveFileId: c('archivo_drive_id'),
        mimeType: c('mime'),
        uploadedAt: c('fecha'),
        relatedEventId: c('entidad_relacionada'),
        description: c('notas'),
        fileSize: c('tamano_bytes', 'numero'),
        driveUrl: c('archivo_drive_url'),
        clinicalCategory: c('categoria_clinica'),
      },
    },
  ],

  history: [
    {
      pestana: 'HISTORIAL',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        eventType: c('tipo_evento'),
        title: c('titulo'),
        description: c('descripcion'),
        eventDate: c('fecha_evento'),
        relatedEntityId: c('entidad_relacionada'),
      },
    },
  ],

  reminders: [
    {
      pestana: 'RECORDATORIOS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        reminderType: c('tipo'),
        title: c('titulo'),
        dueDate: c('fecha'),
        status: c('estado'),
        relatedEventId: c('entidad_relacionada'),
        description: c('descripcion'),
      },
    },
  ],

  medicalOrders: [
    {
      pestana: 'ORDENES',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        title: c('titulo'),
        orderType: c('tipo'),
        doctorName: c('profesional'),
        specialty: c('especialidad'),
        issuedAt: c('emitida_en'),
        expiresAt: c('vence_en'),
        requiresAuthorization: c('requiere_autorizacion', 'booleano'),
        // Dos cosas distintas, y por eso dos columnas: `estado` es el ciclo de
        // vida clínico de la orden y `autorizacion_estado` el trámite con la
        // EPS. Una orden autorizada puede seguir pendiente de cita.
        status: c('estado'),
        authorizationStatus: c('autorizacion_estado'),
        notes: c('notas'),
        description: c('descripcion'),
        authorizationNumber: c('autorizacion_numero'),
        authorizationDate: c('autorizacion_fecha'),
        authorizationExpiresAt: c('autorizacion_vence_en'),
        epsOrProvider: c('eps_o_proveedor'),
        ipsOrClinic: c('ips_o_clinica'),
        documentId: c('documento_id'),
        relatedAppointmentId: c('cita_relacionada_id'),
      },
    },
  ],

  medications: [
    {
      pestana: 'MEDICAMENTOS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        name: c('nombre'),
        dose: c('dosis_valor'),
        quantity: c('cantidad', 'numero'),
        quantityUnit: c('cantidad_unidad'),
        durationDays: c('duracion_dias', 'numero'),
        frequencyType: c('frecuencia_tipo'),
        frequencyIntervalHours: c('frecuencia_valor', 'numero'),
        specificTimes: c('momentos', 'lista'),
        instructions: c('indicaciones'),
        prescribedBy: c('prescrito_por'),
        documentId: c('documento_id'),
        startDate: c('fecha_inicio'),
        endDate: c('fecha_fin'),
        status: c('estado'),
        googleCalendarEventId: c('evento_calendario_id'),
      },
    },
  ],

  doseReminders: [
    {
      pestana: 'DOSIS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        prescriptionId: c('medicamento_id'),
        memberId: c('paciente_id'),
        scheduledAt: c('programada_en'),
        status: c('estado'),
        takenAt: c('tomada_en'),
        notes: c('notas'),
        googleCalendarEventId: c('evento_calendario_id'),
      },
    },
  ],

};

/**
 * Colecciones que **no tienen dónde escribir**, y por qué.
 *
 * Sus métodos del repositorio lanzan un error explícito en vez de callar.
 * Lanzar no cuenta como mudo en G1, así que el hueco queda visible el día que
 * alguien lo toque, en vez de tragarse el dato.
 */
export const SIN_PESTANA: Record<string, string> = {
  tasks:
    '`SEGUIMIENTOS` habla de seguimientos DE UNA ORDEN —orden_id, plantilla, destinatario, enviado_en—, no de tareas genéricas. No les faltan columnas: son conceptos distintos, y meter uno en el otro dejaría una pestaña que no significa lo que dice su nombre',
  gmailSources: 'la importación desde Gmail es E11 y no está construida',
  appointmentCandidates:
    'las citas detectadas en un correo y pendientes de confirmar son de E11, que no está construido',
  settings: 'los seis ajustes de escaneo de Gmail son de E11',
};

/** El modelo de dominio que hay detrás de cada colección. */
export const MODELO_DE_COLECCION: Record<string, string> = {
  members: 'FamilyMember',
  healthProfiles: 'HealthProfile',
  appointments: 'MedicalAppointment',
  vaccines: 'VaccineRecord',
  checkups: 'PeriodicCheckup',
  exams: 'MedicalExam',
  examResults: 'ExamResult',
  documents: 'ClinicalDocument',
  history: 'MedicalHistoryEvent',
  reminders: 'Reminder',
  medicalOrders: 'MedicalOrder',
  medications: 'MedicationPrescription',
  doseReminders: 'MedicationDoseReminder',
};
