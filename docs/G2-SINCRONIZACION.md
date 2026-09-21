# G2 — la sincronización híbrida

La hoja no avisa cuando cambia. Firestore sí lo hacía, y perderlo es el precio
de que cada familia tenga su propio backend. Lo que queda es preguntar, y
preguntar bien.

**Lo acordado, y ya implementado en `src/lib/sondeoRevision.ts`:**

| | |
|---|---|
| Disparador primario | el regreso a la pestaña (`visibilitychange` + `focus`) |
| Sondeo pasivo | **120 s**, y solo con la pestaña delante |
| En segundo plano | **nada**. El temporizador se para, no se ralentiza |
| Consulta | **solo `obtenerRevision`** |

---

## Por qué solo `obtenerRevision`

Es la única acción del router que **no lee la hoja**: devuelve un número
guardado en una propiedad del script. Sondear con `exportar` traería el
expediente entero cada dos minutos para descubrir, casi siempre, que no había
cambiado nada.

## La cuota, con la cifra delante

Una cuenta @gmail.com gratuita tiene **20.000 llamadas/día** y 90 minutos de
cómputo.

| Uso | Peticiones/día | De la cuota |
|---|---|---|
| 8 h con la pestaña visible | **240** | 1,2 % |
| 24 h sin cerrarla nunca | 720 | 3,6 % |

El margen no lo gasta el sondeo. Lo gastarían los guardados, y esos van por
lote: `aplicar()` manda todas las mutaciones de una vez y un lote vacío ni
siquiera sale a la red.

`presupuestoDiario(horas)` calcula la cifra, y hay una prueba que la fija: si
alguien baja el intervalo, el número se mueve a la vista.

---

## Lo que hubo que decidir al escribirlo

**Los dos eventos, no uno.** `visibilitychange` cubre cambiar de pestaña y
minimizar; `focus` cubre volver desde otra ventana con la pestaña siempre
visible, que en un escritorio con dos monitores es lo normal. Con uno solo,
media parte de los regresos no dispararía nada. Como `comprobarAhora` no se
solapa consigo misma, un regreso que dispare los dos sigue siendo **una**
petición — y hay una prueba que lo fija.

**Arrancar no pregunta.** La copia acaba de llegar. Y sin revisión de partida,
la primera respuesta solo sirve para fijarla: anunciarla como cambio sería una
recarga garantizada nada más abrir.

**Una revisión que baja también es un cambio.** Pasa si el titular restaura una
copia de la hoja. Tratar solo el «sube» dejaría al cliente creyendo que está al
día sobre un documento que ya no es el mismo.

**Un fallo no mata el bucle.** Un sondeo que se rinde con el primer túnel deja
de sincronizar el resto de la sesión, y nadie se entera hasta que falta un dato.
Se registra y se sigue.

**La visibilidad se mira al vencer, no al programar.** La pestaña pudo ocultarse
por el camino.

---

## La decisión que sigue abierta: qué hacer cuando cambia

`alCambiar` es una llamada de vuelta **a propósito**. Las tres salidas siguen
siendo las del plan:

1. **Recargar.** Sencillo, y **tira lo que el usuario estuviera escribiendo**.
2. **Avisar** y dejar elegir. Más amable, más trabajo, y una barra más en
   pantalla.
3. **Recargar solo lo que no está en edición.** Lo mejor y lo más caro: hay que
   saber qué está en edición.

Mi recomendación es la **2** para el corte, y la 3 más adelante si molesta. En
un expediente clínico, perder lo que alguien acababa de escribir es peor que
mostrarle un dato viejo durante unos segundos.

No está decidida y no la he decidido yo: el módulo funciona con cualquiera de
las tres.

---

## Lo que NO está hecho

**No está conectado.** Igual que G0, el sondeo se construyó al lado: nadie lo
instancia todavía. No puede estarlo, porque lo que sondea es el repositorio de
G0 y ese **no tiene de dónde sacar el `id_token`** hasta G3.

Encender el sondeo antes que G3 sería un temporizador preguntando cada dos
minutos y fallando cada dos minutos.

**La medida de cuota es aritmética, no medida.** Las 20.000 llamadas son la
cifra oficial que aportaste; las 240 salen de dividir. Lo que **no** está
comprobado en vivo es qué contesta Google al acercarse al límite, y no lo voy a
escribir de memoria.
