/**
 * El informe clínico individual que el titular comparte con un familiar.
 *
 * Crea un libro nuevo en el Drive del titular y lo rellena. Sobrevive a la
 * retirada de la hoja operacional al cerrar G4 porque no tiene nada que ver
 * con ella: es un documento de salida, no la base de datos.
 *
 * Basta `drive.file`. Google permite crear y escribir con la API de Sheets los
 * ficheros que crea la propia aplicación; `spreadsheets` —sensible, y con
 * acceso a TODAS las hojas de la cuenta— ya no se pide.
 */

export const REPORT_HEADERS = {
  ResumenIndividual: ['Campo', 'Valor', 'Descripción'],
  FichaMedica: ['Campo de Ficha', 'Detalle'],
  Citas: ['Médico', 'Especialidad', 'Fecha y Hora', 'Ubicación', 'Motivo', 'Notas', 'Estado', 'Enlace Google Calendar'],
  Controles: ['Tipo de Control', 'Fecha Programada', 'Fecha Completado', 'Resultados', 'Estado', 'Próxima Cita', 'Médico'],
  Vacunas: ['Vacuna', 'Fecha Aplicada', 'Próxima Dosis', 'Lote', 'Institución', 'Número de Dosis', 'Notas', 'Estado'],
  Examenes: ['Examen', 'Ordenado Por', 'Fecha Ordenado', 'Fecha Realizado', 'Laboratorio', 'Estado', 'Resumen de Resultados'],
  Documentos: ['Nombre del Archivo', 'Tipo de Documento', 'Categoría', 'Fecha de Carga', 'Tamaño (KB)', 'Estado Sinc.', 'Enlace Drive'],
  HistorialClinico: ['Tipo de Evento', 'Título', 'Descripción', 'Fecha del Evento', 'Fecha de Registro'],
  Recordatorios: ['Título', 'Descripción', 'Fecha Límite', 'Tipo', 'Estado']
};

export const REPORT_TABS = {
  ResumenIndividual: 'Resumen Individual',
  FichaMedica: 'Ficha Médica',
  Citas: 'Citas',
  Controles: 'Controles',
  Vacunas: 'Vacunas',
  Examenes: 'Exámenes',
  Documentos: 'Documentos',
  HistorialClinico: 'Historial Clínico',
  Recordatorios: 'Recordatorios'
};

