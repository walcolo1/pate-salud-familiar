/**
 * Permisos.gs — qué puede hacer cada rol (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DENEGACIÓN POR DEFECTO
 * ──────────────────────
 * `puede()` devuelve falso ante cualquier combinación que no esté escrita en
 * la matriz. No hay «si no está prohibido, se permite»: una acción nueva nace
 * denegada para todos hasta que alguien la añada a propósito.
 *
 * Es lo contrario de lo que hacía la regla de Firestore que la auditoría del
 * Bloque A encontró, que concedía `true` cuando faltaba el documento.
 *
 * DOS PREGUNTAS, NO UNA
 * ─────────────────────
 * Un permiso tiene verbo y alcance. «Puede editar citas» no significa nada sin
 * «¿de quién?». Un CUIDADOR edita las citas de los pacientes que tiene
 * asignados y de ninguno más; un MIEMBRO, solo las suyas. Por eso `puede()`
 * recibe el acceso entero y el paciente, y no un rol suelto.
 *
 * ESTADO: E1 · contrato. La implementación llega en E5.
 */

/** Roles, de más a menos alcance. */
var ROLES = ['TITULAR', 'CUIDADOR', 'MIEMBRO', 'LECTOR'];

/**
 * ¿Puede este acceso hacer esta acción sobre este paciente?
 *
 * @param {Object} acceso  Lo que devolvió `resolverAcceso`.
 * @param {string} accion  Verbo del catálogo de acciones.
 * @param {?string} pacienteId  A quién afecta. `null` para acciones de familia.
 * @return {boolean}
 */
function puede(acceso, accion, pacienteId) {
  throw new Error('NO_IMPLEMENTADO: E5');
}

/**
 * ¿Alcanza este acceso a este paciente?
 *
 * `*` significa todos. Para un MIEMBRO, solo su `paciente_propio`.
 *
 * @param {Object} acceso
 * @param {string} pacienteId
 * @return {boolean}
 */
function alcanza(acceso, pacienteId) {
  throw new Error('NO_IMPLEMENTADO: E5');
}
