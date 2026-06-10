/**
 * Google Sheets Operational Database Client Layer
 * Handles the creation of the 15-tab operational database, multi-tab batch gets,
 * and robust mapping of structured rows into domain objects.
 * Scope: https://www.googleapis.com/auth/spreadsheets
 */

// Headers definition for the 15 tabs
export const OPERATIONAL_HEADERS = {
  Config: ['Key', 'Value', 'Description', 'updatedAt'],
  Usuarios: ['id', 'googleId', 'displayName', 'email', 'photoUrl', 'createdAt', 'updatedAt', 'deletedAt'],
  Familias: ['id', 'ownerId', 'name', 'createdAt', 'updatedAt', 'deletedAt'],
  Miembros: [
    'id', 'familyGroupId', 'fullName', 'birthDate', 'relationship', 'bloodType', 'photoUrl', 
    'notes', 'status', 'email', 'canAccessPortal', 'permissionStatus', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt',
    'documentType', 'documentNumber'
  ],
  Permisos: [
    'memberId', 'canManageOwnProfile', 'canManageOwnAppointments', 'canManageOwnDocuments', 
    'canViewOwnHistory', 'canUploadDocuments', 'canExportOwnData', 'canViewFamilyData', 
    'canManageFamilyData', 'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  FichasMedicas: [
    'id', 'memberId', 'allergies', 'chronicConditions', 'currentMedications', 
    'primaryDoctor', 'insuranceInfo', 'emergencyContact', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  Citas: [
    'id', 'memberId', 'doctor', 'doctorName', 'specialty', 'scheduledAt', 'date', 'time', 'location', 'reason', 'notes', 'status', 
    'googleCalendarEventId', 'googleCalendarHtmlLink', 'calendarSyncStatus', 'calendarSyncedAt', 'calendarError', 
    'completedAt', 'retentionStatus', 'retentionReason', 'purgedAt', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt', 'syncStatus',
    'source', 'sourceEmail', 'sourceMessageId', 'sourceSubject', 'medicalOrderId'
  ],
  Controles: [
    'id', 'memberId', 'checkupType', 'scheduledDate', 'completedDate', 'results', 'status', 
    'nextCheckupDate', 'doctorName', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  Vacunas: [
    'id', 'memberId', 'vaccineName', 'dateApplied', 'nextDoseDate', 'batchNumber', 'institution', 
    'doseNumber', 'notes', 'status', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  Examenes: [
    'id', 'memberId', 'examName', 'orderedBy', 'orderedDate', 'performedDate', 'laboratory', 
    'status', 'resultSummary', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  Documentos: [
    'id', 'memberId', 'relatedEventId', 'documentType', 'fileName', 'driveFileId', 'driveUrl', 
    'uploadedAt', 'syncStatus', 'description', 'fileSize', 'mimeType', 'clinicalCategory', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt',
    'sharedWithEmail', 'permissionId', 'sharedAt', 'revokedAt', 'shareStatus', 'shareError'
  ],
  HistorialClinico: [
    'id', 'memberId', 'eventType', 'title', 'description', 'eventDate', 'relatedEntityId', 
    'ownerEmail', 'ownerGoogleId', 'sourceDeviceId', 'createdAt', 'updatedAt', 'deletedAt'
  ],
  Auditoria: ['id', 'timestamp', 'userId', 'userEmail', 'action', 'details', 'deviceId', 'createdAt'],
  Retencion: ['id', 'timestamp', 'actorEmail', 'appointmentsAnalyzed', 'appointmentsPurged', 'reason', 'createdAt'],
  SyncLog: [
    'id', 'timestamp', 'deviceId', 'actorEmail', 'tableName', 'entityId', 
    'actionType', 'fieldName', 'localValue', 'remoteValue', 'resolution', 'createdAt'
  ],
  FuentesCorreoCitas: [
    'id', 'email', 'label', 'enabled', 'createdAt', 'updatedAt', 'lastScannedAt', 'lastScanResult', 'lastError'
  ],
  CandidatosCorreoCitas: [
    'id', 'sourceEmail', 'gmailMessageId', 'subject', 'receivedAt', 'rawSnippet', 
    'detectedPatientName', 'detectedDate', 'detectedTime', 'detectedDoctor', 'detectedSpecialty', 'detectedLocation', 
    'confidence', 'status', 'createdAppointmentId', 'createdAt', 'updatedAt'
  ],
  OrdenesMedicas: [
    'id', 'memberId', 'orderType', 'title', 'description', 'doctorName', 'specialty', 'issuedAt', 'expiresAt', 'requiresAuthorization', 'authorizationStatus', 'authorizationNumber', 'authorizationDate', 'authorizationExpiresAt', 'epsOrProvider', 'ipsOrClinic', 'documentId', 'relatedAppointmentId', 'status', 'notes', 'createdAt', 'updatedAt', 'deletedAt', 'syncStatus', 'ownerEmail', 'ownerGoogleId', 'sourceDeviceId'
  ],
  Medicamentos: [
    'id', 'memberId', 'name', 'dose', 'quantity', 'quantityUnit', 'durationDays', 'frequencyType', 'frequencyIntervalHours', 'specificTimes', 'instructions', 'prescribedBy', 'documentId', 'startDate', 'endDate', 'status', 'googleCalendarEventId', 'calendarSyncStatus', 'calendarSyncedAt', 'calendarError', 'createdAt', 'updatedAt', 'deletedAt', 'syncStatus', 'ownerEmail', 'ownerGoogleId', 'sourceDeviceId'
  ],
  TomasMedicamentos: [
    'id', 'prescriptionId', 'memberId', 'medicationName', 'dose', 'scheduledAt', 'status', 'takenAt', 'notes', 'googleCalendarEventId', 'createdAt', 'updatedAt', 'deletedAt', 'syncStatus', 'ownerEmail', 'ownerGoogleId', 'sourceDeviceId'
  ]
};

// Mapping of code headers names to Tab visual names in Google Sheets
export const OPERATIONAL_TABS = {
  Config: 'Config',
  Usuarios: 'Usuarios',
  Familias: 'Familias',
  Miembros: 'Miembros',
  Permisos: 'Permisos',
  FichasMedicas: 'Fichas Médicas',
  Citas: 'Citas',
  Controles: 'Controles',
  Vacunas: 'Vacunas',
  Examenes: 'Exámenes',
  Documentos: 'Documentos',
  HistorialClinico: 'Historial Clínico',
  Auditoria: 'Auditoría',
  Retencion: 'Retención',
  SyncLog: 'SyncLog',
  FuentesCorreoCitas: 'Fuentes Correo Citas',
  CandidatosCorreoCitas: 'Candidatos Correo Citas',
  OrdenesMedicas: 'Órdenes Médicas',
  Medicamentos: 'Medicamentos',
  TomasMedicamentos: 'Tomas Medicamentos'
};

/**
 * Creates the operational database in Google Sheets with the 15 tabs, column headers, and styling.
 */
export async function createOperationalSpreadsheet(
  accessToken: string,
  ownerEmail: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  
  const title = `Paté Salud Familiar - Base Operacional`;
  const tabsList = Object.values(OPERATIONAL_TABS);

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
    throw new Error(`Failed to create operational spreadsheet: ${err.error?.message || createRes.statusText}`);
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

  // 2. Prepare headers write values
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const dataPayload = Object.entries(OPERATIONAL_TABS).map(([key, tabName]) => {
    const headers = (OPERATIONAL_HEADERS as any)[key];
    return {
      range: `'${tabName}'!A1`,
      values: [headers]
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
    throw new Error(`Failed to write operational headers: ${err.error?.message || writeRes.statusText}`);
  }

  // 3. Formatting requests: Freeze row 1 + style headers + autoResize columns
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
              red: 0.92,
              green: 0.94,
              blue: 0.98
            },
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: {
                red: 0.1,
                green: 0.2,
                blue: 0.5
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
          endIndex: 35
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
    console.warn('Operational formatting request failed:', formatRes.statusText);
  }

  return {
    spreadsheetId,
    spreadsheetUrl
  };
}

/**
 * Ensures all required operational tabs exist in the spreadsheet.
 * If any are missing, they are created and their headers are written.
 */
export async function ensureSpreadsheetSheetsExist(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!getRes.ok) {
    throw new Error(`Failed to check spreadsheet sheets: ${getRes.statusText}`);
  }
  const spreadsheet = await getRes.json();
  const existingTitles = (spreadsheet.sheets || []).map((s: any) => s.properties.title);
  
  const missingTabs: [string, string][] = [];
  Object.entries(OPERATIONAL_TABS).forEach(([key, tabName]) => {
    if (!existingTitles.includes(tabName)) {
      missingTabs.push([key, tabName]);
    }
  });

  if (missingTabs.length === 0) return;

  // 1. Add missing sheets
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const requests = missingTabs.map(([, tabName]) => ({
    addSheet: {
      properties: { title: tabName }
    }
  }));

  const updateRes = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(`Failed to add missing sheets: ${err.error?.message || updateRes.statusText}`);
  }

  // 2. Write headers for the new sheets
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const dataPayload = missingTabs.map(([key, tabName]) => {
    const headers = (OPERATIONAL_HEADERS as any)[key];
    return {
      range: `'${tabName}'!A1`,
      values: [headers]
    };
  });

  const writeRes = await fetch(writeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: dataPayload
    })
  });

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(`Failed to write headers for new sheets: ${err.error?.message || writeRes.statusText}`);
  }
}

