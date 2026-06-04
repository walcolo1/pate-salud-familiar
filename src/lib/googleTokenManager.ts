/**
 * Google Token Manager — Gestión centralizada de tokens OAuth en memoria.
 *
 * SEGURIDAD:
 *  - Los tokens NUNCA se guardan en localStorage ni sessionStorage.
 *  - El cache vive solo en memoria del módulo JS (se pierde al recargar página).
 *  - Los tokens se consideran válidos por 55 minutos (Google los emite por 60min,
 *    dejando 5 min de margen para evitar expiración durante operaciones largas).
 *  - No se imprime el token en consola bajo ninguna circunstancia.
 */

// ── Scopes combinados requeridos por la app ────────────────────────────────
export const OPERATIONAL_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const ALL_REQUIRED_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

// ── Cache en memoria (módulo-scope, NO exportado) ──────────────────────────
interface TokenCache {
  accessToken: string;    // Token de acceso (NUNCA se serializa a storage)
  expiresAt: number;      // Timestamp en ms. Token válido hasta esta fecha.
  scopes: string;         // Scopes concedidos (para validación)
}

const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 minutos en ms

// Cache por scope-group (operacional, drive, calendar)
let _operationalCache: TokenCache | null = null;
let _driveCache: TokenCache | null = null;
let _calendarCache: TokenCache | null = null;

// Singleton del tokenClient de GIS (se recrea si cambia el clientId)
let _tokenClient: any = null;
let _lastClientId: string | null = null;

// ── Verificación de vigencia ───────────────────────────────────────────────

function isCacheValid(cache: TokenCache | null): boolean {
  if (!cache) return false;
  return Date.now() < cache.expiresAt;
}

/**
 * Devuelve el token operacional vigente o null (sin ninguna petición a Google).
 * Uso: verificar rápidamente si hay token antes de intentar una operación.
 */
export function getOperationalTokenIfValid(): string | null {
  if (isCacheValid(_operationalCache)) return _operationalCache!.accessToken;
  return null;
}

export function getDriveTokenIfValid(): string | null {
  if (isCacheValid(_driveCache)) return _driveCache!.accessToken;
  return null;
}

export function getCalendarTokenIfValid(): string | null {
  if (isCacheValid(_calendarCache)) return _calendarCache!.accessToken;
  return null;
}

/**
 * Indica si hay algún token operacional vigente disponible (Sheets + Drive + AppData).
 */
export function isOperationalTokenValid(): boolean {
  return isCacheValid(_operationalCache);
}

// ── Solicitud de token ─────────────────────────────────────────────────────

/**
 * Solicita un token GIS a través del Token Client.
 * Si `silent = true`, usa `prompt: ''` que intenta renovar sin popup.
 * Si GIS no puede renovarlo silenciosamente, rechaza con el error de GIS.
 *
 * @throws Error con `error: 'interaction_required'` si se necesita popup
 */
function requestGISToken(
  clientId: string,
  scope: string,
  silent: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('SSR: no se puede solicitar token en servidor.'));
      return;
    }

    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services no está disponible.'));
      return;
    }

    // Recrear tokenClient si el clientId cambió
    if (!_tokenClient || _lastClientId !== clientId) {
      _tokenClient = null;
      _lastClientId = clientId;
    }

    // Usar initTokenClient en cada llamada para poder cambiar el prompt
    // (GIS no permite modificar prompt en el client ya creado)
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      prompt: silent ? '' : undefined,
      callback: (response: any) => {
        if (response.error) {
          reject(response);
        } else if (response.access_token) {
          resolve(response.access_token as string);
        } else {
          reject(new Error('No se recibió access_token de Google.'));
        }
      },
    });

    client.requestAccessToken({ prompt: silent ? '' : 'select_account' });
  });
}

// ── API pública principal ──────────────────────────────────────────────────

