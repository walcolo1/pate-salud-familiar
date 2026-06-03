/**
 * Google Calendar API Client Layer
 * Handles authentication requests and calendar event creations using pure Fetch API
 * with minimum scopes (https://www.googleapis.com/auth/calendar.events).
 */

import { MedicalAppointment } from '../domain/models';

let tokenClient: any = null;
let tokenCallback: ((token: string) => void) | null = null;
let tokenErrorCallback: ((err: any) => void) | null = null;

/**
 * Triggers the Google Identity Services popup to request calendar.events permissions.
 * Keeps the token in memory and returns it via a Promise.
 */
export function requestCalendarPermission(clientId: string): Promise<string> {
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
          scope: 'https://www.googleapis.com/auth/calendar.events',
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

export interface CalendarEventResult {
  eventId: string;
  htmlLink: string;
}

/**
 * Creates a medical appointment event on the user's primary Google Calendar.
 */
export async function createCalendarEvent(
  accessToken: string,
  appt: MedicalAppointment,
  memberName: string
): Promise<CalendarEventResult> {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  // Parse start date from the local ISO format (YYYY-MM-DDTHH:mm)
  const startDate = new Date(appt.scheduledAt);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid appointment date: ${appt.scheduledAt}`);
  }

  // Default duration is 30 minutes
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  // Detect browser timezone
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';

  // Construct standard summary
  const summary = `Cita médica - ${appt.specialty} - ${memberName}`;

  // Construct description body
  const descriptionLines = [
    `Familiar: ${memberName}`,
    `Médico: ${appt.doctorName}`,
    `Especialidad: ${appt.specialty}`,
    `Motivo: ${appt.reason}`,
    appt.notes ? `Notas: ${appt.notes}` : null,
    'Origen: Paté Salud Familiar'
  ].filter(Boolean);

  const eventBody = {
    summary,
    location: appt.location || undefined,
    description: descriptionLines.join('\n'),
    start: {
      dateTime: startDate.toISOString(),
      timeZone
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 }, // 1 day before (24 * 60)
        { method: 'popup', minutes: 180 }   // 3 hours before (3 * 60)
      ]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error?.message || res.statusText;
    throw new Error(`Google Calendar API Error: ${message}`);
  }

  const data = await res.json();
  if (!data.id || !data.htmlLink) {
    throw new Error('Google Calendar API returned response missing id or htmlLink.');
  }

  return {
    eventId: data.id,
    htmlLink: data.htmlLink
  };
}
