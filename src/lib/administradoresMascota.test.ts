import { describe, expect, it } from 'vitest';
import { administradoresDeMascota } from './administradoresMascota';
import type { FamilyInvitation } from './tiposAcceso';

const acceso = (invitedEmail: string, role: FamilyInvitation['role'], invitedMemberId: string, status: FamilyInvitation['status'] = 'ACCEPTED'): FamilyInvitation => ({
  id: invitedEmail, familyId: '', invitedEmail, invitedMemberId, role, status, token: '', createdAt: '', expiresAt: '', acceptedAt: null, acceptedByUid: null, createdBy: '',
});

describe('quién administra una mascota', () => {
  it('toda la familia, la mascota asignada o su responsable; el lector solo mira', () => {
    const r = administradoresDeMascota({ id: 'pet-1', memberId: 'p-ana' }, [
      acceso('cuidador@x.co', 'CAREGIVER', '*'),
      acceso('ana@x.co', 'MEMBER', 'p-ana'),
      acceso('paseador@x.co', 'MEMBER', 'pet-1', 'PENDING'),
      acceso('abuela@x.co', 'VIEWER', '*'),
      acceso('juan@x.co', 'MEMBER', 'p-juan'),
      acceso('ex@x.co', 'CAREGIVER', '*', 'REVOKED'),
    ]);
    expect(r.map((x) => [x.correo, x.nivel, x.motivo, x.pendiente])).toEqual([
      ['ana@x.co', 'ADMINISTRA', 'RESPONSABLE', false],
      ['cuidador@x.co', 'ADMINISTRA', 'TODA_LA_FAMILIA', false],
      ['paseador@x.co', 'ADMINISTRA', 'MASCOTA_ASIGNADA', true],
      ['abuela@x.co', 'SOLO_LECTURA', 'TODA_LA_FAMILIA', false],
    ]);
  });
});