/**
 * Migrates existing sheet headers to add any missing columns defined in OPERATIONAL_HEADERS.
 * Appends new columns at the end of the existing header row without touching existing data.
 * Safe to call multiple times — idempotent.
 */
export async function migrateOperationalSheetHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  // Batch-read the header row (row 1) from every operational tab
  const ranges = Object.values(OPERATIONAL_TABS).map(tabName => `'${tabName}'!A1:AZ1`);
  const queryStr = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${queryStr}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.warn('migrateOperationalSheetHeaders: could not read header rows', await res.text());
    return;
  }

  const data = await res.json();
  const valueRanges: any[] = data.valueRanges || [];

  const updateData: { range: string; values: string[][] }[] = [];

  Object.entries(OPERATIONAL_TABS).forEach(([key, tabName]) => {
    const expectedHeaders: string[] = (OPERATIONAL_HEADERS as any)[key] || [];
    const vr = valueRanges.find((v: any) =>
      v.range?.startsWith(`'${tabName}'!`) || v.range?.startsWith(`${tabName}!`)
    );
    const existingHeaders: string[] = vr?.values?.[0] ?? [];

    const missing = expectedHeaders.filter(h => !existingHeaders.includes(h));
    if (missing.length === 0) return;

    // Append missing headers after the last existing column
    const startColIdx = existingHeaders.length; // 0-based
    const colToLetter = (idx: number): string => {
      let s = '';
      let n = idx + 1;
      while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };
    const startCol = colToLetter(startColIdx);
    const endCol = colToLetter(startColIdx + missing.length - 1);

    updateData.push({
      range: `'${tabName}'!${startCol}1:${endCol}1`,
      values: [missing]
    });
  });

  if (updateData.length === 0) return;

  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const writeRes = await fetch(writeUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updateData })
  });

  if (!writeRes.ok) {
    console.warn('migrateOperationalSheetHeaders: failed to write missing headers', await writeRes.text());
  }
}

