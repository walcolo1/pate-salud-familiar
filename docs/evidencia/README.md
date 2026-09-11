# Evidencia de validaciones manuales

Capturas y actas de las pruebas que **no se pueden automatizar**: las que
exigen una cuenta de Google real, una pantalla de consentimiento, una consola
de administración o un despliegue de verdad.

Una validación manual sin evidencia aquí **no está aprobada**, por muy seguros
que estemos de que funciona.

---

## Antes de guardar una captura: qué hay que tapar

Este directorio se versiona y acaba en GitHub. Reglas no negociables:

| Tapar siempre | Por qué |
|---|---|
| Direcciones de correo, propias y ajenas | Regla permanente del proyecto |
| Nombres de personas y de familiares | Ídem |
| Números de documento, historias clínicas, resultados | Datos sensibles |
| El **ID de la implementación** del Web App (`/macros/s/<ID>/exec`) | Es una URL pública y ejecutable: quien la tenga puede llamar al backend |
| Identificadores de hoja de cálculo y de carpeta de Drive | Filtran a qué recurso apuntan |
| Tokens, claves, `client_id` completos | Evidente |

Se puede tapar con un rectángulo opaco. **No con desenfoque**: un desenfoque
suave sobre texto pequeño es reversible con más facilidad de la que la gente
supone.

Lo que **sí** debe verse: el texto de la pantalla, los botones, los avisos de
Google y los ámbitos solicitados. Es justo lo que se está documentando.

---

## Cómo se nombran

```
<paso>-<numero>-<que-se-ve>.png

E0bis-04-pantalla-app-no-verificada.png
E0bis-05-ambitos-solicitados.png
```

En orden, con dos dígitos, en minúsculas y sin tildes en el nombre del fichero.

---

## Qué hay ahora

| Fichero | Paso | Estado |
|---|---|---|
| `E0bis-06-sonda-cors.md` | E0-bis, paso 6 | **Ejecutado 2026-09-11.** Acta de texto: la sonda la corre el arnés, no una persona, así que la evidencia es su salida y no una captura |
| `E0bis-03-opciones-de-despliegue.png` | E0-bis, paso 3 | Pendiente |
| `E0bis-04-pantalla-app-no-verificada.png` | E0-bis, paso 4 | Pendiente |
| `E0bis-05-ambitos-solicitados.png` | E0-bis, paso 4 | Pendiente |
| `E0bis-07-disparadores.md` | E0-bis, paso 7 | **Parcial, 2026-09-11.** Un disparador se crea desde código en cuenta gratuita. Falta verlo ejecutarse, la idempotencia y el `/copy` |
| `E0bis-08-mediciones.png` | E0-bis, paso 8 | Pendiente. Los 624 ms de E0bis-07 miden crear un disparador, **no** la instalación de las 18 pestañas |

Cada fila que siga diciendo «Pendiente» es un punto que el informe E0-bis **no
puede declarar verificado**, por muy seguros que estemos de lo que va a salir.
