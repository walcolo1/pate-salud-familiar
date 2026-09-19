# La plantilla maestra — el molde del que sale cada familia (Bloque E, E8)

Todo el alta del §3.1 cuelga de una sola cosa: que `Archivo ▸ Hacer una copia`
se lleve el script. E2 lo verificó contra Google. Este documento es cómo se
arma el molde del que saldrán todas esas copias.

**La plantilla de pruebas no sirve para esto.** Quedó instalada: tiene las 21
pestañas, tres disparadores, un identificador de hoja y el correo de una cuenta
real en `CONFIG`. Cada copia arrastraría todo eso. Por eso la maestra se arma
limpia y **nunca se ejecuta**.

---

## La URL oficial

> **Pendiente.** Aquí va el enlace `/copy` de la plantilla maestra en cuanto se
> arme. A diferencia de los identificadores de las hojas de prueba —que están
> en un fichero ignorado por git— **este enlace sí es público**: es lo que se
> le da a cada titular.

```
Enlace /copy:  (pendiente)
Armada el:     (pendiente)
Versión:       e7 · esquema 1 · 21 pestañas · 12 ficheros consolidados
```

---

## Paso 1 · Generar el consolidado

```bash
node scripts/consolidar-gs.mjs
```

Escribe `apps-script/dist/Pate.gs`: los doce ficheros de la plantilla en uno,
3 523 líneas. No se versiona — es una derivada de ficheros que sí están en el
repositorio.

**Se niega a escribir** si encuentra cualquiera de estas dos cosas:

- Dos declaraciones globales con el mismo nombre. En Apps Script eso no da
  error: gana la última que se cargue, en silencio.
- Restos que no deben multiplicarse por cada familia: un correo que no esté en
  la lista de ejemplos declarados, un Client ID, la URL de un despliegue, un
  identificador de hoja, una clave privada, `localhost` o un `TODO:` sin
  cerrar.

Las dos comprobaciones corren además en cada `test:run`, así que el molde no
depende de acordarse de ejecutar el guion antes de publicar.

---

## Paso 2 · La hoja, y en este orden

**La hoja primero, el script después.** Un proyecto autónomo al que se le
asocia una hoja no viaja con `/copy`, y ahí se cae el onboarding entero.

1. Hoja de cálculo **nueva**, desde una cuenta `@gmail.com`.
2. Nombrarla exactamente:

   ```
   Paté · Salud Familiar — PLANTILLA
   ```

3. **No crear ninguna pestaña.** Se queda con la «Hoja 1» que trae de fábrica.
   Las 21 las crea `instalar()` en cada copia.

---

## Paso 3 · El script

1. **Extensiones ▸ Apps Script**. El proyecto nace vinculado a la hoja, que es
   lo que hace que viaje con la copia.
2. **Configuración del proyecto ▸ Mostrar el archivo de manifiesto**.
3. Pegar `apps-script/plantilla/appsscript.json` encima del que trae.
4. En el editor, renombrar `Código.gs` a **`Pate`** y pegar el contenido de
   `apps-script/dist/Pate.gs`.
5. **Que no quede ningún otro fichero `.gs`.**
6. Guardar. Nombrar el proyecto `Paté · Salud Familiar`.

---

## Paso 4 · NO ejecutar nada

Este paso consiste en no hacer nada, y es el más importante del documento.

**No se pulsa ▷ Ejecutar. No se abre el menú Paté. No se instala.** Una
plantilla instalada no es una plantilla: es el expediente de alguien, con su
correo en `CONFIG`, y cada copia lo arrastraría.

Lo que sí hay que hacer es **recargar la hoja** y comprobar que aparece el menú
**Paté** en la barra. Eso lo pinta `onOpen`, que es un disparador **sencillo**:
Apps Script lo ejecuta sin autorización y sin crear nada. Es la señal de que el
script está vinculado, y es gratis.

### Cómo comprobar que sigue virgen, sin ejecutar nada

Las tres se ven mirando, no corriendo:

| Dónde | Qué tiene que verse |
|---|---|
| La hoja | Una sola pestaña, «Hoja 1» |
| Apps Script ▸ **Activadores** | Vacío. Cero activadores |
| Configuración del proyecto ▸ **Propiedades del script** | Vacío. Sin `ID_HOJA`, sin `OAUTH_CLIENT_ID` |
| Apps Script ▸ **Ejecuciones** | Vacío, o solo `onOpen` como «Activador sencillo» |

Esa última fila es la prueba de que nadie ejecutó nada. Si aparece `instalar`,
la plantilla está contaminada y hay que rehacerla desde el paso 2 — no se puede
limpiar a mano con confianza.

---