/**
 * Reads all rows from all tabs in the operational spreadsheet and maps them to JSON objects.
 */
export async function readAllOperationalTables(
  accessToken: string,
  spreadsheetId: string
): Promise<any> {
  // Ensure all tabs exist before reading
  await ensureSpreadsheetSheetsExist(accessToken, spreadsheetId).catch(err => {
    console.warn('Failed to ensure spreadsheet sheets exist:', err);
  });

  // Migrate headers for any new columns (e.g. documentType, documentNumber)
  await migrateOperationalSheetHeaders(accessToken, spreadsheetId).catch(err => {
    console.warn('Failed to migrate operational sheet headers:', err);
  });
  const ranges = Object.values(OPERATIONAL_TABS).map(tabName => `'${tabName}'!A1:AZ5000`);
  const queryStr = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${queryStr}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to read operational tables: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const valueRanges = data.valueRanges || [];
  const state: any = {};

  // For each tab key, parse the values
  Object.entries(OPERATIONAL_TABS).forEach(([key, tabName], index) => {
    const valueRange = valueRanges.find((vr: any) => vr.range.startsWith(`'${tabName}'!`) || vr.range.startsWith(`${tabName}!`));
    const rows = valueRange ? valueRange.values || [] : [];
    
    if (rows.length <= 1) {
      state[key] = [];
      return;
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    state[key] = dataRows.map((row: any[]) => {
      const obj: any = {};
      
      // Initialize all expected headers with null for schema migration compatibility
      const expectedHeaders = (OPERATIONAL_HEADERS as any)[key] || [];
      expectedHeaders.forEach((h: string) => {
        obj[h] = null;
      });

      headers.forEach((header: string, colIdx: number) => {
        let val = row[colIdx];
        if (val === undefined || val === '') {
          val = null;
        }
        
        // Parse arrays/booleans if needed
        if (val !== null) {
          if (val === 'TRUE') val = true;
          else if (val === 'FALSE') val = false;
          else if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
            try {
              val = JSON.parse(val);
            } catch (_) {}
          }
        }
        obj[header] = val;
      });
      return obj;
    });
  });

  return state;
}

/**
 * Helper to serialize nested structures (e.g. string arrays in health profile) for sheets cell output
 */
function serializeValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}

/**
 * Overwrites all operational sheets with the current structured state data.
 */
export async function writeAllOperationalTables(
  accessToken: string,
  spreadsheetId: string,
  state: any
): Promise<void> {
  // Ensure all tabs exist before writing
  await ensureSpreadsheetSheetsExist(accessToken, spreadsheetId).catch(err => {
    console.warn('Failed to ensure spreadsheet sheets exist:', err);
  });

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  
  const dataPayload = Object.entries(OPERATIONAL_TABS).map(([key, tabName]) => {
    const headers = (OPERATIONAL_HEADERS as any)[key];
    const entities = state[key] || [];

    // Map each entity to a row array matching the header positions
    const rows = [
      headers,
      ...entities.map((ent: any) => 
        headers.map((h: string) => serializeValue(ent[h]))
      )
    ];

    return {
      range: `'${tabName}'!A1:AZ${rows.length + 1}`,
      values: rows
    };
  });

  const res = await fetch(url, {
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

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to write operational tables: ${err.error?.message || res.statusText}`);
  }
}

// ── MEMBER SPECIFIC INDIVIDUAL REPORTS ───────────────────────────────────────────

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

