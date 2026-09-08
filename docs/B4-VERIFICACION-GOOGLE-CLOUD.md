# B4 · Verificación manual en Google Cloud Console

> **No ejecutar todavía.** Este documento describe lo que hay que revisar. No
> cambies nada en la consola hasta decidirlo explícitamente: los pasos que
> modifican algo están marcados con ⚠️ y van al final, separados de la lectura.

Todo lo de aquí lo tienes que hacer tú. No son pasos que se puedan automatizar
sin tus credenciales, y no deben automatizarse aunque se pudiera.

---

## Antes de empezar: qué ocultar

Vas a mirar pantallas que contienen identificadores. Al copiarlas o pegarlas:

| Dato | Qué mostrar |
|---|---|
| Project ID | primeros 4 caracteres + `…` (ej. `pate…`) |
| Client ID | primeros 4 dígitos + `…` + los últimos 4 antes de `.apps` |
| Client secret | **nada**. No lo abras, no lo copies, no lo pegues |
| Números de proyecto | primeros 3 dígitos + `…` |
| Correos de usuarios de prueba | solo el dominio (`@gmail.com`) y cuántos hay |
| Nombre de la organización | si aparece alguna, dilo — **no debería haber ninguna** |

Nada de lo que me pases debe permitir a nadie autenticarse ni identificar a una
persona.

---

## 1 · Inventario de proyectos

**Ruta:** consola de Google Cloud → selector de proyectos (arriba, junto al
logotipo) → pestaña **Todos**.

Anota, para cada proyecto que aparezca:

- nombre y Project ID (enmascarado)
- si dice pertenecer a una organización o a «Sin organización»
- fecha de creación, si se ve

**Qué esperamos encontrar:** al menos `pate-salud-familiar`. Sabemos que existe
un segundo, `pate-salud-familiar-498101`, creado por error durante A4-bis.

**Qué buscar con atención:** cualquier proyecto que diga pertenecer a una
**organización**. La aplicación tiene que funcionar con cuentas `@gmail.com`
personales, y un proyecto dentro de una organización arrastra políticas de
Workspace. Si aparece uno, para y avísame antes de tocar nada.

---

## 2 · Pantalla de consentimiento OAuth

**Ruta:** proyecto `pate-salud-familiar` → **APIs y servicios** → **Pantalla de
consentimiento de OAuth**.

Verifica y anota:

| Campo | Valor esperado | Por qué importa |
|---|---|---|
| **Tipo de usuario** | **External** | «Internal» exige Google Workspace. Si dice Internal, para |
| **Estado de publicación** | **Testing** | Evita la verificación de Google |
| **Usuarios de prueba** | cuántos hay, de un máximo de 100 | Tu familia tiene que caber |
| Correo de asistencia | que sea el tuyo | — |
| Dominios autorizados | los que haya | — |

En **Testing**, los tokens de refresco caducan a los 7 días. La aplicación usa
el flujo de token de GIS —tokens de acceso de una hora que se vuelven a pedir de
forma interactiva—, así que probablemente no te afecte. **Probablemente no es
verificado**: está anotado como validación manual pendiente.

---

## 3 · Ámbitos declarados

**Ruta:** misma pantalla → sección **Ámbitos** (o «Scopes») → **Editar app** →
paso 2.

Copia la lista completa. La esperada tras el Bloque B:

| Ámbito | Clasificación de Google |
|---|---|
| `.../auth/userinfo.email` | No sensible |
| `.../auth/userinfo.profile` | No sensible |
| `openid` | No sensible |
| `.../auth/drive.file` | **No sensible** |
| `.../auth/drive.appdata` | Sensible |
| `.../auth/spreadsheets` | Sensible |
| `.../auth/calendar.events` | Sensible |

**Lo que NO debe estar:** `https://www.googleapis.com/auth/gmail.readonly`.

Si sigue declarado, no pasa nada grave —el código ya no lo pide, así que nadie
volverá a concederlo—, pero conviene retirarlo para que la pantalla de
consentimiento deje de mencionarlo. Ese es el paso ⚠️ B-1 del final.

Fíjate también en si Google muestra algún aviso de «verificación requerida» o
«evaluación de seguridad». Con la lista de arriba **no debería aparecer
ninguno**: no queda ningún ámbito restringido.

---