/**
 * Obtiene un token operacional válido (Sheets + Drive + AppData).
 *
 * Estrategia:
 *  1. Si hay token vigente en caché → lo devuelve directamente (sin red).
 *  2. Si `silent = true` y el cache expiró → intenta renovar sin popup.
 *     Si GIS no puede renovar → lanza error (caller decide qué mostrar al usuario).
 *  3. Si `silent = false` → muestra popup de selección de cuenta.
 *
 * @param clientId - Google OAuth Client ID
 * @param silent - Si true, no abre popup (puede fallar con 'interaction_required')
 */
export async function ensureOperationalToken(
  clientId: string,
  silent = false,
): Promise<string> {
  // Paso 1: Cache vigente
  if (isCacheValid(_operationalCache)) {
    return _operationalCache!.accessToken;
  }

  // Paso 2/3: Solicitar token
  const token = await requestGISToken(clientId, OPERATIONAL_SCOPES, silent);

  _operationalCache = {
    accessToken: token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    scopes: OPERATIONAL_SCOPES,
  };

  return token;
}

/**
 * Obtiene un token de Drive (drive.file).
 * Primero verifica si el token operacional (que incluye drive.file) es válido.
 */
export async function ensureDriveToken(
  clientId: string,
  silent = false,
): Promise<string> {
  // El token operacional incluye drive.file, reusarlo si es válido
  if (isCacheValid(_operationalCache)) {
    return _operationalCache!.accessToken;
  }
  if (isCacheValid(_driveCache)) {
    return _driveCache!.accessToken;
  }

  const token = await requestGISToken(clientId, DRIVE_SCOPE, silent);
  _driveCache = {
    accessToken: token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    scopes: DRIVE_SCOPE,
  };
  return token;
}

/**
 * Obtiene un token de Calendar (calendar.events).
 */
export async function ensureCalendarToken(
  clientId: string,
  silent = false,
): Promise<string> {
  if (isCacheValid(_calendarCache)) {
    return _calendarCache!.accessToken;
  }

  const token = await requestGISToken(clientId, CALENDAR_SCOPE, silent);
  _calendarCache = {
    accessToken: token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    scopes: CALENDAR_SCOPE,
  };
  return token;
}

/**
 * Obtiene un token con todos los scopes requeridos (Drive file, AppData, Sheets, Calendar).
 * Rellena las cachés correspondientes para evitar solicitudes adicionales a Google.
 */
export async function ensureAllRequiredTokens(
  clientId: string,
  silent = false,
): Promise<string> {
  // Retornar caché operacional si incluye calendar y es válida
  if (isCacheValid(_operationalCache) && _operationalCache!.scopes.includes('calendar.events')) {
    return _operationalCache!.accessToken;
  }

  const token = await requestGISToken(clientId, ALL_REQUIRED_SCOPES, silent);
  const cacheEntry = {
    accessToken: token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    scopes: ALL_REQUIRED_SCOPES,
  };

  _operationalCache = cacheEntry;
  _driveCache = cacheEntry;
  _calendarCache = cacheEntry;

  return token;
}

/**
 * Limpia todos los caches de tokens en memoria.
 * Llamar en signOut() para evitar uso de tokens de sesión anterior.
 */
export function invalidateAllTokens(): void {
  _operationalCache = null;
  _driveCache = null;
  _calendarCache = null;
  _tokenClient = null;
  _lastClientId = null;
}

/**
 * Verifica si hay algún token activo (de cualquier tipo).
 * Usado para indicar en UI si el usuario tiene conexión Google vigente.
 */
export function hasAnyValidToken(): boolean {
  return (
    isCacheValid(_operationalCache) ||
    isCacheValid(_driveCache) ||
    isCacheValid(_calendarCache)
  );
}

/**
 * Retorna el tiempo restante del token operacional en minutos.
 * Devuelve 0 si no hay token o está expirado.
 */
export function getTokenRemainingMinutes(): number {
  if (!isCacheValid(_operationalCache)) return 0;
  const remainingMs = _operationalCache!.expiresAt - Date.now();
  return Math.max(0, Math.floor(remainingMs / 60000));
}
