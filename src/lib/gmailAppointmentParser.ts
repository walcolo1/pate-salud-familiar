import { FamilyMember } from '../domain/models';

export interface ParsedAppointmentDetails {
  detectedPatientName: string | null;
  detectedDate: string | null;
  detectedTime: string | null;
  detectedDoctor: string | null;
  detectedSpecialty: string | null;
  detectedLocation: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const MONTHS_MAP: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12'
};

export function parseAppointmentEmail(
  subject: string,
  bodyText: string,
  members: FamilyMember[]
): ParsedAppointmentDetails {
  const combinedText = `${subject} ${bodyText}`;
  const lowercaseText = combinedText.toLowerCase();

  // 1. Detect Patient
  let detectedPatientName: string | null = null;
  let matchedMember: FamilyMember | null = null;

  // Try matching full names first
  for (const m of members) {
    if (m.status !== 'DELETED') {
      const fullNameLower = m.fullName.toLowerCase();
      if (lowercaseText.includes(fullNameLower)) {
        detectedPatientName = m.fullName;
        matchedMember = m;
        break;
      }
    }
  }

  // Try matching first names if no full name match
  if (!detectedPatientName) {
    for (const m of members) {
      if (m.status !== 'DELETED') {
        const firstName = m.fullName.split(' ')[0].toLowerCase();
        if (firstName.length > 2 && lowercaseText.includes(firstName)) {
          detectedPatientName = m.fullName;
          matchedMember = m;
          break;
        }
      }
    }
  }

  // 2. Detect Date
  let detectedDate: string | null = null;

  // Format: YYYY-MM-DD
  const ymdRegex = /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/;
  // Format: DD/MM/YYYY or DD-MM-YYYY
  const dmyRegex = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;
  // Format: DD de [mes] de YYYY (or without year)
  const deMesRegex = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/i;

  const ymdMatch = combinedText.match(ymdRegex);
  const dmyMatch = combinedText.match(dmyRegex);
  const deMesMatch = combinedText.match(deMesRegex);

  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    detectedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const fullYear = y.length === 2 ? `20${y}` : y;
    detectedDate = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else if (deMesMatch) {
    const [, d, mes, y] = deMesMatch;
    const m = MONTHS_MAP[mes.toLowerCase()];
    const fullYear = y || new Date().getFullYear().toString();
    detectedDate = `${fullYear}-${m}-${d.padStart(2, '0')}`;
  }

  // 3. Detect Time
  let detectedTime: string | null = null;

  // Format: HH:MM or HH:MM am/pm/a.m./p.m.
  const timeRegex = /\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\b/i;
  const timeMatch = combinedText.match(timeRegex);

  if (timeMatch) {
    let [, hrStr, minStr, ampm] = timeMatch;
    let hr = parseInt(hrStr, 10);
    const min = parseInt(minStr, 10);

    if (ampm) {
      const period = ampm.toLowerCase().replace(/\./g, '');
      if (period === 'pm' && hr < 12) {
        hr += 12;
      } else if (period === 'am' && hr === 12) {
        hr = 0;
      }
    }
    detectedTime = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }

  // 4. Detect Doctor
  let detectedDoctor: string | null = null;
  const docRegex = /\b(?:Dr\.|Dra\.|doctor|doctora|médico|medico)\s+([A-ZÁÉÍÓÚ][a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\s+[A-ZÁÉÍÓÚ][a-zA-ZáéíóúÁÉÍÓÚñÑ]+)*)\b/;
  const docMatch = combinedText.match(docRegex);
  if (docMatch) {
    detectedDoctor = docMatch[1];
  }

  // 5. Detect Specialty
  let detectedSpecialty: string | null = null;
  const specialties = [
    'odontología', 'odontologia', 'pediatría', 'pediatria', 'medicina general', 'oftalmología', 'oftalmologia',
    'cardiología', 'cardiologia', 'dermatología', 'dermatologia', 'ginecología', 'ginecologia', 'psicología',
    'psicologia', 'nutrición', 'nutricion', 'fisioterapia', 'ortopedia', 'urología', 'urologia', 'neurología',
    'neurologia', 'optometría', 'optometria', 'gastroenterología', 'gastroenterologia', 'medicina interna'
  ];

  for (const spec of specialties) {
    if (lowercaseText.includes(spec)) {
      detectedSpecialty = spec.charAt(0).toUpperCase() + spec.slice(1);
      break;
    }
  }

  // 6. Detect Location / Clinic
  let detectedLocation: string | null = null;
  const locationRegexes = [
    /\b(?:IPS|clínica|clinica|sede|consultorio|hospital)\s+([A-ZÁÉÍÓÚ0-9][a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\-\.\s]+?)(?=\s+(?:el|la|los|del|con|para|en|fecha|hora|paciente)\b|$)/i,
    /\b(?:en|ubicado en)\s+([A-ZÁÉÍÓÚ][a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+?)(?=\s+(?:el|la|con|para|fecha|hora)\b|$)/
  ];

  for (const regex of locationRegexes) {
    const match = combinedText.match(regex);
    if (match && match[1] && match[1].trim().length > 3) {
      detectedLocation = match[1].trim();
      break;
    }
  }

  // If no location matched but we find keywords like "consultorio 402" or similar
  if (!detectedLocation) {
    const consMatch = combinedText.match(/\bconsultorio\s*[A-Z0-9\-]+\b/i);
    if (consMatch) {
      detectedLocation = consMatch[0];
    }
  }

  // 7. Calculate Confidence
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  
  if (detectedPatientName && detectedDate && detectedTime) {
    confidence = 'HIGH';
  } else if (detectedDate && detectedTime) {
    confidence = 'MEDIUM';
  }

  return {
    detectedPatientName,
    detectedDate,
    detectedTime,
    detectedDoctor: detectedDoctor || null,
    detectedSpecialty: detectedSpecialty || 'Medicina General',
    detectedLocation: detectedLocation || 'Consultorio',
    confidence
  };
}
