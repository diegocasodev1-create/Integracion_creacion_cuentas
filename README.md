# Integracion Cuentas

Worker de GHL para que resellers creen subcuentas y usuarios sin depender
del equipo técnico. Ver `brief-integracion-cuentas.md` y
`docs/design/integracion-cuentas-design.md` para el diseño completo.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completar con secrets de test
npm run dev
```

## Tests

```bash
npm test              # toda la suite
npx vitest run test/handlers/createUser.test.js   # un archivo puntual
```

## Deploy

```bash
npx wrangler kv namespace create RESELLER_KV   # una vez
```

Copiar el `id` que imprime el comando anterior y pegarlo en
`wrangler.jsonc`, en `kv_namespaces[0].id` (reemplazando el valor
`"local-dev-placeholder"`).

```bash
npx wrangler secret put GHL_TOKEN
npx wrangler secret put GHL_COMPANY_ID
npx wrangler secret put GHL_SNAPSHOT_ID
npm run deploy
```

## Agregar un reseller a la whitelist

```bash
npx wrangler kv key put --binding RESELLER_KV "whitelist:nuevo@agencia.com" "true" --remote
```
