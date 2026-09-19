# Evidencia E6-live — el backend contra un despliegue real

**Estado: LAS CINCO PROMESAS CERRADAS. Ejecutada el 2026-09-19.**

9 pruebas, 9 en verde, 0 fallos. Queda un cabo: el criterio 1 medido además
dentro de un navegador (paso 7).

Las 35 pruebas de `router.test.ts` cubren la cadena con dobles: el orden de los
eslabones, cada corte, la validación del lote, la traducción de errores. Lo que
no pueden cubrir es lo que solo existe cuando hay un despliegue: que
`UrlFetchApp` alcance `tokeninfo`, que un `id_token` emitido por Google pase las
tres validaciones, y —sobre todo— **que revocar deje a alguien fuera en la
petición siguiente**, que es el criterio que justifica todo el diseño de E4.

Un plan probado no es una ejecución probada.

---

## Las cinco promesas

| # | Promesa | Pruebas que la cierran |
|---|---|---|
| 1 | `ping` anónimo responde y **no cuenta nada** del titular | `E6L-1` |
| 2 | Un `id_token` real se valida contra `tokeninfo` | `E6L-5` |
| 3 | Sin token, o con uno falso, se responde `TOKEN_INVALIDO` | `E6L-2` · `E6L-3` · `E6L-4` |
| 4 | Una cuenta real que no figura en `ACCESO` se deniega | `E6L-6` |
| 5 | Revocar surte efecto **en la petición siguiente**, sin esperar la caché | `E6L-7` · `E6L-8` · `E6L-9` |

El plan está en `src/lib/sondaE6.ts` y tiene **38 pruebas** propias. No es
ceremonia: si la sonda clasificara mal una respuesta, esta validación daría un
verde que no existe, y eso es peor que no haberla hecho.

---

## Antes de empezar

Hacen falta tres cosas, y ninguna es una cuenta de Workspace:

- La **hoja de pruebas** donde se ejecutó E2, con su script vinculado.
- **Dos cuentas `@gmail.com`**: la del titular (dueña de la hoja) y otra
  cualquiera. Los criterios 4 y 5 no se pueden probar con una sola.
- El **Client ID de OAuth** de la PWA, el mismo `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  del `.env.local`. El guion lo lee solo.

> **Dos cuentas, un navegador.** No hace falta un segundo dispositivo: el
> selector de cuentas de Google basta.

---

## Paso 1 · Generar el fichero único

```bash
node scripts/consolidar-gs.mjs
```

Escribe `apps-script/dist/Pate.gs` con los once `.gs` concatenados. No se
versiona: es una derivada de ficheros que sí están en el repositorio.

Antes de escribir nada comprueba que **no haya dos declaraciones globales con el
mismo nombre**. En Apps Script eso no da error —todos los ficheros comparten
ámbito, gana el último que se cargue— y ya apareció dos veces en este bloque. La
misma comprobación corre en `consolidarPlantilla.test.ts` con cada `test:run`,
así que el trinquete no depende de acordarse de ejecutar el guion.

---

## Paso 2 · Pegarlo en el editor

En la hoja de pruebas, **Extensiones ▸ Apps Script**:

1. **Borra todos los `.gs` del proyecto.** Este paso no es opcional: dejar uno
   viejo al lado del consolidado duplica cada declaración, y el síntoma aparece
   lejos de la causa.
2. Crea un fichero llamado `Pate` y pega el contenido de `apps-script/dist/Pate.gs`.
3. **Configuración del proyecto ▸ Mostrar el archivo de manifiesto**, y pega
   `apps-script/plantilla/appsscript.json` encima del que hubiera. Trae dos
   ámbitos que E1 no tenía cuando se instaló la hoja.
4. Guarda.

---

## Paso 3 · La audiencia del token

`Auth.gs` rechaza **todo** si no sabe contra qué audiencia validar. Es
deliberado: un backend a medio instalar tiene que quedarse cerrado, no abierto.

En **Configuración del proyecto ▸ Propiedades del script**, añade:

| Propiedad | Valor |
|---|---|
| `OAUTH_CLIENT_ID` | El `NEXT_PUBLIC_GOOGLE_CLIENT_ID` de la PWA |

Sin esto, `E6L-5` falla con `TOKEN_INVALIDO` y parecerá un fallo de E3.

Comprueba de paso que siguen ahí `ID_HOJA` y las demás que dejó `instalar()`.
Si no están, ejecuta `instalar()` otra vez: es idempotente.

---

## Paso 4 · Autorizar los ámbitos nuevos

Ejecuta **`mostrarDiagnostico`** desde el editor (▷ Ejecutar). Google pedirá
autorización otra vez, porque el manifiesto ahora incluye
`script.external_request`.

Aparecerá la pantalla de **«Google no ha verificado esta aplicación»**:
*Configuración avanzada ▸ Ir a … (no seguro)*. Es la misma fricción de cuatro
minutos que pasará el titular una vez, y de la que E8 tiene que dejar captura.

Si no se autoriza aquí, el Web App fallará en la primera llamada a `tokeninfo` y
el error llegará como `TOKEN_INVALIDO`, que no dice nada de la causa.

---

## Paso 5 · Desplegar como Web App

**Implementar ▸ Nueva implementación**, tipo **Aplicación web**:

| Campo | Valor | Por qué |
|---|---|---|
| Ejecutar como | **Yo** (`USER_DEPLOYING`) | El script tiene que abrir la hoja del titular. Con «el usuario que accede», un familiar no tendría permiso sobre ella |
| Quién tiene acceso | **Cualquier usuario** | Y sí, **anónimo**. La puerta la pone E3, no Google: si Google exigiera sesión, cada familiar tendría que autorizar la aplicación, y eso es justo lo que el diseño evita |

Copia la URL que termina en **`/exec`**.

> **`/dev` no sirve.** Ejecuta siempre la última versión guardada y exige sesión
> iniciada: sirve para depurar, no para validar lo que verá un familiar. El
> guion se niega a usarla.

> **Si ya había una implementación**, no basta con guardar el código: hay que
> entrar en **Administrar implementaciones ▸ ✏️ ▸ Versión: Nueva versión**. Sin
> eso, la URL sigue sirviendo el código viejo, y es el error más caro de
> diagnosticar de todo este paso.

---

## Paso 6 · Correr las nueve peticiones

```bash
node scripts/e6-en-vivo.mjs --url https://script.google.com/macros/s/AAAA…/exec
```

El guion hace, en este orden:

1. Las cuatro peticiones que no necesitan a nadie: `ping` anónimo y los tres
   rechazos de E3.
2. Abre `http://localhost:3000` para que entres con **la cuenta del titular**.
   Si el servidor de desarrollo de Next está usando ese puerto, párala antes.
