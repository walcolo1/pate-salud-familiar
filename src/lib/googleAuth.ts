export interface DecodedGoogleUser {
  sub: string;        // ID único del usuario de Google
  email: string;      // Correo electrónico
  email_verified: boolean;
  name: string;       // Nombre completo
  picture?: string;   // URL de la foto de perfil (si existe)
  given_name?: string;
  family_name?: string;
}

export interface GoogleSessionUser {
  id: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  provider: 'google' | 'mock';
  loggedAt: string;
}

/**
 * Decodifica de forma nativa el JSON Web Token (JWT) retornado por Google Identity Services.
 * Evita dependencias externas decodificando la sección payload del token en Base64.
 */
export function decodeGoogleToken(credential: string): DecodedGoogleUser | null {
  try {
    const base64Url = credential.split('.')[1];
    if (!base64Url) return null;
    
    // Remplaza caracteres Base64Url por Base64 estándar
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decodifica de manera segura manejando caracteres unicode especiales
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    return JSON.parse(jsonPayload) as DecodedGoogleUser;
  } catch (error) {
    console.error('Error decodificando el token de Google:', error);
    return null;
  }
}

/**
 * Verifica si el SDK de Google Identity Services está cargado en el objeto global window.
 */
export function isGoogleAuthScriptLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).google !== 'undefined';
}
