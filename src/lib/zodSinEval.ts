/**
 * Zod no puede tantear si hay `eval` (Bloque G, G3b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Zod 4 comprueba una vez, de forma perezosa, si el entorno le deja compilar
 * validadores con `new Function`. Lo hace dentro de un `try/catch`, así que
 * cuando la CSP lo prohíbe **no se rompe nada**: lo captura y usa el camino
 * interpretado.
 *
 * Pero el navegador **sí dispara `securitypolicyviolation`** antes de que el
 * `catch` lo recoja. Lo dice el propio código de zod:
 *
 * > Skip the probe under `jitless`: strict CSPs report the caught
 * > `new Function` as a `securitypolicyviolation` even though the throw is
 * > swallowed.
 *
 * POR QUÉ ESO IMPORTA AQUÍ Y NO ES UN CAPRICHO
 * ────────────────────────────────────────────
 * A7 fijó que **ninguna ruta real dispara ni una violación de CSP**, y ese
 * trinquete solo vale si el número es cero. Una violación inofensiva pero
 * permanente enseña a ignorar el informe, y el día que aparezca una de verdad
 * estará en la misma lista que el ruido.
 *
 * Apareció en G3b porque `/login` pasó a cargar zod por la cadena de la
 * identidad. No lo causó el cambio —la CSP de esta aplicación nunca ha
 * permitido `eval`—: lo destapó, y lo hizo en tres pruebas a la vez.
 *
 * LO QUE SE PIERDE
 * ────────────────
 * Nada medible aquí. `jitless` renuncia a los validadores compilados, que son
 * una optimización para esquemas grandes en caliente; los de esta aplicación
 * validan un puñado de campos cuando alguien pega un enlace.
 */

import { config } from 'zod';

/**
 * Se aplica al importar, y hay que importarlo **antes** de usar cualquier
 * esquema: el tanteo de zod es perezoso, y una validación anterior a esta
 * línea ya lo habría disparado.
 */
config({ jitless: true });

/** Para que la prueba pueda comprobar que esto se aplicó de verdad. */
export const SIN_EVAL = true;
