# Progress — Integracion Cuentas

Estado real del proyecto a la fecha de abajo. No reemplaza a `docs/superpowers/plans/2026-08-19-integracion-cuentas.md`
(el plan de implementación) ni a `README.md` (instrucciones de dev/deploy) —
este archivo registra en qué quedó el trabajo y qué falta confirmar, para
retomar sin perder contexto entre sesiones.

**Última actualización:** 2026-08-26 (sesión 3)

## 1. Deploy

**Hecho y reconfirmado.** El Worker está en producción en
`https://integracion-cuentas.diegocaso.workers.dev`. En esta sesión se
corrió `npm run deploy` (dos veces — ver §3) y se confirmó `wrangler secret
list` con los 3 secrets presentes después de cada deploy:
`GHL_TOKEN`, `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID`.

Suite de tests: `npx vitest run` → **16 archivos, 72 tests, todos en
verde** (hay warnings inofensivos de `CF-KV-Metadata` con caracteres no-ASCII
en los tests, no son fallas).

## 2. `FIXED_PERMISSIONS` — validado contra la cuenta real (Task 18, resuelto)

Se corrió el `curl` completo de `POST /api/users` (vía el Worker, que arma
el payload real con `FIXED_PERMISSIONS` de `src/config.js`) contra la cuenta
real de GHL, tres veces (usuarios de prueba distintos). Se capturó la
respuesta completa de GHL con un `console.log` temporal + `wrangler tail`
(revertido y redeployado enseguida después de leer el resultado — el código
en `main` no lo tiene).

**Resultado: GHL acepta los 38 flags, no rechaza la request ni los recorta.**
Dos matices reales no documentados en la referencia pública:

- **`workflowsEnabled` vuelve siempre `false`** en la respuesta,
  independientemente del valor enviado (se mandó `true`, volvió `false`).
  El resto de los 38 flags vuelven exactamente como se mandaron.
- **GHL agrega ~10 flags más por su cuenta**, no presentes en
  `FIXED_PERMISSIONS`: `opportunitiesBulkActionsEnabled`,
  `certificatesEnabled`, `mediaStorageEnabled`, `reportingEnabled`,
  `adPublishingEnabled`, `adPublishingReadOnly`, `wordpressEnabled`,
  `customMenuLinkReadOnly`, `customMenuLinkWrite`, `gokollabEnabled` — todos
  en `true` por default.

Conclusión: **no hace falta reducir `FIXED_PERMISSIONS` a los 4 flags
documentados en v3** (ver `docs/ghl-create-user.md` y comentario actualizado
en `src/config.js`). El único ajuste a considerar a futuro, si se quiere que
`workflowsEnabled` quede realmente en `true`, sería investigar por qué GHL
lo fuerza a `false` (no investigado en esta sesión — no bloquea nada, el
resto del set se respeta).

## 3. `GHL_SNAPSHOT_ID` y `GHL_COMPANY_ID` — la causa real no era el snapshot

**El diagnóstico de la sesión anterior estaba incompleto.** Se reintentó
"Crear Subcuenta con snapshot" con el `GHL_SNAPSHOT_ID` actualizado
(`JhOOoC5tfvWcz6EInWMm`) después de un `npm run deploy` limpio (72/72 tests
en verde antes de deployar) y **volvió a fallar con `502` — "Forbidden
resource"**.

Se corrió la prueba de control pedida ("Sin snapshot", `installSnapshot:
false`) para descartar que fuera el ID puntual: **falló con el mismo error
exacto.** Esto descartó el `snapshotId` como causa — el bloqueo estaba en
`POST /locations/` en sí, antes de que el snapshot entrara en juego.

Se probó también `POST /api/users` (necesitaba un `locationId` real
existente — se vinculó a mano en KV el que pasó el usuario,
`qEPqvH0BSpJQWIEL6zuV`, ligado a `diegocaso@gohighascend.com`) y dio un
error más específico: **`"This company is not accessible from this
token!"`**. Esto identificó la causa real: **el secret `GHL_COMPANY_ID`
tenía un valor que no correspondía a la compañía del `GHL_TOKEN`** — no es
un problema de scope del token ni del `snapshotId`.

**Fix aplicado:** el usuario confirmó el Company ID correcto
(`s0Le4AGYrdAaoiCJmCgv`), se actualizó con
`wrangler secret put GHL_COMPANY_ID` y se reintentó todo:

- `POST /api/users` con el `locationId` vinculado a mano → **201**, usuario
  creado (ver §2).