3. `E6L-5` con ese token.
4. Vuelve a abrir la página para **la segunda cuenta**.
5. `E6L-6`: esa cuenta todavía **no** está en `ACCESO`, y se deniega.
6. Se para y te dice qué correo escribir en la hoja.
7. `E6L-7`, `E6L-8` y `E6L-9` seguidas, midiendo el hueco entre revocar y
   reintentar.

**El orden es parte del experimento**, en dos sitios:

- `E6L-6` usa la segunda cuenta **antes** de darla de alta. Después, probaría
  otra cosa.
- `E6L-9` va inmediatamente detrás de `E6L-8`, y `E6L-7` tiene que haber pasado
  antes: revocar sobre una caché fría no demuestra nada. El acierto es que la
  clave versionada deja fuera a quien **ya estaba dentro**.

Dos pruebas hay que leerlas con cuidado porque se parecen y miden muros
distintos: `E6L-4` es un token que Google rechaza (**E3**) y `E6L-6` es un token
que Google acepta y una hoja que no (**E4**). La sonda las distingue por el
código exacto, y un código por otro se marca como fallo.

### Lo que el guion no escribe en ninguna parte

Ni la URL del despliegue —que es una credencial: quien la tenga puede llamar al
endpoint— ni los `id_token`, que son sesiones vivas durante una hora. Todo se
queda en memoria. La tabla que imprime al final va **redactada**: correos,
tokens e identificadores largos salen sustituidos, para que se pueda pegar aquí
sin repasarla a mano.

---

## Paso 7 · El criterio 1, además, en un navegador

`E6L-1` comprueba que la respuesta anónima no lleva datos. Lo que **no** puede
comprobar desde Node es que el navegador deje leerla: CORS y la CSP solo existen
dentro de un navegador, y un 200 en una terminal no dice nada de eso.

Eso lo cubre el arnés de E0-bis, que ahora incluye `E0b-4` invertida:

```bash
$env:URL_WEBAPP_HUMO="https://script.google.com/macros/s/AAAA…/exec"; npx playwright test e2e/webapp-humo.e2e.ts --project=app
```

*(PowerShell. En un shell POSIX, `URL_WEBAPP_HUMO="…" npx playwright test …`.)*

Las cuatro pruebas se saltan solas si no hay URL, así que el resto de la suite no
depende de tener un despliegue vivo.

---

## Resultados

Ejecutado el **19 de septiembre de 2026** contra la hoja de pruebas de E2, con
dos cuentas `@gmail.com` personales. Ningún dato clínico real viajó en estas
peticiones.