export async function createIndividualMemberReport(
  accessToken: string,
  memberName: string,
  memberData: {
    member: any;
    healthProfile: any;
    appointments: any[];
    checkups: any[];
    vaccines: any[];
    exams: any[];
    documents: any[];
    history: any[];
    reminders: any[];
  }
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const dateStr = new Date().toISOString().split('T')[0];
  const title = `Paté Salud Familiar - Reporte ${memberName} - ${dateStr}`;
  const tabsList = Object.values(REPORT_TABS);

  // 1. Create Spreadsheet
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: tabsList.map(title => ({ properties: { title } }))
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(`Failed to create member report spreadsheet: ${err.error?.message || createRes.statusText}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  // Map sheet title to sheetId for formatting requests
  const sheetMetadata: Record<string, number> = {};
  if (spreadsheet.sheets) {
    spreadsheet.sheets.forEach((s: any) => {
      sheetMetadata[s.properties.title] = s.properties.sheetId;
    });
  }

  // 2. Prepare Data values
  const resumenRows = [
    REPORT_HEADERS.ResumenIndividual,
    ['Familiar', memberData.member.fullName, 'Nombre completo del miembro familiar'],
    ['Parentesco', memberData.member.relationship, 'Relación de parentesco con el titular'],
    ['Fecha Nacimiento', memberData.member.birthDate, 'Fecha de nacimiento del miembro'],
    ['Correo Electrónico', memberData.member.email || 'No configurado', 'Correo registrado para acceso al portal'],
    ['Estado en Portal', memberData.member.permissionStatus || 'Sin invitar', 'Estado de la invitación al portal de salud'],
    ['Tipo de Sangre', memberData.member.bloodType || 'Desconocido', 'Grupo sanguíneo del miembro'],
    ['Citas Programadas', String(memberData.appointments.filter(a => a.status === 'SCHEDULED').length), 'Citas médicas pendientes'],
    ['Vacunas Aplicadas', String(memberData.vaccines.filter(v => v.status === 'COMPLETED').length), 'Vacunas completadas registradas'],
    ['Documentos en Drive', String(memberData.documents.filter(d => d.syncStatus === 'SYNCED').length), 'Archivos clínicos subidos exitosamente'],
    ['Fecha Generación', new Date().toLocaleString('es-CO'), 'Marca de tiempo en la que se generó este reporte']
  ];

  const fm = memberData.healthProfile;
  const fichaRows = [
    REPORT_HEADERS.FichaMedica,
    ['Alergias', fm?.allergies ? fm.allergies.join(', ') : 'Ninguna registrada'],
    ['Condiciones Crónicas', fm?.chronicConditions ? fm.chronicConditions.join(', ') : 'Ninguna registrada'],
    ['Medicamentos Actuales', fm?.currentMedications ? fm.currentMedications.join(', ') : 'Ninguno registrado'],
    ['Médico de Cabecera', fm?.primaryDoctor || 'No asignado'],
    ['Información del Seguro', fm?.insuranceInfo || 'No configurada'],
    ['Contacto de Emergencia', fm?.emergencyContact || 'No configurado'],
    ['Última Actualización', fm?.lastUpdated || 'Nunca']
  ];

  const apptRows = [
    REPORT_HEADERS.Citas,
    ...memberData.appointments.map(a => [
      a.doctorName,
      a.specialty,
      a.scheduledAt,
      a.location || '',
      a.reason,
      a.notes || '',
      a.status,
      a.googleCalendarHtmlLink || ''
    ])
  ];

  const checkupRows = [
    REPORT_HEADERS.Controles,
    ...memberData.checkups.map(c => [
      c.checkupType,
      c.scheduledDate,
      c.completedDate || '',
      c.results || '',
      c.status,
      c.nextCheckupDate || '',
      c.doctorName || ''
    ])
  ];

  const vaccineRows = [
    REPORT_HEADERS.Vacunas,
    ...memberData.vaccines.map(v => [
      v.vaccineName,
      v.dateApplied,
      v.nextDoseDate || '',
      v.batchNumber || '',
      v.institution || '',
      String(v.doseNumber),
      v.notes || '',
      v.status
    ])
  ];

  const examRows = [
    REPORT_HEADERS.Examenes,
    ...memberData.exams.map(e => [
      e.examName,
      e.orderedBy || '',
      e.orderedDate,
      e.performedDate || '',
      e.laboratory || '',
      e.status,
      e.resultSummary || ''
    ])
  ];

  const docRows = [
    REPORT_HEADERS.Documentos,
    ...memberData.documents.map(d => [
      d.fileName,
      d.documentType,
      d.clinicalCategory || '',
      d.uploadedAt,
      d.fileSize ? `${Math.round(d.fileSize / 1024)}` : '',
      d.syncStatus,
      d.driveUrl || ''
    ])
  ];

  const historyRows = [
    REPORT_HEADERS.HistorialClinico,
    ...memberData.history.map(h => [
      h.eventType,
      h.title,
      h.description || '',
      h.eventDate,
      h.createdAt
    ])
  ];

  const reminderRows = [
    REPORT_HEADERS.Recordatorios,
    ...memberData.reminders.map(r => [
      r.title,
      r.description || '',
      r.dueDate,
      r.reminderType,
      r.status
    ])
  ];

  const dataMap = {
    ResumenIndividual: resumenRows,
    FichaMedica: fichaRows,
    Citas: apptRows,
    Controles: checkupRows,
    Vacunas: vaccineRows,
    Examenes: examRows,
    Documentos: docRows,
    HistorialClinico: historyRows,
    Recordatorios: reminderRows
  };

  // 3. Write data to all tabs
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const dataPayload = Object.entries(REPORT_TABS).map(([key, tabName]) => {
    const rows = (dataMap as any)[key] || [];
    return {
      range: `'${tabName}'!A1`,
      values: rows
    };
  });

  const writeRes = await fetch(writeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: dataPayload
    })
  });

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(`Failed to write member report values: ${err.error?.message || writeRes.statusText}`);
  }

  // 4. Formatting requests: Freeze row 1 + style headers + autoResize columns
  const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const requests: any[] = [];

  tabsList.forEach(tabName => {
    const sheetId = sheetMetadata[tabName];
    if (sheetId === undefined) return;

    // Freeze top row
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    });

    // Apply bold + soft blue background color (#EAEFFC) to row 1
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.9,
              green: 0.95,
              blue: 0.94
            },
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: {
                red: 0.05,
                green: 0.37,
                blue: 0.34
              }
            }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat(bold,fontSize,foregroundColor))'
      }
    });

    // Auto-size columns to be readable
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 15
        }
      }
    });
  });

  const formatRes = await fetch(formatUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  });

  if (!formatRes.ok) {
    console.warn('Report formatting request failed:', formatRes.statusText);
  }

  return {
    spreadsheetId,
    spreadsheetUrl
  };
}

