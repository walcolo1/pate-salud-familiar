/**
 * Google Sheets API Client Layer
 * Handles authentication requests, spreadsheet creation, tabular mapping, and batch updates.
 * Scope: https://www.googleapis.com/auth/spreadsheets
 */

let tokenClient: any = null;
let tokenCallback: ((token: string) => void) | null = null;
let tokenErrorCallback: ((err: any) => void) | null = null;

// Translation mappings for user-friendly sheets output
const relationshipMap: Record<string, string> = {
  SELF: 'Titular',
  SPOUSE: 'Cónyuge',
  CHILD: 'Hijo/a',
  PARENT: 'Padre/Madre',
  SIBLING: 'Hermano/a',
  GRANDPARENT: 'Abuelo/a',
  OTHER: 'Otro'
};

const bloodTypeMap: Record<string, string> = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A-',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B-',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB-',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O-',
  UNKNOWN: 'Desconocido'
};

const statusMap: Record<string, string> = {
  SCHEDULED: 'Programado',
  COMPLETED: 'Completado / Realizado',
  CANCELLED: 'Cancelado',
  OVERDUE: 'Vencido',
  IN_FOLLOW_UP: 'En seguimiento'
};

const syncStatusMap: Record<string, string> = {
  LOCAL_ONLY: 'Local (Sin respaldo)',
  SYNCED: 'Sincronizado',
  PENDING_SYNC: 'Pendiente',
  SYNC_ERROR: 'Error de Sincronización'
};

const docTypeMap: Record<string, string> = {
  PDF: 'Archivo PDF',
  IMAGE: 'Imagen Médica',
  LAB_RESULT: 'Resultado de Laboratorio',
  PRESCRIPTION: 'Fórmula Médica',
  CERTIFICATE: 'Certificado Médico',
  MEDICAL_ORDER: 'Orden de Examen',
  OTHER: 'Otro'
};

/**
 * Triggers the Google Identity Services popup to request spreadsheets permissions.
 * Keeps the token in memory and returns it via a Promise.
 */
export function requestSheetsPermission(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Cannot request permission on server side.'));
    }

    if (!(window as any).google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services library is not loaded.'));
    }

    tokenCallback = resolve;
    tokenErrorCallback = reject;

    try {
      if (!tokenClient) {
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          callback: (response: any) => {
            if (response.error) {
              tokenErrorCallback?.(response);
            } else if (response.access_token) {
              tokenCallback?.(response.access_token);
            } else {
              tokenErrorCallback?.(new Error('No access token returned.'));
            }
          },
        });
      }

      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Exports all family clinical logs into a formatted multi-tab Google Sheet.
 */