| Prueba | Promesa | Qué comprueba | Resultado | ms |
|---|---|---|---|---|
| `E6L-1` | 1 | `ping` anónimo responde y no cuenta nada | ✅ `ok:true` · sin fugas · `{"ok":true,"data":{"version":"e6","esquema":1}}` | 1601 |
| `E6L-2` | 3 | sin el campo `idToken` se rechaza | ✅ `ok:false` · `TOKEN_INVALIDO` | 1299 |
| `E6L-3` | 3 | una cadena que no es un JWT se rechaza sin salir a la red | ✅ `ok:false` · `TOKEN_INVALIDO` | 830 |
| `E6L-4` | 3 | un JWT bien formado que Google no firmó se rechaza | ✅ `ok:false` · `TOKEN_INVALIDO` | 1272 |
| `E6L-5` | 2 | el `id_token` real del titular pasa las tres validaciones | ✅ `ok:true` | 3313 |
| `E6L-6` | 4 | una cuenta real que no figura en `ACCESO` se deniega | ✅ `ok:false` · `ACCESO_DENEGADO` | 3657 |
| `E6L-7` | 5 | la misma cuenta, ya dada de alta, entra | ✅ `ok:true` | 3608 |
| `E6L-8` | 5 | el titular la revoca por la API | ✅ `ok:true` | 4744 |
| `E6L-9` | 5 | la petición inmediatamente siguiente se rechaza | ✅ `ok:false` · `ACCESO_DENEGADO` | 2535 |

### La revocación en caliente, que es el criterio que importa

`E6L-9` salió inmediatamente después de que `E6L-8` devolviera, y volvió
rechazada en **2 535 ms** —el viaje de ida y vuelta completo—. El TTL de la
caché de `ACCESO` es de **300 000 ms**.

Y la cuenta **estaba dentro** cuando se revocó: `E6L-7` había pasado, así que su
entrada de caché estaba caliente. Eso es lo que hace significativo el resultado.
Con la caché fría, que una cuenta revocada no entre no demostraría nada.

La versión en la clave funciona: `mutarAcceso` la incrementó al escribir, y en
ese mismo instante la entrada anterior dejó de encontrarse. No hubo que
invalidar nada.

### Los tres números que confirman lo que se esperaba

**`E6L-3` es la más rápida de todas (830 ms).** Es la única que no sale a la red:
`claveCache` rechaza lo que no tiene forma de JWT antes de gastar una llamada a
Google. Un endpoint público que reenviara cada cadena a `tokeninfo` sería un
ariete gratis contra la cuota de `UrlFetchApp`.

**`E6L-4` tarda 1 272 ms y `E6L-3` 830 ms.** La diferencia es la llamada a
`tokeninfo`: el JWT bien formado sí llega a Google, que contesta que no lo
firmó. Eso es lo que prueba de verdad la promesa 2 por el lado negativo —que la
verificación ocurre— y no solo que el router sabe decir que no.

**`E6L-5` (3 313 ms) casi triplica a `E6L-2` (1 299 ms).** Ahí están las tres
validaciones reales contra Google más la lectura de la hoja. Todas las
peticiones autenticadas se quedan entre 2,5 y 4,7 s, muy lejos de los 360 s de
límite por ejecución.

### Lo que estos números NO dicen

Son de una hoja con semillas, no con el expediente de una familia de verdad.
`listarPacientes` recorrió una pestaña casi vacía. Cuando haya volumen habrá que
volver a medir, y el sitio donde primero se notará es `exportar`, que lee las 21
pestañas de una vez.

### Pendiente: el criterio 1 en un navegador

El **paso 7** no se ha ejecutado. `E6L-1` comprueba desde Node que la respuesta
anónima no lleva datos, y eso está cerrado; lo que falta es confirmar que el
**navegador** deja leerla con la CSP de la aplicación puesta. CORS y CSP solo
existen dentro de un navegador, y un 200 en una terminal no dice nada de eso.

E0-bis ya lo validó contra la implementación de humo, así que el transporte está
probado; lo que no se ha vuelto a pasar es `E0b-4` —la que exige que la
respuesta anónima no traiga ningún correo— contra **este** despliegue. Es barato
y conviene cerrarlo antes de que la PWA empiece a hablar con el backend en E9.

---

## Los correos con puntos: encontrado aquí, arreglado en E6-bis

Preparando esta validación apareció un fallo real que **la propia validación no
habría destapado**: `ACCESO` comparaba el correo ya normalizado contra la celda
tal y como estuviera escrita, así que una fila tecleada como
`juan.perez@gmail.com` no se encontraba nunca, y un titular con puntos en su
dirección se quedaba fuera de su propio expediente.

Las dos cuentas usadas el 19 de septiembre no llevaban puntos, así que las nueve
peticiones salieron en verde con el fallo dentro. Nueve verdes no son una
demostración de que no haya nada roto; son una demostración de que lo que se
preguntó, funciona.

**Arreglado en E6-bis**, con nueve pruebas que cubren los dos lados de la
frontera —dentro de `gmail.com` los puntos se ignoran, fuera distinguen dos
buzones—. El detalle está en [ACCESO.md](ACCESO.md).

---

## Al terminar

*(Hecho el 2026-09-19 salvo lo que se indique.)*

- Deja la fila de la segunda cuenta como `REVOCADO`, o bórrala.
- **Archiva la implementación** si no se va a seguir usando: una URL `/exec`
  viva es un endpoint público contra la hoja de pruebas.
- La hoja de pruebas sigue sin servir como plantilla de producción: quedó
  instalada. La de producción hay que armarla limpia (criterio de **E8**).
