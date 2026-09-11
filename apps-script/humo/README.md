# Script de humo del Bloque E — E0-bis

Esto **no es el backend**. Es lo mínimo para responder con evidencia a cuatro
preguntas que la documentación de Google no cierra, antes de escribir las 18
pestañas encima de una suposición.

El guion paso a paso está en [`../../docs/TESTING.md` §E0-bis](../../docs/TESTING.md).

## Por qué estos ámbitos y no los mínimos

`oauthScopes` declara a propósito los ámbitos **del backend real**, no los que
este script de humo necesitaría:

| Ámbito | Para qué | Sensibilidad |
|---|---|---|
| `spreadsheets.currentonly` | Solo la hoja que contiene el script | La más estrecha posible para una hoja vinculada |
| `drive` | `DriveApp` crea el árbol de carpetas | **Restringido** |
| `script.scriptapp` | Crear disparadores desde código | Sensible |
| `script.external_request` | `UrlFetch`, que en E3 verificará el `id_token` | Sensible |

`script.external_request` no lo usa este script. Está declarado igualmente
porque el punto 2 de E0-bis es ver **la pantalla exacta que verá un titular
real**, y esa pantalla depende de los ámbitos pedidos. Medir una pantalla más
benigna que la de producción no sirve de nada.

`drive` es el que empuja la pantalla al peor caso. Si tras E0-bis se decide la
vía de ámbitos mínimos —`drive.file` con el servicio avanzado de Drive en lugar
de `DriveApp`—, hay que **repetir el paso 4 del guion** para capturar la
pantalla más suave, porque será otra.

## Los ficheros

| Fichero | Qué es |
|---|---|
| `Codigo.gs` | Todo el script: `doGet`, `doPost`, disparador, instalación simulada, limpieza |
| `appsscript.json` | Manifiesto. `USER_DEPLOYING` + `ANYONE_ANONYMOUS` |

Se pegan a mano en el editor de Apps Script (no hace falta `clasp` para esto).
Para ver `appsscript.json` en el editor hay que activar
**Configuración del proyecto ▸ Mostrar el archivo de manifiesto**.

## Qué deja como acta

Nada se cronometra a mano. `instalarSimulado()` mide con `Date.now()` y escribe
en la pestaña `MEDICIONES` de la propia hoja: pestañas creadas, milisegundos de
cada tramo, total, y el margen que queda contra el límite de 6 minutos. Esa
pestaña, exportada o capturada, es la evidencia del punto 4.

## Después

`limpiar()` borra las pestañas, los disparadores y manda la carpeta de prueba a
la papelera. Cuando E0-bis se apruebe, la hoja de humo entera se puede tirar:
no contiene ningún dato real y no debe sobrevivir al bloque.
