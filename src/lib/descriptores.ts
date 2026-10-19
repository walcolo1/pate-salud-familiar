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
 * Mascotas (Bloque D) — esquema v6.
 *
 * Hasta v6 vivían solo en el navegador. Una mascota es un paciente más:
 * `PACIENTES` con `tipo: 'MASCOTA'` y lo propio en `PERFIL_MASCOTA`, igual que
 * un humano con `PERFIL_HUMANO`. Sus pesos, vacunas e historial van a las
 * pestañas comunes con su `paciente_id`; al leer se separan por ese id.
 */
export const DESCRIPTORES_MASCOTAS: Record<string, readonly Descriptor[]> = {
  pets: [
    {
      pestana: 'PACIENTES',
      pacienteDesde: 'id',
      especie: 'MASCOTA',
      constantes: { tipo: 'MASCOTA' },
      campos: {
        id: c('id'),
        nombre: c('nombre'),
        activo: c('activo', 'booleano'),
        // Bloque O · `notas` lleva el sobre de la ficha ampliada
        // (`domain/fichaMascota`); la foto, su columna de siempre.
        notas: c('notas'),
        fotoUrl: c('foto_url'),
      },
    },
    {
      pestana: 'PERFIL_MASCOTA',
      pacienteDesde: 'id',
      especie: 'MASCOTA',
      clave: 'paciente_id',
      campos: {
        id: c('paciente_id'),
        especie: c('especie'),
        raza: c('raza'),
        fechaNacimiento: c('fecha_nacimiento'),
        sexo: c('sexo'),
        pesoActualKg: c('peso_actual_kg', 'numero'),
        pesoIdealKg: c('peso_ideal_kg', 'numero'),
        memberId: c('responsable_id'),
      },
    },
  ],

  petWeights: [
    {
      pestana: 'PESOS',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        fecha: c('fecha'),
        pesoKg: c('peso_kg', 'numero'),
        nota: c('nota'),
      },
    },
  ],

  petVaccines: [
    {
      pestana: 'VACUNAS',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        vacuna: c('vacuna'),
        fecha: c('fecha'),
        proximaDosis: c('proxima_dosis'),
        laboratorio: c('laboratorio'),
        lote: c('lote'),
        veterinario: c('profesional'),
        // Bloque O · clínica, y el sobre con tipo (core/no-core), certificado y costo.
        clinica: c('institucion'),
        detalle: c('notas'),
      },
    },
  ],

  // ── Bloque O · los cinco módulos clínicos, en pestañas existentes ─────────

  petCare: [
    {
      pestana: 'CONTROLES',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      constantes: { estado: 'REALIZADO' },
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        tipo: c('tipo'),
        fecha: c('fecha_realizada'),
        proxima: c('proxima_fecha'),
        periodicidadMeses: c('periodicidad_meses', 'numero'),
        profesional: c('profesional'),
        detalle: c('notas'),
      },
    },
  ],

  petTreatments: [
    {
      pestana: 'MEDICAMENTOS',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        nombre: c('nombre'),
        dosisValor: c('dosis_valor', 'numero'),
        dosisUnidad: c('dosis_unidad'),
        frecuencia: c('frecuencia_tipo'),
        horaInicio: c('momentos'),
        fechaInicio: c('fecha_inicio'),
        fechaFin: c('fecha_fin'),
        estado: c('estado'),
        prescritoPor: c('prescrito_por'),
        indicaciones: c('indicaciones'),
        detalle: c('notas'),
      },
    },
  ],

  petDoses: [
    {
      pestana: 'DOSIS',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        tratamientoId: c('medicamento_id'),
        petId: c('paciente_id'),
        programadaEn: c('programada_en'),
        estado: c('estado'),
        aplicadaEn: c('tomada_en'),
      },
    },
  ],

  petReminderStates: [
    {
      pestana: 'RECORDATORIOS',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        tipo: c('tipo'),
        titulo: c('titulo'),
        fecha: c('fecha'),
        estado: c('estado'),
        clave: c('entidad_relacionada'),
      },
    },
  ],

  petHistory: [
    {
      pestana: 'HISTORIAL',
      pacienteDesde: 'petId',
      especie: 'MASCOTA',
      campos: {
        id: c('id'),
        petId: c('paciente_id'),
        fecha: c('fecha_evento'),
        tipo: c('tipo_evento'),
        diagnostico: c('titulo'),
        tratamiento: c('descripcion'),
        veterinario: c('profesional'),
      },
    },
  ],
};


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
      // Las mascotas escriben en esta misma pestaña con `tipo: 'MASCOTA'` (ver
      // `pets`, más abajo). Sin esto la fila nacería sin especie y al leer no
      // se sabría si es una persona o un animal.
      constantes: { tipo: 'HUMANO' },
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
      // Esta mitad no tiene identificador propio: **es** la fila del paciente.
      // Se reconoce por `paciente_id`, y por eso el colapso de lectura no la
      // confunde con la mitad clínica, que sí tiene `id`.
      clave: 'paciente_id',
      campos: {
        id: c('paciente_id'),
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
      // v4 · `memberId` no es un campo de `ExamResult`: lo pone quien guarda,
      // que sabe de quién es el examen. Sin él la fila no se puede escribir ni
      // volver a encontrar.
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        examId: c('examen_id'),
        parameterName: c('parametro'),
        value: c('valor'),
        unit: c('unidad'),
        referenceRange: c('rango_referencia'),
        isAbnormal: c('fuera_de_rango', 'booleano'),
        // Bloque N · La bandeja de verificación los rellena siempre; las
        // filas antiguas los traen vacíos y se enseñan como «sin verificar».
        extractionConfidence: c('confianza_extraccion'),
        verifiedBy: c('verificado_por'),
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

  // Bloque J · esquema v5. Hasta aquí estaban en SIN_PESTANA: `SEGUIMIENTOS`
  // es otra cosa (los envíos de una orden), y meterlas ahí dejaba una pestaña
  // que no significaba lo que decía su nombre. Ahora tienen la suya.
  tasks: [
    {
      pestana: 'TAREAS',
      pacienteDesde: 'memberId',
      campos: {
        id: c('id'),
        memberId: c('paciente_id'),
        title: c('titulo'),
        description: c('descripcion'),
        dueDate: c('fecha_limite'),
        status: c('estado'),
        priority: c('prioridad'),
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


  // Bloque D · esquema v6.
  ...DESCRIPTORES_MASCOTAS,
};

/**
 * Colecciones que **no tienen dónde escribir**, y por qué.
 *
 * Sus métodos del repositorio lanzan un error explícito en vez de callar.
 * Lanzar no cuenta como mudo en G1, así que el hueco queda visible el día que
 * alguien lo toque, en vez de tragarse el dato.
 */

export const SIN_PESTANA: Record<string, string> = {
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
  pets: 'Pet',
  petWeights: 'WeightEntry',
  petVaccines: 'VaccineEntry',
  petHistory: 'MedicalHistoryEntry',
  petCare: 'CuidadoMascota',
  petTreatments: 'TratamientoMascota',
  petDoses: 'TomaMascota',
  petReminderStates: 'EstadoRecordatorioMascota',
};
