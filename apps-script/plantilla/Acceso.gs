/**
 * Acceso.gs — quién es este correo dentro de ESTA familia (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La pregunta «¿de qué titular es este dato?» no se resuelve con código: la
 * resuelve **a qué URL se hizo la petición**. Cada familia tiene su propio
 * despliegue, su propia hoja y su propio Drive. No hay `familia_id` que
 * filtrar mal, ni consulta que se pueda escribir al revés.
 *
 * Lo único que queda por resolver aquí es el rol, y se busca en `ACCESO` de
 * este documento y de ninguno más.
 *
 * REVOCAR TIENE QUE SURTIR EFECTO YA
 * ──────────────────────────────────
 * Cachear `ACCESO` seis horas haría que un familiar revocado siguiera entrando
 * media tarde. La solución es un contador de versión en las propiedades del
 * script, incluido en la CLAVE de caché: `mutarAcceso()` lo incrementa, y toda
 * entrada anterior deja de existir en el mismo instante. No hay que invalidar
 * nada; sencillamente ya no se encuentra.
 *
 * LA HOJA SE ABRE POR IDENTIFICADOR
 * ─────────────────────────────────
 * `getActiveSpreadsheet()` devuelve null en una ejecución de Web App: no hay
 * documento activo. `resolverAcceso` tiene que usar
 * `SpreadsheetApp.openById(PropertiesService…getProperty(CLAVE_ID_HOJA))`, que
 * el instalador dejó guardado. Es también el motivo de que el manifiesto pida
 * el ámbito `spreadsheets` completo y no `spreadsheets.currentonly`.
 *
 * ESTADO: E1 · contrato. La implementación llega en E4.
 */

/** Propiedad que versiona la caché de ACCESO. La incrementa `mutarAcceso`. */
var CLAVE_VERSION_ACCESO = 'ACCESO_VERSION';

/** Estados posibles de una fila de ACCESO. */
var ESTADOS_ACCESO = ['ACTIVO', 'INVITADO', 'REVOCADO'];

/**
 * El acceso de un correo, o `null` si no figura.
 *
 * @param {string} email  Ya normalizado por `normalizarEmail`.
 * @return {?{email: string, rol: string, pacientes: Array<string>, pacientePropio: ?string, estado: string}}
 */
function resolverAcceso(email) {
  throw new Error('NO_IMPLEMENTADO: E4');
}

/**
 * Única puerta de escritura de ACCESO.
 *
 * Invitar, cambiar de rol y revocar pasan por aquí, y por aquí se incrementa
 * la versión de la caché. Escribir en ACCESO por otro camino deja a un
 * revocado dentro hasta que caduque su entrada.
 *
 * @param {function(Object): Object} mutacion
 * @return {Object}
 */
function mutarAcceso(mutacion) {
  throw new Error('NO_IMPLEMENTADO: E4');
}

/** Deja constancia del último acceso. No debe bloquear la respuesta. */
function registrarAcceso(email) {
  throw new Error('NO_IMPLEMENTADO: E4');
}
