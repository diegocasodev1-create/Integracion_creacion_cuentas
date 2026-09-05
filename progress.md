# Progress — Integracion Cuentas

Estado real del proyecto a la fecha de abajo. No reemplaza a `docs/superpowers/plans/2026-08-19-integracion-cuentas.md`
(el plan de implementación) ni a `README.md` (instrucciones de dev/deploy) —
este archivo registra en qué quedó el trabajo y qué falta confirmar, para
retomar sin perder contexto entre sesiones.

**Última actualización:** 2026-08-26 (sesión 3, cierre)

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

**Además, en KV (no en GHL):** se había agregado a mano la key
`reseller:diegocaso@gohighascend.com:qEPqvH0BSpJQWIEL6zuV` con metadata
placeholder `"(vinculo manual - subcuenta real existente)"` para poder
probar `POST /api/users` contra un `locationId` real ya existente. **Ya
corregido en esta misma sesión** (ver §5.1) — no queda pendiente.

**Sigue sin revisar** (heredado de la sesión anterior, `sesión 2`): puede
haber subcuentas de prueba tipo "Prueba borrar" de pruebas manuales con
curl anteriores, por fuera de esta app. Nadie las buscó ni las tocó
todavía. Sigue así al cierre de esta sesión — ver "Pendientes" al final.

### 5.1 Corrección del placeholder de KV

El `name`/`city` placeholder de `qEPqvH0BSpJQWIEL6zuV` se corrigió a los
datos reales de esa subcuenta, a pedido del usuario:

```
npx wrangler kv key put "reseller:diegocaso@gohighascend.com:qEPqvH0BSpJQWIEL6zuV" \
  '{"locationId":"qEPqvH0BSpJQWIEL6zuV","name":"Prueba Snapshot cuenta 1","city":"Lima","createdAt":"2026-08-26T00:00:00.000Z"}' \
  --binding=RESELLER_KV --remote \
  --metadata '{"name":"Prueba Snapshot cuenta 1","city":"Lima"}'
```

Confirmado con `wrangler kv key get` (value) y `wrangler kv key list
--prefix` (metadata, que es lo que lee `listResellerSubaccounts` en
`src/kv/resellerLinks.js`) — ambos devuelven `name: "Prueba Snapshot
cuenta 1"`, `city: "Lima"`. Sin texto de debug remanente.

## 6. Commit de la validación de hoy

Los hallazgos de §2–§5.1 (permissions validados, causa real del 502,
snapshot/companyId confirmados, E2E, doc de `settings`/`social`
aclarada) se commitearon en **`770ce05`** — *"docs: confirm real
GHL_COMPANY_ID root cause, validate permissions and E2E flow"* — archivos:
`CLAUDE.md`, `docs/ghl-create-user.md`, `progress.md`, `src/config.js`.
Sin push (queda solo en `main` local, por delante de `origin/main`).

## 7. Rollback: pantalla 1 vuelve a input manual de email

Se auditó la decisión de la sesión previa de reemplazar el input manual de
email por lectura automática de un query param `?email=...` inyectado por
GHL en el Custom Menu Link (commit `9c9b649`, 2026-08-20). Se probó **hoy**
contra el Custom Menu Link real embebido en GHL (URL con
`/custom-menu-link/0319bc43-fed9-490b-bf00-a05bf2419e96`, según reportó el
usuario en esta sesión — no es un dato verificado en logs/repo, es
testimonio directo del usuario) y **falló**: la pantalla mostró el bloqueo
("Accedé desde el menú de GHL...") en vez del menú — el query param no
llegó al iframe real. No se investigó la causa raíz (candidatos: config
del Target URL del Custom Menu Link en GHL, o bug de lectura en `app.js`).
Se decidió revertir en vez de seguir depurando.

**Rollback implementado con TDD** (test primero, confirmado en rojo, luego
código):

- `public/state.js`: nueva función pura `resolveEmailSubmit(state, email,
  authorized)` — decide la transición a `select` o el mensaje de error,
  misma lógica que antes estaba inline en `app.js`.
- `test/frontend/state.test.js`: 2 tests nuevos para `resolveEmailSubmit`
  (autorizado → avanza y normaliza el email; no autorizado → mantiene la
  pantalla y devuelve el mensaje de error). Es la primera cobertura de
  test que tiene el flujo de pantalla 1 — antes tenía cero.
