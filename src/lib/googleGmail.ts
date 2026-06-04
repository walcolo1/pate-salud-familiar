import { AppointmentEmailSource } from '../domain/models';

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
}

// Base64URL decoder with UTF-8 support
export function decodeBase64(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return decodeURIComponent(
      Array.prototype.map.call(decoded, (c: string) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
  } catch (_) {
    try {
      return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      return str;
    }
  }
}

// Extractor for email body
export function extractBodyText(payload: any): string {
  if (!payload) return '';
  
  // 1. Direct body (simple message)
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  
  // 2. Multiparts
  if (payload.parts) {
    let plainText = '';
    let htmlText = '';
    
    const traverseParts = (parts: any[]) => {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          plainText += decodeBase64(part.body.data) + '\n';
        } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
          htmlText += decodeBase64(part.body.data) + '\n';
        } else if (part.parts) {
          traverseParts(part.parts);
        }
      }
    };
    
    traverseParts(payload.parts);
    return plainText || htmlText.replace(/<[^>]*>/g, '') || ''; // simple HTML strip fallback
  }
  
  return '';
}

/**
 * Searches for messages in Gmail matching active sources.
 */
export async function searchAppointmentEmails(
  accessToken: string,
  sources: AppointmentEmailSource[],
  options: { rangeDays: number }
): Promise<{ id: string; threadId: string; sourceEmail: string }[]> {
  // If sandbox mock token
  if (accessToken === 'mock-gmail-token' || accessToken.startsWith('mock')) {
    return getMockMessageList(sources);
  }

  const activeSources = sources.filter(s => s.enabled);
  if (activeSources.length === 0) return [];

  const days = options.rangeDays || 90;
  const results: { id: string; threadId: string; sourceEmail: string }[] = [];

  // Keywords filter to reduce scanning non-relevant emails
  const queryKeywords = '(cita OR consulta OR agenda OR programación OR programacion OR especialista OR fecha OR hora)';

  // Scan emails from each source separately
  for (const source of activeSources) {
    const q = `from:${source.email} newer_than:${days}d ${queryKeywords}`;
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        console.warn(`Gmail search failed for source ${source.email}: ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach((msg: any) => {
          results.push({
            id: msg.id,
            threadId: msg.threadId,
            sourceEmail: source.email
          });
        });
      }
    } catch (err) {
      console.error(`Gmail search fetch error for source ${source.email}:`, err);
    }
  }

  return results;
}

/**
 * Retrieves details for a specific Gmail message.
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageDetail> {
  // If sandbox mock message
  if (accessToken === 'mock-gmail-token' || accessToken.startsWith('mock')) {
    return getMockMessageDetail(messageId);
  }

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to retrieve Gmail message details: ${res.statusText}`);
  }

  const message = await res.json();
  const headers = message.payload?.headers || [];
  
  const getHeader = (name: string) => {
    const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  const subject = getHeader('subject');
  const from = getHeader('from');
  const date = getHeader('date');
  const bodyText = extractBodyText(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || '',
    subject,
    from,
    date,
    bodyText
  };
}

// ── Sandbox Mock Data ────────────────────────────────────────────────────────

const mockEmails = [
  {
    id: 'msg-mock-001',
    threadId: 'thread-mock-001',
    from: 'noreply@informacion.saludsis.mil.co',
    subject: 'Confirmación de cita médica para Walter White',
    snippet: 'Estimado Walter White, le confirmamos su cita de odontología para el día 15 de julio de 2026...',
    bodyText: 'Estimado Walter White, le confirmamos su cita de odontología para el día 15 de julio de 2026 a las 10:30 am con el Dr. Hector Salamanca en la IPS Clinica del Norte, Consultorio 104.',
    date: 'Wed, 3 Jun 2026 14:22:00 -0500'
  },
  {
    id: 'msg-mock-002',
    threadId: 'thread-mock-002',
    from: 'citas@clinica.com',
    subject: 'Recordatorio de cita de pediatría',
    snippet: 'Hola, le recordamos la cita médica de su hijo/a con la Dra. Skyler White en la Clínica...',
    bodyText: 'Hola, le recordamos la cita médica de su hijo/a con la Dra. Skyler White en la Clínica Infantil de Especialidades, consultorio 202 el 20 de julio de 2026 a las 2:00 pm.',
    date: 'Wed, 3 Jun 2026 09:15:00 -0500'
  },
  {
    id: 'msg-mock-003',
    threadId: 'thread-mock-003',
    from: 'agenda@eps.com',
    subject: 'Programación de cita de optometría',
    snippet: 'Se ha programado una cita médica para el día 25 de julio de 2026 a las 09:00 en la sede principal...',
    bodyText: 'Se ha programado una cita médica para el día 25 de julio de 2026 a las 09:00 en la sede principal eps con la Dra. Marie Schrader. Por favor llegar 15 minutos antes.',
    date: 'Tue, 2 Jun 2026 17:40:00 -0500'
  },
  {
    id: 'msg-mock-004',
    threadId: 'thread-mock-004',
    from: 'notificaciones@hospital.com',
    subject: 'Confirmación de cita de cardiología',
    snippet: 'Confirmación de cita: Se ha agendado una cita médica para el 28 de junio de 2026 a las 16:30 con...',
    bodyText: 'Confirmación de cita: Se ha agendado una cita médica para el 28 de junio de 2026 a las 16:30 con el Dr. Gustavo Fring en la sede Hospital Los Pollos Hermanos, piso 3.',
    date: 'Mon, 1 Jun 2026 11:10:00 -0500'
  }
];

function getMockMessageList(sources: AppointmentEmailSource[]) {
  const activeEmails = sources.filter(s => s.enabled).map(s => s.email.toLowerCase());
  return mockEmails
    .filter(email => activeEmails.includes(email.from.toLowerCase()))
    .map(email => ({
      id: email.id,
      threadId: email.threadId,
      sourceEmail: email.from
    }));
}

function getMockMessageDetail(messageId: string): GmailMessageDetail {
  const found = mockEmails.find(email => email.id === messageId);
  if (!found) {
    throw new Error(`Gmail message ${messageId} not found in mock database`);
  }
  return found;
}
