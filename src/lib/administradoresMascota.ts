/**
 * Quién puede administrar una mascota (Bloque O).
 *
 * Es el reflejo en pantalla de la regla del backend (`permisos.ts` +
 * `ampliarConMascotasACargo`): el titular siempre; un CUIDADOR o MIEMBRO con
 * alcance `*`, con la mascota asignada o con su responsable a su alcance; un
 * LECTOR solo la ve. La decisión de verdad la toma el backend en cada
 * petición; esto solo lo explica.
 */

import type { FamilyInvitation } from './tiposAcceso';

export type NivelAdministracion = 'ADMINISTRA' | 'SOLO_LECTURA';

export interface Administrador {
  correo: string;
  rol: FamilyInvitation['role'];
  nivel: NivelAdministracion;
  pendiente: boolean;
  /** Por qué la alcanza: «toda la familia», «la mascota», «su responsable». */
  motivo: 'TODA_LA_FAMILIA' | 'MASCOTA_ASIGNADA' | 'RESPONSABLE';
}

export const NOMBRE_ROL: Record<FamilyInvitation['role'], string> = {
  OWNER: 'Titular', CAREGIVER: 'Cuidador', MEMBER: 'Miembro', VIEWER: 'Lector',
};

export const NOMBRE_MOTIVO: Record<Administrador['motivo'], string> = {
  TODA_LA_FAMILIA: 'acceso a toda la familia',
  MASCOTA_ASIGNADA: 'la mascota asignada',
  RESPONSABLE: 'acceso a su responsable',
};

export function administradoresDeMascota(
  mascota: { id: string; memberId: string },
  accesos: readonly FamilyInvitation[],
): Administrador[] {
  const salida: Administrador[] = [];
  for (const a of accesos ?? []) {
    if (a.status !== 'ACCEPTED' && a.status !== 'PENDING') continue;
    const alcance = String(a.invitedMemberId ?? '').trim();
    const motivo: Administrador['motivo'] | null =
      alcance === '*' ? 'TODA_LA_FAMILIA' : alcance === mascota.id ? 'MASCOTA_ASIGNADA' : alcance === mascota.memberId ? 'RESPONSABLE' : null;
    if (!motivo) continue;
    salida.push({
      correo: a.invitedEmail,
      rol: a.role,
      nivel: a.role === 'VIEWER' ? 'SOLO_LECTURA' : 'ADMINISTRA',
      pendiente: a.status === 'PENDING',
      motivo,
    });
  }
  return salida.sort((x, y) => (x.nivel === y.nivel ? x.correo.localeCompare(y.correo) : x.nivel === 'ADMINISTRA' ? -1 : 1));
}
