/**
 * Qué decir de la hoja de la familia en la barra lateral.
 *
 * Sustituye a «Copia en Drive · Activo», que venía de cuando había una copia
 * en Drive que sincronizar y que se encendía con un interruptor que ya no
 * controla nada. Ahora la hoja **es** el expediente, y lo útil es saber si este
 * dispositivo está hablando con ella.
 */

export type TonoEstadoHoja = 'ok' | 'atencion' | 'neutro';

export interface EntradaEstadoHoja {
  origen: string;
  hojaRegistrada: boolean;
  hayQueEntrar: boolean;
  pendientes: number;
}

export interface EstadoHoja {
  /** Corto: cabe en la cabecera del móvil. */
  etiqueta: string;
  /** Lo mismo, dicho entero, para el lector de pantalla y el `title`. */
  detalle: string;
  tono: TonoEstadoHoja;
}

export function estadoHoja({ origen, hojaRegistrada, hayQueEntrar, pendientes }: EntradaEstadoHoja): EstadoHoja {
  if (origen === 'DEMO') {
    return { etiqueta: 'Demostración', detalle: 'Modo demostración: nada se guarda en una hoja.', tono: 'neutro' };
  }
  if (!hojaRegistrada) {
    return {
      etiqueta: 'Sin registrar',
      detalle: 'Este navegador no sabe dónde está la hoja de tu familia. Regístrala en Ajustes.',
      tono: 'atencion',
    };
  }
  if (hayQueEntrar) {
    return {
      etiqueta: 'Reconectar',
      detalle: 'La sesión de Google no está activa: los cambios esperan a que vuelvas a entrar.',
      tono: 'atencion',
    };
  }
  if (pendientes > 0) {
    return {
      etiqueta: pendientes === 1 ? '1 pendiente' : `${pendientes} pendientes`,
      detalle: `${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} por enviar a la hoja. Se envían solos.`,
      tono: 'atencion',
    };
  }
  return { etiqueta: 'Conectada', detalle: 'Hoja familiar conectada: todo está guardado.', tono: 'ok' };
}