- `POST /api/subaccounts` con `installSnapshot: true` → **201**, subcuenta
  creada real: `DK7oe8JbOYVbicoifcA3` ("Prueba borrar - QA snapshot v2").

**Ambos secrets quedan confirmados funcionando de punta a punta:**
`GHL_SNAPSHOT_ID = JhOOoC5tfvWcz6EInWMm` y `GHL_COMPANY_ID =
s0Le4AGYrdAaoiCJmCgv`.

Nota aparte para el propio Worker: `src/ghl/client.js` mapea **cualquier**
respuesta no-OK de GHL a HTTP 502 (`GHL_ERROR`) en nuestra API — el código
real que devuelve GHL (probablemente `403` dado "Forbidden resource") se
pierde. No es un bug bloqueante, pero conviene tenerlo presente al
diagnosticar: un "502" de esta API no significa necesariamente que GHL
devolvió 502.

## 4. Flujo E2E completo — corrido real contra la cuenta real

Con los secrets corregidos, se corrió la cadena completa contra
`https://integracion-cuentas.diegocaso.workers.dev` (no tests unitarios,
`curl` real):

1. `GET /api/whitelist?email=diegocaso@gohighascend.com` → `200`,
   `authorized: true`.
2. `POST /api/subaccounts` (`installSnapshot: true`) → `201`,
   `locationId: DK7oe8JbOYVbicoifcA3`.
3. `GET /api/subaccounts?resellerEmail=diegocaso@gohighascend.com` → `200`,
   lista ambas subcuentas ligadas (la recién creada + la vinculada a mano).
4. `POST /api/users` sobre `DK7oe8JbOYVbicoifcA3` → `201`,
   `userId: 9k4H7ZjHNJ2sILx5SNP2`.

**Flujo E2E confirmado funcionando de punta a punta en producción.**

## 5. Subcuentas y usuarios de prueba en la cuenta real — pendiente revisión manual

**Importante: no tengo acceso al dashboard de GHL (ni a un endpoint de
"listar todas las locations de la company") — esto quedó sin revisar y
necesita que alguien con acceso al dashboard lo haga.**

Creado en esta sesión, contra la cuenta real, y **no reversible por la API
de este proyecto** (no hay endpoint de borrado implementado):

**Subcuenta:**
- `DK7oe8JbOYVbicoifcA3` — "Prueba borrar - QA snapshot v2" (Lima, PE).

**Usuarios:**
- `prueba.borrar.usuario.qa@example.com` (`LSMzWQsrRQiKt8jkLkI7`) — en
  `qEPqvH0BSpJQWIEL6zuV`.
- `prueba.borrar.usuario.qa2@example.com` (`X0MlRo0mncixPIoAbDmE`) — en
  `qEPqvH0BSpJQWIEL6zuV`.
- `prueba.borrar.usuario.qa3@example.com` (`5FxvWLxzyVsV36CI4xyM`) — en
  `qEPqvH0BSpJQWIEL6zuV`.
- `prueba.borrar.usuario.e2e@example.com` (`9k4H7ZjHNJ2sILx5SNP2`) — en
  `DK7oe8JbOYVbicoifcA3`.

**Además, en KV (no en GHL):** se agregó a mano la key
`reseller:diegocaso@gohighascend.com:qEPqvH0BSpJQWIEL6zuV` para poder
probar `POST /api/users` contra un `locationId` real ya existente, con
metadata placeholder `"(vinculo manual - subcuenta real existente)"`. Esto
es un artefacto de esta sesión de pruebas, no algo creado por el flujo
normal — si esa subcuenta ya tenía o va a tener un vínculo "real" (creado
por el flujo normal de la app), reemplazar esta entrada o corregir el
`name`/`city` del metadata para que no quede con el texto de debug.

**Sigue sin revisar** (heredado de la sesión anterior, `sesión 2`): puede
haber subcuentas de prueba tipo "Prueba borrar" de pruebas manuales con
curl anteriores, por fuera de esta app. Nadie las buscó ni las tocó
todavía.

## Working tree

Modificados en esta sesión (no commiteados aún): `CLAUDE.md`,
`src/config.js` (comentario), `docs/ghl-create-user.md`, este archivo.
`src/ghl/users.js` tuvo un `console.log` de debug temporal agregado y
revertido en la misma sesión — confirmado con `git diff --stat` que no
quedó rastro, y se redeployó después de revertirlo.
