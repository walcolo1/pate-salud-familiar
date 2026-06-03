import { 
  UserAccount, 
  FamilyGroup, 
  FamilyMember, 
  HealthProfile, 
  MedicalAppointment, 
  PeriodicCheckup, 
  VaccineRecord, 
  MedicalExam, 
  ExamResult, 
  ClinicalDocument, 
  MedicalHistoryEvent, 
  Reminder, 
  FollowUpTask 
} from '../domain/models';

export const mockUser: UserAccount = {
  id: 'user-001',
  displayName: 'Carlos Galviz',
  email: 'carlos.galviz@gmail.com',
  photoUrl: null,
  createdAt: new Date(2026, 0, 15).toISOString()
};

export const mockFamilyGroup: FamilyGroup = {
  id: 'family-001',
  ownerId: 'user-001',
  name: 'Familia Galviz',
  createdAt: new Date(2026, 0, 15).toISOString()
};

export const mockMembers: FamilyMember[] = [
  {
    id: 'member-001',
    familyGroupId: 'family-001',
    fullName: 'Carlos Galviz',
    birthDate: '1985-03-15',
    relationship: 'SELF',
    bloodType: 'O_POSITIVE',
    notes: 'Hipertensión leve controlada'
  },
  {
    id: 'member-002',
    familyGroupId: 'family-001',
    fullName: 'María Galviz',
    birthDate: '1988-07-22',
    relationship: 'SPOUSE',
    bloodType: 'A_POSITIVE',
    notes: null
  },
  {
    id: 'member-003',
    familyGroupId: 'family-001',
    fullName: 'Valentina Galviz',
    birthDate: '2015-11-08',
    relationship: 'CHILD',
    bloodType: 'O_POSITIVE',
    notes: 'Alergia severa a la penicilina'
  }
];

export const mockHealthProfiles: Record<string, HealthProfile> = {
  'member-001': {
    id: 'hp-001',
    memberId: 'member-001',
    allergies: ['Ibuprofeno'],
    chronicConditions: ['Hipertensión arterial leve'],
    currentMedications: ['Losartán 50mg - 1 comprimido diario'],
    primaryDoctor: 'Dr. Ramírez - Cardiología',
    insuranceInfo: 'EPS Sura - Afiliación 12345678',
    emergencyContact: 'María Galviz - 300-123-4567',
    lastUpdated: new Date(2026, 4, 28).toISOString()
  },
  'member-002': {
    id: 'hp-002',
    memberId: 'member-002',
    allergies: [],
    chronicConditions: [],
    currentMedications: [],
    primaryDoctor: 'Dra. López - Medicina General',
    insuranceInfo: 'EPS Sura - Afiliación 87654321',
    emergencyContact: 'Carlos Galviz - 300-987-6543',
    lastUpdated: new Date(2026, 4, 15).toISOString()
  },
  'member-003': {
    id: 'hp-003',
    memberId: 'member-003',
    allergies: ['Penicilina'],
    chronicConditions: [],
    currentMedications: [],
    primaryDoctor: 'Dr. Martínez - Pediatría',
    insuranceInfo: 'EPS Sura - Afiliación 11223344',
    emergencyContact: 'Carlos Galviz - 300-123-4567',
    lastUpdated: new Date(2026, 4, 29).toISOString()
  }
};

