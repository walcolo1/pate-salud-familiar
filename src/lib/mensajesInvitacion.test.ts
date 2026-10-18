import { describe, it, expect } from 'vitest';
import { MENSAJES_INVITACION, mensajeDeInvitacion } from './mensajesInvitacion';
import { ErrorBackend } from './transporteBackend';

describe('mensajeDeInvitacion', () => {
  it('traduce los códigos del backend y nunca enseña el código crudo', () => {
    for (const codigo of Object.keys(MENSAJES_INVITACION)) {
      const texto = mensajeDeInvitacion(new ErrorBackend(codigo));
      expect(texto).toBe(MENSAJES_INVITACION[codigo]);
      expect(texto).not.toMatch(/[A-Z]{3,}_[A-Z]+/);
    }
  });

  it('lo desconocido tiene un mensaje genérico, no vacío', () => {
    expect(mensajeDeInvitacion(new Error('raro')).length).toBeGreaterThan(10);
    expect(mensajeDeInvitacion(null).length).toBeGreaterThan(10);
  });
});