- `public/app.js`: sacado `initEmailScreen` (lectura de query param,
  pre-fill, `readOnly`, bloqueo de pantalla completa). El submit handler
  del `#email-form` sigue llamando al mismo `GET /api/whitelist?email=...`
  que ya existía desde antes de `9c9b649` (confirmado con `git log`:
  ruta agregada en `959b8e1`, `08:16`; el fetch del frontend en `89fbae9`,
  `08:21`; el query-param vino después, `9c9b649`, `08:57` — mismo día,
  20/08) — no se inventó ningún endpoint nuevo.
- `public/index.html`: sacado el `<p id="email-blocked">`.
- `CLAUDE.md` / `brief-integracion-cuentas.md`: diseño actualizado +
  nota de historial citando el commit `9c9b649`, la fecha de hoy, y el
  resultado real de la prueba contra el Custom Menu Link.

**Suite completa: 74/74 tests en verde** (72 previos + 2 nuevos) antes de
commitear.

**Commit:** `ecf4b57` — *"revert: restore free-text email input on screen
1, drop query-param auto-fill"* — 6 archivos (`CLAUDE.md`,
`brief-integracion-cuentas.md`, `public/app.js`, `public/index.html`,
`public/state.js`, `test/frontend/state.test.js`). Sin push.

**Deploy: hecho.** `npm run deploy` corrido después del commit —
`Success!`, 3 assets subidos (`state.js`, `index.html`, `app.js`), binding
`RESELLER_KV` confirmado, Worker en la misma URL de siempre
(`https://integracion-cuentas.diegocaso.workers.dev`), **Version ID
`7d0f86a3-36b2-4f69-bfdb-c571b7d3cca1`**. El rollback del input manual
está en producción al cierre de esta sesión.

**No verificado todavía:** que el input manual funcione correctamente
dentro del iframe real del Custom Menu Link en GHL (con hard refresh, para
descartar caché del navegador/CDN sobre los assets viejos) — ver
"Pendientes" abajo.

## Working tree al cierre de la sesión

`git status` limpio — los dos commits de hoy (`770ce05`, `ecf4b57`) están
en `main` local, sin cambios sin commitear. **Ninguno de los dos se
pusheó** — `main` local queda por delante de `origin/main`.

## Pendientes para la próxima sesión

1. **Verificar el rollback en el CRM real, con hard refresh.** El deploy
   ya está hecho (Version ID `7d0f86a3-36b2-4f69-bfdb-c571b7d3cca1`), pero
   nadie confirmó todavía que al abrir el Custom Menu Link real en GHL
   aparezca el input manual de email en vez del bloqueo viejo — hacer hard
   refresh (`Ctrl+Shift+R` o equivalente) para descartar que el navegador o
   una CDN estén sirviendo `app.js`/`index.html` cacheados de antes del
   deploy.
2. **Revisión manual en el dashboard de GHL** de las subcuentas/usuarios
   de prueba creados durante la validación de hoy — sigue sin tocar, nadie
   con acceso al dashboard lo revisó:
   - Subcuenta `DK7oe8JbOYVbicoifcA3` ("Prueba borrar - QA snapshot v2",
     Lima, PE).
   - Usuarios: `prueba.borrar.usuario.qa@example.com`
     (`LSMzWQsrRQiKt8jkLkI7`), `qa2@example.com` (`X0MlRo0mncixPIoAbDmE`),
     `qa3@example.com` (`5FxvWLxzyVsV36CI4xyM`) — los 3 en
     `qEPqvH0BSpJQWIEL6zuV` — y `e2e@example.com` (`9k4H7ZjHNJ2sILx5SNP2`)
     en `DK7oe8JbOYVbicoifcA3`.
   - Más las posibles subcuentas "Prueba borrar" de la sesión anterior
     (curl manual, previas a esta sesión), tampoco revisadas todavía.
   No son reversibles por la API de este proyecto (no hay endpoint de
   borrado) — cualquier limpieza es manual en el dashboard.
3. **Push de los 2 commits de hoy** (`770ce05`, `ecf4b57`) — decisión
   pendiente, nadie pidió pushear todavía.
4. Opcional, no bloqueante: investigar por qué GHL fuerza `workflowsEnabled`
   a `false` en `POST /users/` (ver §2), y que `src/ghl/client.js` colapsa
   cualquier error de GHL a HTTP 502 perdiendo el código real (ver §3).
