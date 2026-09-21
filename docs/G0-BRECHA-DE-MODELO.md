# G0 · la brecha entre el modelo de la aplicación y el esquema de la hoja

**Estado: PARADO, esperando decisión.**

G0 tenía que ser mecánico: 37 métodos contra una API que ya existe. Al empezar
por el mapeo apareció algo que el plan no preveía y que no puedo resolver solo,
porque las tres salidas tienen costes distintos y ninguno es técnico.

**El esquema de la hoja se diseñó desde la especificación. El modelo de la
aplicación creció desde la aplicación. No son el mismo modelo.**

Mapear sin decidir significaría **tirar campos que hoy un usuario ve**, en
silencio y uno a uno. Es exactamente el fallo contra el que acabamos de montar
el trinquete de G1, una capa más arriba: allí se perdía la escritura entera,
aquí se perderían columnas dentro de una escritura que parece funcionar.

---

## La medida

Comparando los campos propios de cada modelo —descontando los artefactos de
Firestore, que sí sobran— contra las columnas útiles de su pestaña:

| Modelo | Campos | Columnas | Descuadre |
|---|---|---|---|
| `MedicalAppointment` | 26 | 10 | **+16** |
| `ClinicalDocument` | 17 | 8 | **+9** |
| `MedicalOrder` | 18 | 11 | **+7** |
| `MedicationPrescription` | 18 | 11 | **+7** |
| `MedicationDoseReminder` | 7 | 5 | +2 |
| `PeriodicCheckup` · `MedicalExam` | 7 · 8 | 6 · 7 | +1 cada uno |
| `MedicalHistoryEvent` | 5 | 5 | 0 |
| `HealthProfile` · `FollowUpTask` | 7 · 5 | 9 · 7 | sobra sitio |
| `VaccineRecord` · `ExamResult` · `Reminder` | 8 · 6 · 6 | 9 · 7 · 7 | sobra sitio |

`FamilyMember` aparecía con **+11** y es un falso positivo: se reparte entre
`PACIENTES` y `PERFIL_HUMANO`, y encaja casi entero. Lo digo porque la primera
medición lo señalaba y no era verdad.

**La mitad de las colecciones caben.** El problema está concentrado en cuatro.

---

## Qué es cada cosa que falta

No todo lo que no tiene columna es una pérdida. Hay tres clases muy distintas y
mezclarlas es lo que haría tomar una mala decisión.

### 1 · Lo que el Bloque E ya reemplazó — se tira, y se gana

`canAccessPortal`, `permissionStatus`, `permissions`, `ownerEmail`,
`ownerGoogleId`, `sourceDeviceId`, `syncStatus`, `lastSyncedAt`.

Son el andamiaje del diseño multi-dispositivo sobre Firestore: cada fila decía
de quién era y si estaba sincronizada. Con una hoja por familia eso no existe —
la fila es de la familia porque está en su hoja— y los permisos viven en
`ACCESO` con rol, estado y alcance, que es un modelo mejor que un booleano por
miembro.

**Estos desaparecen y el sistema mejora.** No hay nada que decidir.

### 2 · Estado de integraciones que aún no existen

| Campos | De qué |
|---|---|
| `calendarSyncStatus`, `calendarSyncedAt`, `calendarError`, `googleCalendarHtmlLink` | sincronización con Calendar |
| `source`, `sourceEmail`, `sourceMessageId`, `sourceSubject` | importación desde Gmail (**E11**) |
| `sharedWithEmail`, `permissionId`, `sharedAt`, `revokedAt`, `shareStatus`, `shareError` | compartir un documento por Drive |
| `retentionStatus`, `retentionReason`, `purgedAt` | política de retención |

Son **estado de features**, no datos clínicos. Si se tiran, esas funciones
dejan de recordar en qué punto estaban; no se pierde el historial de nadie.
Pero hay que decidirlo sabiendo que se apagan, no descubrirlo después.