export const mockAppointments: MedicalAppointment[] = [
  {
    id: 'appt-001',
    memberId: 'member-001',
    doctorName: 'Dr. Ramírez',
    specialty: 'Cardiología',
    scheduledAt: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(), // 7 days from now
    location: 'Clínica Shaio - Bogotá',
    reason: 'Control rutinario de hipertensión',
    notes: 'Llevar último reporte de electrocardiograma.',
    status: 'SCHEDULED',
    documentIds: []
  },
  {
    id: 'appt-002',
    memberId: 'member-003',
    doctorName: 'Dr. Martínez',
    specialty: 'Pediatría',
    scheduledAt: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString(), // 14 days from now
    location: 'Consultorio Pediasalud',
    reason: 'Control de crecimiento y desarrollo',
    notes: 'Llevar carnet de vacunas físico.',
    status: 'SCHEDULED',
    documentIds: []
  },
  {
    id: 'appt-003',
    memberId: 'member-002',
    doctorName: 'Dra. López',
    specialty: 'Ginecología',
    scheduledAt: new Date(new Date().setDate(new Date().getDate() - 10)).toISOString(), // 10 days ago
    location: 'Edificio Clínico 100',
    reason: 'Chequeo anual preventivo',
    notes: 'Examen de rutina.',
    status: 'COMPLETED',
    documentIds: ['doc-002']
  }
];

export const mockCheckups: PeriodicCheckup[] = [
  {
    id: 'chk-001',
    memberId: 'member-001',
    checkupType: 'Chequeo Cardiovascular Anual',
    scheduledDate: '2026-06-15',
    status: 'SCHEDULED',
    nextCheckupDate: '2027-06-15',
    doctorName: 'Dr. Ramírez'
  },
  {
    id: 'chk-002',
    memberId: 'member-003',
    checkupType: 'Control Odontológico Preventivo',
    scheduledDate: '2026-05-10',
    completedDate: '2026-05-10',
    results: 'Limpieza e higiene bucal completa. Sin hallazgo de caries.',
    status: 'COMPLETED',
    nextCheckupDate: '2026-11-10',
    doctorName: 'Dra. Restrepo'
  }
];

export const mockVaccines: VaccineRecord[] = [
  {
    id: 'vac-001',
    memberId: 'member-003',
    vaccineName: 'Triple Viral (SRP)',
    dateApplied: '2020-11-12',
    institution: 'Centro de Salud Niza EPS',
    doseNumber: 2,
    notes: 'Refuerzo de los 5 años aplicado correctamente.',
    status: 'COMPLETED'
  },
  {
    id: 'vac-002',
    memberId: 'member-003',
    vaccineName: 'Influenza Estacional',
    dateApplied: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0], // 3 days from now
    institution: 'Cruz Roja Seccional Bogotá',
    doseNumber: 1,
    notes: 'Dosis anual programada.',
    status: 'SCHEDULED'
  }
];

export const mockExams: MedicalExam[] = [
  {
    id: 'exam-001',
    memberId: 'member-001',
    examName: 'Hemograma Completo & Perfil Lipídico',
    orderedBy: 'Dr. Ramírez',
    orderedDate: '2026-05-02',
    performedDate: '2026-05-04',
    laboratory: 'Laboratorio Clínico Sura Niza',
    status: 'COMPLETED',
    resultSummary: 'Colesterol levemente elevado. Resto de parámetros normales.',
    documentIds: ['doc-001']
  }
];

export const mockExamResults: Record<string, ExamResult[]> = {
  'exam-001': [
    {
      id: 'res-001',
      examId: 'exam-001',
      parameterName: 'Hemoglobina',
      value: '14.2',
      unit: 'g/dL',
      referenceRange: '13.8 - 17.2',
      isAbnormal: false,
      recordedAt: '2026-05-04T10:30:00Z'
    },
    {
      id: 'res-002',
      examId: 'exam-001',
      parameterName: 'Colesterol Total',
      value: '240',
      unit: 'mg/dL',
      referenceRange: 'Menos de 200',
      isAbnormal: true,
      recordedAt: '2026-05-04T10:30:00Z'
    },
    {
      id: 'res-003',
      examId: 'exam-001',
      parameterName: 'Triglicéridos',
      value: '145',
      unit: 'mg/dL',
      referenceRange: 'Menos de 150',
      isAbnormal: false,
      recordedAt: '2026-05-04T10:30:00Z'
    }
  ]
};