## 4 · Clientes OAuth y orígenes autorizados

**Ruta:** **APIs y servicios** → **Credenciales**.

Para cada entrada bajo «IDs de cliente de OAuth 2.0», anota:

- nombre y tipo (debería ser **Aplicación web**)
- Client ID enmascarado
- **Orígenes de JavaScript autorizados**
- **URIs de redireccionamiento autorizados**

Los orígenes que la aplicación necesita hoy:

```
http://localhost:3000        (desarrollo)
https://<tu-dominio-vercel>  (producción)
```

Comprueba tres cosas:

1. Que **no sobre ningún origen**. Un origen de más es un sitio desde el que
   alguien podría usar tu Client ID.
2. Que el Client ID que aparece coincide con el de tu `.env.local`. Compara solo
   los **primeros 4 dígitos**; no hace falta más.
3. Si hay **más de un cliente OAuth**, dime cuántos y para qué dice servir cada
   uno. Los que no se usen son superficie de ataque gratuita.

**Sobre los client secrets:** este es un cliente de navegador y no los usa. Si
alguno tiene un secreto generado, dímelo, pero **no lo abras**.

---

## 5 · APIs habilitadas y si Gmail puede apagarse

**Ruta:** **APIs y servicios** → **APIs y servicios habilitados**.

Anota la lista completa. Las que la aplicación necesita:

- Google Drive API
- Google Sheets API
- Google Calendar API
- Identity Toolkit API / Token Service (las usa Firebase Auth)

**Gmail API ya no la usa nadie.** Antes de apagarla, compruébalo tú mismo en la
consola, sin fiarte de esta afirmación:

1. Entra en **Gmail API** → pestaña **Métricas**.
2. Pon el rango en **30 días**.
3. Mira el tráfico.

Si el tráfico es **cero** desde que se desplegó este cambio, no queda ningún
consumidor y se puede deshabilitar (paso ⚠️ B-2).

Si ves tráfico, **para y avísame**: significa que algo sigue llamándola, y
querré saber qué antes de apagar nada.

---

## 6 · Consentimiento ya concedido en tu cuenta

**Ruta:** [myaccount.google.com](https://myaccount.google.com) → **Seguridad** →
**Tus conexiones con aplicaciones y servicios de terceros** → busca la
aplicación.

Anota qué permisos dice tener concedidos. Si aún figura el acceso a Gmail, es
del consentimiento antiguo: el permiso sigue concedido aunque el código ya no lo
use.

---

## Pasos que MODIFICAN algo ⚠️

**No los ejecutes hasta confirmarlo explícitamente.** Van en este orden.

### ⚠️ B-1 · Retirar `gmail.readonly` de la pantalla de consentimiento

Pantalla de consentimiento → Editar app → paso 2 (Ámbitos) → quitar el ámbito de
Gmail → Guardar.

*Efecto:* la pantalla de consentimiento deja de mencionar el correo. Nadie
pierde acceso a nada, porque el código ya no lo pide.

### ⚠️ B-2 · Deshabilitar la Gmail API

Solo **después** de comprobar en el paso 5 que su tráfico es cero.
APIs y servicios → Gmail API → **Inhabilitar API**.

*Efecto:* ninguno sobre la aplicación. Es reversible en cualquier momento.

### ⚠️ B-3 · Revocar el consentimiento antiguo en tu cuenta

En myaccount.google.com, revoca el acceso de la aplicación.

*Efecto:* la próxima vez que entres tendrás que volver a autorizar, y verás la
pantalla nueva —la que ya no menciona Gmail—. Es la forma de comprobar de
verdad que B-1 funcionó.

### ⚠️ B-4 · El proyecto sobrante

`pate-salud-familiar-498101` se creó por error. Antes de borrarlo, confirma que
no tiene nada dentro. Un proyecto borrado se puede recuperar durante 30 días.

---

## Después: qué te voy a pedir

De lo anterior necesito, con todo enmascarado:

1. Cuántos proyectos hay y si alguno pertenece a una organización.
2. Tipo y estado de publicación de la pantalla de consentimiento.
3. La lista de ámbitos declarados.
4. Cuántos clientes OAuth hay y qué orígenes tiene cada uno.
5. Si la Gmail API registró tráfico en los últimos 30 días.

Con eso queda cerrado el inventario y se puede decidir B-1 a B-4.