### 3 · Datos reales sin columna — aquí está el problema

| Modelo | Campos que un usuario escribió y desaparecerían |
|---|---|
| `HealthProfile` | `currentMedications`, `primaryDoctor`, `insuranceInfo` |
| `MedicalOrder` | `authorizationNumber`, `authorizationDate`, `authorizationExpiresAt`, `epsOrProvider`, `ipsOrClinic`, `description` |
| `MedicationPrescription` | `quantity`, `quantityUnit`, `durationDays`, `instructions` |
| `ClinicalDocument` | `fileSize`, `driveUrl`, `clinicalCategory` |
| `MedicalAppointment` | `documentIds`, `reminderPolicy`, `completedAt` |
| `FamilyMember` | `photoUrl`, `avatarUrl`, `avatarPath` |

`authorizationNumber` y `epsOrProvider` son el número de autorización de la EPS
y quién la emitió. Eso es justo lo que alguien apunta para no volver a
pedirlo.

*(Los tres campos de avatar del mismo modelo son deuda propia: tres formas de
guardar una foto. Conviene resolverlo, no trasladarlo.)*

### 4 · Y tres colecciones sin ninguna pestaña

`gmailSources`, `appointmentCandidates` y los seis ajustes de escaneo de Gmail
(`gmailAutoScanEnabled`, `gmailScanTime`, `gmailScanRangeDays`,
`gmailOnlyFutureAppointments`, `lastGmailScanAt`, `nextGmailScanAt`).

Pertenecen a **E11**, que no está construido. `saveGmailSource`,
`deleteGmailSource`, `saveAppointmentCandidate` y `saveSettings` —cuatro de las
31 escrituras— no tienen dónde escribir.

---

## Las tres salidas

### A · Ampliar el esquema

Añadir las columnas que faltan de la clase 3.

**Cuesta:** tocar el Bloque E, que está cerrado y validado en vivo. Y tocar
**la plantilla maestra ya publicada**: cada familia que haya copiado la hoja se
queda con un esquema viejo. `CONFIG.version_esquema` existe justo para esto,
pero la migración **no está implementada**.

Hoy hay una sola copia y es de pruebas, así que el coste es mínimo **ahora** y
crece cada día.

### B · Recortar el modelo

Declarar que lo que no tiene columna se pierde a propósito.

**Cuesta:** de la clase 3, nada es reemplazable. `primaryDoctor` o
`authorizationNumber` no vuelven de ningún sitio.

### C · Una columna de desbordamiento

Un `extra` con JSON en cada pestaña.

**Cuesta:** la hoja deja de ser legible. Y que el titular pueda abrir su
expediente y entenderlo es **la mitad de la gracia** de que sea una hoja de
cálculo y no una base de datos. Lo descarto salvo que lo pidas.

---

## Lo que recomiendo

**B para las clases 1 y 2, A acotada para la 3.**

- Las clases 1 y 2 se tiran, y se escribe por qué. Son 22 campos de andamiaje y
  estado de integraciones apagadas.
- La clase 3 son **unas 18 columnas** repartidas en 6 pestañas. Se añaden.

Y **no dentro de G**. La ampliación del esquema es un paso propio —**E10**—
con su generación, su prueba de deriva y su subida de `version_esquema`,
porque toca la plantilla y la plantilla ya está publicada. Meterlo a escondidas
dentro de G sería cambiar el Bloque E sin decir que se está cambiando.

Para las cuatro escrituras de E11 (clase 4), que **lancen un error explícito**
en vez de callar. Lanzar no cuenta como mudo en G1, y así el hueco es visible
el día que alguien lo toque.

---

## Lo que sí hice, porque no depende de esto

`src/lib/transporteBackend.ts`: la conversación con el router de E6 —montar la
petición, leerla, traducir los códigos de error— con sus pruebas. Lo necesita
cualquiera de las tres salidas y no cambia con ninguna.

El mapeo, no. Esperando tu decisión.