export async function exportFamilyHealthWorkbook(
  accessToken: string,
  state: any,
  ownerName: string,
  ownerEmail: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  
  const dateStr = new Date().toISOString().split('T')[0];
  const title = `Paté Salud Familiar - Expediente Familiar - ${dateStr}`;

  // 1. Create Spreadsheet with 10 tabs
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const tabsList = [
    'Resumen Familiar',
    'Miembros',
    'Fichas Médicas',
    'Citas',
    'Controles',
    'Vacunas',
    'Exámenes',
    'Documentos',
    'Historial Clínico',
    'Recordatorios'
  ];

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
    throw new Error(`Failed to create spreadsheet: ${err.error?.message || createRes.statusText}`);
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

  // 2. Prepare Data Arrays
  const memberNameMap: Record<string, string> = {};
  state.members.forEach((m: any) => {
    memberNameMap[m.id] = m.fullName;
  });

  // Tab 1: Resumen Familiar
  const activeRemindersCount = state.reminders.filter((r: any) => r.status === 'PENDING' || r.status === 'OVERDUE').length;
  const summaryValues = [
    ['Métrica / Indicador', 'Detalle'],
    ['Fecha de exportación', new Date().toLocaleString('es-CO')],
    ['Nombre del titular', ownerName],
    ['Correo del titular', ownerEmail],
    ['Número de familiares registrados', state.members.length.toString()],
    ['Número total de citas médicas', state.appointments.length.toString()],
    ['Número total de controles periódicos', state.checkups.length.toString()],
    ['Número total de vacunas aplicadas/pendientes', state.vaccines.length.toString()],
    ['Número total de exámenes clínicos', state.exams.length.toString()],
    ['Número total de documentos en la app', state.documents.length.toString()],
    ['Recordatorios activos pendientes', activeRemindersCount.toString()],
    ['Origen de datos', 'Paté Salud Familiar App']
  ];

  // Tab 2: Miembros
  const membersValues = [
    ['Nombre Completo', 'Parentesco', 'Fecha de Nacimiento', 'Grupo Sanguíneo', 'Correo electrónico', 'Estado de cuenta', 'Notas Especiales']
  ];
  state.members.forEach((m: any) => {
    membersValues.push([
      m.fullName,
      relationshipMap[m.relationship] || m.relationship,
      m.birthDate,
      m.bloodType ? (bloodTypeMap[m.bloodType] || m.bloodType) : 'No asignado',
      m.email || 'No asignado',
      (m.status || 'ACTIVE') === 'INACTIVE' ? 'Inactivo' : 'Activo',
      m.notes || 'Ninguna'
    ]);
  });

  // Tab 3: Fichas Médicas
  const healthValues = [
    ['Familiar', 'Alergias', 'Condiciones Crónicas', 'Medicamentos de Rutina', 'Médico de Cabecera', 'Seguro / EPS', 'Contacto de Emergencia', 'Última Actualización']
  ];
  state.members.forEach((m: any) => {
    const profile = state.healthProfiles[m.id];
    if (profile) {
      healthValues.push([
        m.fullName,
        profile.allergies.join(', ') || 'Ninguna',
        profile.chronicConditions.join(', ') || 'Ninguna',
        profile.currentMedications.join(', ') || 'Ninguno',
        profile.primaryDoctor || 'No asignado',
        profile.insuranceInfo || 'No asignado',
        profile.emergencyContact || 'No asignado',
        profile.lastUpdated ? new Date(profile.lastUpdated).toLocaleDateString('es-CO') : 'Sin fecha'
      ]);
    }
  });

  // Tab 4: Citas
  const apptsValues = [
    ['Familiar', 'Médico', 'Especialidad', 'Fecha Programada', 'Fecha de Realización', 'Lugar', 'Motivo de Consulta', 'Indicaciones / Notas', 'Estado', 'Retención', 'Sincronizado Calendar', 'Enlace Google Calendar']
  ];
  state.appointments.forEach((a: any) => {
    apptsValues.push([
      memberNameMap[a.memberId] || 'Desconocido',
      a.doctorName,
      a.specialty,
      a.scheduledAt.replace('T', ' '),
      a.completedAt ? a.completedAt.replace('T', ' ').split('.')[0] : 'Pendiente',
      a.location || 'No asignado',
      a.reason,
      a.notes || 'Ninguna',
      statusMap[a.status] || a.status,
      a.retentionStatus === 'PURGED' ? 'DEPURADA' : 'Activa',
      a.calendarSyncStatus === 'SYNCED' ? 'Sincronizado' : 'Local / No sincronizado',
      a.googleCalendarHtmlLink || 'N/A'
    ]);
  });

  // Tab 5: Controles
  const checkupsValues = [
    ['Familiar', 'Tipo de Control / Chequeo', 'Fecha Planificada', 'Fecha Completada', 'Resultados y Hallazgos', 'Médico', 'Estado']
  ];
  state.checkups.forEach((c: any) => {
    checkupsValues.push([
      memberNameMap[c.memberId] || 'Desconocido',
      c.checkupType,
      c.scheduledDate,
      c.completedDate || 'Pendiente',
      c.results || 'Ninguno',
      c.doctorName || 'No asignado',
      statusMap[c.status] || c.status
    ]);
  });

  // Tab 6: Vacunas
  const vaccinesValues = [
    ['Familiar', 'Vacuna', 'Dosis No.', 'Fecha de Aplicación', 'Punto de Vacunación', 'Próximo Refuerzo', 'Indicaciones / Reacciones', 'Estado']
  ];
  state.vaccines.forEach((v: any) => {
    vaccinesValues.push([
      memberNameMap[v.memberId] || 'Desconocido',
      v.vaccineName,
      v.doseNumber.toString(),
      v.dateApplied,
      v.institution || 'No asignado',
      v.nextDoseDate || 'Ninguno programado',
      v.notes || 'Ninguna',
      statusMap[v.status] || v.status
    ]);
  });

  // Tab 7: Exámenes
  const examsValues = [
    ['Familiar', 'Examen Clínico', 'Ordenado Por', 'Fecha de Orden', 'Fecha Realización', 'Laboratorio', 'Resultados Resumen']
  ];
  state.exams.forEach((e: any) => {
    examsValues.push([
      memberNameMap[e.memberId] || 'Desconocido',
      e.examName,
      e.orderedBy || 'No asignado',
      e.orderedDate,
      e.performedDate || 'No registrado',
      e.laboratory || 'No asignado',
      e.resultSummary || 'Estables'
    ]);
  });

  // Tab 8: Documentos
  const docsValues = [
    ['Familiar', 'Nombre del Archivo en App', 'Tipo de Documento', 'Categoría Clínica', 'Fecha de Carga', 'Tamaño (KB)', 'Estado Sincronización', 'Enlace Google Drive']
  ];
  state.documents.forEach((d: any) => {
    docsValues.push([
      memberNameMap[d.memberId] || 'Desconocido',
      d.fileName,
      docTypeMap[d.documentType] || d.documentType,
      d.clinicalCategory || 'N/A',
      new Date(d.uploadedAt).toLocaleDateString('es-CO'),
      d.fileSize ? Math.round(d.fileSize / 1024).toString() : '0',
      syncStatusMap[d.syncStatus] || d.syncStatus,
      d.driveUrl || 'N/A'
    ]);
  });

  // Tab 9: Historial Clínico
  const historyValues = [
    ['Familiar', 'Tipo de Evento', 'Título de Suceso', 'Descripción / Detalle', 'Fecha Evento', 'Registrado el']
  ];
  state.history.forEach((h: any) => {
    historyValues.push([
      memberNameMap[h.memberId] || 'Desconocido',
      h.eventType,
      h.title,
      h.description || 'Sin descripción',
      h.eventDate,
      new Date(h.createdAt).toLocaleDateString('es-CO')
    ]);
  });

  // Tab 10: Recordatorios
  const remindersValues = [
    ['Familiar', 'Título del Recordatorio', 'Descripción', 'Fecha Límite / Alarma', 'Tipo', 'Estado']
  ];
  state.reminders.forEach((r: any) => {
    remindersValues.push([
      memberNameMap[r.memberId] || 'Desconocido',
      r.title,
      r.description || 'Ninguna',
      r.dueDate.replace('T', ' '),
      r.reminderType,
      r.status === 'DONE' ? 'Completado' : r.status === 'OVERDUE' ? 'VENCIDO' : 'Pendiente'
    ]);
  });

  // 3. Batch Update Values
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const dataPayload = [
    { range: "'Resumen Familiar'!A1", values: summaryValues },
    { range: "'Miembros'!A1", values: membersValues },
    { range: "'Fichas Médicas'!A1", values: healthValues },
    { range: "'Citas'!A1", values: apptsValues },
    { range: "'Controles'!A1", values: checkupsValues },
    { range: "'Vacunas'!A1", values: vaccinesValues },
    { range: "'Exámenes'!A1", values: examsValues },
    { range: "'Documentos'!A1", values: docsValues },
    { range: "'Historial Clínico'!A1", values: historyValues },
    { range: "'Recordatorios'!A1", values: remindersValues }
  ];

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
    throw new Error(`Failed to write cell values: ${err.error?.message || writeRes.statusText}`);
  }

  // 4. Formatting requests: Freeze row 1 + style headers + autoResize columns
  const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const requests: any[] = [];

  tabsList.forEach(tabName => {
    const sheetId = sheetMetadata[tabName];
    if (sheetId === undefined) return;

    // A. Freeze top row
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

    // B. Apply bold + soft green-teal background color (#E6F4F1) to row 1
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
              blue: 0.95
            },
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: {
                red: 0.05,
                green: 0.3,
                blue: 0.3
              }
            }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat(bold,fontSize,foregroundColor))'
      }
    });

    // C. Auto-size columns to be readable
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
    console.warn('Formatting request failed:', formatRes.statusText);
    // Do not crash the app if formatting fails, sheet was already written
  }

  return {
    spreadsheetId,
    spreadsheetUrl
  };
}
