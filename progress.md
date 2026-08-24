# Progress — Integracion Cuentas

Estado real del proyecto a la fecha de abajo. No reemplaza a `docs/superpowers/plans/2026-08-19-integracion-cuentas.md`
(el plan de implementación) ni a `README.md` (instrucciones de dev/deploy) —
este archivo registra en qué quedó el trabajo y qué falta confirmar, para
retomar sin perder contexto entre sesiones.

**Última actualización:** 2026-08-23 (sesión 2)

## 1. Deploy

**Hecho.** El Worker está en producción en
`https://integracion-cuentas.diegocaso.workers.dev` — verificado en esta
sesión con un `curl` directo: `GET /` responde `200`, `GET /api/no-existe`
responde `404` con la forma de error esperada
(`{"error":{"code":"NOT_FOUND",...}}`), confirmando que es el Worker real
y no un placeholder.

**La discrepancia de cuenta/token de la sesión anterior está resuelta.**
El usuario borró `CLOUDFLARE_API_TOKEN` a nivel de sistema; `wrangler
whoami` ahora autentica correctamente contra `diegocaso@gohighascend.com`
(`Diegocaso@gohighascend.com's Account`, id `b039f7aff98607384d4d2543c390dacc`).

Pero eso solo no alcanzó: wrangler además tenía cacheada la cuenta vieja
en un archivo **local al proyecto**,
`node_modules/.cache/wrangler/wrangler-account.json`, con
`"Mimentemillonariaya@gmail.com's Account"` (id
`c7e0611c55f1791c1bde273a55feb446`) — de ahí venían los
`Authentication error [code: 10000]` en `secret list` / `deployments
list` aunque `whoami` ya diera la cuenta correcta. Se borró ese archivo
(se regenera solo, con la cuenta correcta, en el siguiente comando).
**Si vuelve a aparecer `code: 10000` en este repo con `whoami` OK, borrar
ese archivo de nuevo antes de asumir otra cosa.**

Con la cuenta correcta confirmada, se verificó en esta sesión:
- `wrangler secret list` → los 3 secrets existen: `GHL_TOKEN`,
  `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID` (solo nombres, no valores).
- `wrangler kv namespace list` → `RESELLER_KV` (id
  `c5e1aec370654e879f7b4e4c79dd5aef`) coincide con el binding real en
  `wrangler.jsonc`.
- `wrangler kv key list --namespace-id ... --remote` → existe
  `whitelist:diegocaso@gohighascend.com` (confirmado por el usuario que
  la dio de alta a mano por el dashboard). **Gotcha:** `wrangler kv key
  list` sin flag por defecto pega contra `--local` (Miniflare vacío),
  no contra `--remote`; correrlo sin el flag da `[]` y parece "namespace
  vacío" cuando no lo es — pasó en esta misma sesión, hay que acordarse
  de pasar `--remote` siempre para consultar el KV real. No hay keys
  `reseller:*` todavía (consistente con que ninguna subcuenta se creó
  aún de punta a punta a través del endpoint del Worker — ver §4).

El proyecto vive completo en la raíz del repo (`main`) — el worktree
separado (`worktree-integracion-cuentas-impl`) se mergeó y se eliminó en
la sesión anterior.

## 2. `GHL_SNAPSHOT_ID` — falló, actualizado, falta reconfirmar

Prueba manual de "Crear Subcuenta con snapshot" contra la cuenta real de
GHL: **falló con `502` — `Forbidden resource`** usando el `GHL_SNAPSHOT_ID`
original.

Se actualizó el secret a un ID nuevo: `JhOOoC5tfvWcz6EInWMm`.

**Pendiente:** redeploy (`npm run deploy`, o confirmar si el `wrangler
secret put` ya alcanza sin redeploy — a verificar) y reintentar "Crear
Subcuenta con snapshot" contra la cuenta real para confirmar que el nuevo
ID funciona. Hasta reconfirmar, tratar el flujo "con snapshot" como no
verificado en producción (el flujo "sin snapshot" no depende de este ID).

## 3. Pendiente real de Task 18 — verificación de `permissions` contra la cuenta real

Punto que el plan deja explícito en el Step 5 de Task 18
(`docs/superpowers/plans/2026-08-19-integracion-cuentas.md:2574`) y que
sigue sin hacerse: correr el `curl` de `POST /users/` con el objeto
`FIXED_PERMISSIONS` completo contra la cuenta real de GHL y reportar si
la API:
- acepta los flags tal cual,
- los recorta silenciosamente (ignora los no soportados), o
- rechaza la request.

Nota: `FIXED_PERMISSIONS` en `src/config.js` y `docs/permissions.md`
tienen **38** flags, no 37 — verificado contando las claves en esta
sesión (`Object.keys(FIXED_PERMISSIONS).length === 38`). Marco la
diferencia por si el "37" venía de otro conteo; si al correr el `curl`
aparece un flag de más/menos, comparar contra estos 38 antes de asumir
que el número de referencia era otro.

Si GHL recorta o rechaza flags, el plan ya prevé el ajuste: reducir
`FIXED_PERMISSIONS` a los que confirme la API y volver a correr
`test/config.test.js` + `test/ghl/users.test.js` con las expectativas
actualizadas.

## 4. Subcuentas de prueba en la cuenta real — revisar antes de borrar

Durante las pruebas manuales de hoy pueden haber quedado subcuentas de
prueba creadas en la cuenta real de GHL (ej. "Prueba borrar" o similar).
**No las busqué ni las toqué en esta sesión** — queda para la próxima:
revisar el dashboard de GHL, listar lo que aparezca, y confirmar con el
usuario antes de borrar nada (creación de subcuentas reales no es
reversible por la API de este proyecto).

## Working tree

`main` queda limpio — confirmado con `git status` al cierre de esta
sesión: sin cambios sin commitear, sin archivos untracked.