export const mockDocuments: ClinicalDocument[] = [
  {
    id: 'doc-001',
    memberId: 'member-001',
    relatedEventId: 'exam-001',
    documentType: 'LAB_RESULT',
    fileName: 'Examenes_Lipidos_Carlos_04052026.pdf',
    driveFileId: 'drive-file-9988',
    driveUrl: 'https://drive.google.com/file/d/1A2B3C4D5E/view',
    uploadedAt: new Date(2026, 4, 4).toISOString(),
    syncStatus: 'SYNCED',
    description: 'Resultados perfil lipídico completo.'
  },
  {
    id: 'doc-002',
    memberId: 'member-002',
    relatedEventId: 'appt-003',
    documentType: 'PRESCRIPTION',
    fileName: 'Formula_Medica_Maria_Lara.pdf',
    driveFileId: 'drive-file-8877',
    driveUrl: 'https://drive.google.com/file/d/1X2Y3Z4W5V/view',
    uploadedAt: new Date(2026, 4, 19).toISOString(),
    syncStatus: 'SYNCED',
    description: 'Fórmula y órdenes médicas preventivas ginecología.'
  }
];

export const mockHistory: MedicalHistoryEvent[] = [
  {
    id: 'hist-001',
    memberId: 'member-001',
    eventType: 'APPOINTMENT',
    title: 'Cita con Cardiología',
    description: 'Control de presión arterial. Recetado Losartán 50mg.',
    eventDate: '2026-02-10',
    createdAt: new Date(2026, 1, 10).toISOString()
  },
  {
    id: 'hist-002',
    memberId: 'member-003',
    eventType: 'VACCINE',
    title: 'Aplicación vacuna Triple Viral',
    description: 'Segunda dosis aplicada en Centro de Salud Niza.',
    eventDate: '2020-11-12',
    createdAt: new Date(2020, 10, 12).toISOString()
  },
  {
    id: 'hist-003',
    memberId: 'member-001',
    eventType: 'EXAM',
    title: 'Examen Perfil Lipídico',
    description: 'Colesterol Total en 240 mg/dL (Alto). Se sugiere cambio de dieta.',
    eventDate: '2026-05-04',
    createdAt: new Date(2026, 4, 4).toISOString()
  }
];

export const mockReminders: Reminder[] = [
  {
    id: 'rem-001',
    memberId: 'member-001',
    title: 'Losartán 50mg (Hipertensión)',
    description: 'Tomar 1 comprimido diario en la mañana.',
    dueDate: new Date(new Date().setHours(8, 0, 0)).toISOString(), // 8:00 AM today
    reminderType: 'MEDICATION',
    status: 'PENDING'
  },
  {
    id: 'rem-002',
    memberId: 'member-003',
    title: 'Control de crecimiento pediátrico',
    description: 'Asistir con el pediatra Dr. Martínez en Consultorio Pediasalud.',
    dueDate: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString(),
    reminderType: 'APPOINTMENT',
    status: 'PENDING'
  },
  {
    id: 'rem-003',
    memberId: 'member-001',
    title: 'Chequeo Cardiológico programado',
    description: 'Cita con Dr. Ramírez en Clínica Shaio.',
    dueDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), // Yesterday
    reminderType: 'APPOINTMENT',
    status: 'OVERDUE'
  }
];

export const mockTasks: FollowUpTask[] = [
  {
    id: 'tsk-001',
    memberId: 'member-001',
    title: 'Reclamar medicamentos en farmacia EPS',
    description: 'Losartán 50mg y multivitamínico familiar.',
    createdAt: new Date().toISOString(),
    dueDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0], // 3 days from now
    status: 'PENDING',
    priority: 'HIGH'
  },
  {
    id: 'tsk-002',
    memberId: 'member-003',
    title: 'Programar cita de odontopediatría',
    description: 'Control semestral preventivo de higiene bucal.',
    createdAt: new Date().toISOString(),
    dueDate: new Date(new Date().setDate(new Date().getDate() + 10)).toISOString().split('T')[0],
    status: 'PENDING',
    priority: 'MEDIUM'
  }
];