## Paso 5 · Compartir para que el `/copy` funcione

**Compartir ▸ Acceso general ▸ Cualquier persona con el enlace ▸ Lector.**

«Lector» y no «Editor»: con permiso de edición, cualquiera que abra el enlace
podría cambiar el molde para todos los que vengan detrás. Para hacer una copia
basta con poder leer.

Después, tomar la URL normal y cambiar el final:

```
…/edit#gid=0     →     …/copy
```

Ese es el enlace que se le da a cada titular. Al abrirlo, Google le ofrece
copiar la hoja a su Drive, y el script viaja con ella.

> **Compruébalo desde una cuenta que no sea la tuya**, o en una ventana de
> incógnito. Una hoja que solo se puede copiar desde tu sesión es un
> onboarding que funciona exactamente una vez: para ti.

---

## Paso 6 · La pantalla de «app no verificada» (deuda de E2-02)

Es la fricción de cuatro minutos que pasa el titular, y la única de todo el
sistema. Conviene tenerla capturada: es lo que hay que explicar en el manual, y
es lo que hace que alguien abandone si le llega por sorpresa.

**Se captura sobre una copia de usar y tirar, no sobre la maestra.** Dos
razones: la maestra se queda con cero ejecuciones, y una copia es exactamente
lo que verá un titular de verdad.

1. Desde el enlace `/copy`, hacer una copia con una cuenta `@gmail.com`.
2. En la copia: **Extensiones ▸ Apps Script ▸ ▷ Ejecutar** sobre `instalar`.
3. Google pide autorización. Capturar, en orden:

   | Captura | Qué tiene que verse |
   |---|---|
   | `E8-01-elegir-cuenta.png` | El selector de cuenta de Google |
   | `E8-02-no-verificada.png` | «Google no ha verificado esta aplicación» |
   | `E8-03-avanzada.png` | *Configuración avanzada* desplegado, con «Ir a … (no seguro)» |
   | `E8-04-ambitos.png` | **La lista de los siete permisos**. Es la captura que importa |
   | `E8-05-concedido.png` | La ejecución terminada |

4. Comprobar en `E8-04` que los permisos que Google enumera se corresponden con
   los siete ámbitos del manifiesto, y **que no hay ninguno más**. Google los
   describe en lenguaje llano, no por su URL, así que la correspondencia hay
   que leerla:

   | Ámbito del manifiesto | Lo que Google suele decir |
   |---|---|
   | `spreadsheets` | Ver, editar, crear y borrar tus hojas de cálculo de Google |
   | `drive.file` | Ver y gestionar los archivos de Drive que abras o crees con esta aplicación |
   | `calendar.events` | Ver y editar eventos de todos tus calendarios |
   | `script.send_mail` | Enviar correo en tu nombre |
   | `script.scriptapp` | Crear y actualizar sus propios activadores |
   | `script.external_request` | Conectarse a un servicio externo |
   | `userinfo.email` | Ver tu dirección de correo principal |

   **Si aparece alguno que no está en esa lista, parar.** Un ámbito de más en
   esta pantalla es un ámbito de más en la confianza de cada titular, y hay una
   prueba —`manifiestoPlantilla.test.ts`— que compara la lista entera.

5. Las capturas van a `docs/evidencia/`. **Recortar o tapar el correo de la
   cuenta** antes de guardarlas: aparece en el selector y en la cabecera.
6. **Tirar la copia.** Era de usar y tirar; borrarla del Drive.

---

## Al terminar

- Pegar el enlace `/copy` arriba, en «La URL oficial».
- Guardar la hoja maestra en un sitio del que no se mueva. Cambiar su URL
  después rompe todos los enlaces repartidos.
- **Si en el futuro cambia el código**, la plantilla no se actualiza sola: las
  copias ya hechas se quedan con la versión que tuvieran. Actualizar la maestra
  sirve para las familias que vengan; para las que ya están, hace falta que
  peguen el nuevo `Pate.gs` en su propia copia. Eso es trabajo de un bloque
  posterior y no está resuelto.

---

## Lo que la plantilla maestra NO lleva

Ninguna de estas tres cosas viaja en el molde, y las tres las configura cada
titular en su copia:

| Qué | Dónde se pone | Sin ella |
|---|---|---|
| `OAUTH_CLIENT_ID` | Propiedades del script | `Auth.gs` rechaza todos los tokens |
| `URL_PWA` y `URL_BACKEND` | Propiedades del script | `invitar` falla cerrado |
| `ID_HOJA` | Lo escribe `instalar()` | El Web App no sabe a qué hoja hablar |

Las tres fallan **cerradas**, que es la única forma aceptable de fallar en una
instalación a medias.
