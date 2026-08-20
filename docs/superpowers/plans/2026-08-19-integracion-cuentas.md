# Integracion Cuentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Worker único (JS vanilla) que deja a resellers de GHL crear subcuentas nuevas y agregar usuarios a subcuentas existentes desde un iframe, sin tocar al equipo técnico.

**Architecture:** Un solo Worker sirve backend (4 endpoints bajo `/api/`) y frontend (4 pantallas HTML estáticas) vía Workers Static Assets, separados por `run_worker_first: ["/api/*"]`. El vínculo reseller↔subcuenta y la whitelist de resellers viven en un único namespace de KV. El Worker llama a la API v2 de GHL (`services.leadconnectorhq.com`) para crear subcuentas y usuarios.

**Tech Stack:** Cloudflare Workers (JavaScript, ES modules, sin TypeScript), Cloudflare KV, Wrangler, Vitest + `@cloudflare/vitest-pool-workers` (tests corren en el runtime real de Workers vía Miniflare).

**Spec:** `docs/design/integracion-cuentas-design.md` (estructura, esquema de KV, contratos de los 4 endpoints, detalles de integración GHL) + `brief-integracion-cuentas.md` (flujo de usuario, alcance) + `docs/ghl-create-location.md`, `docs/ghl-create-user.md`, `docs/permissions.md` (referencia exacta de la API de GHL). Los ejecutores de este plan deben leer los cuatro antes de empezar.

## Global Constraints

- JavaScript vanilla, sin TypeScript, sin framework — ni en backend ni en frontend.
- Todo en un único Worker: backend y frontend en el mismo proyecto/deploy, sin Cloudflare Pages separado.
- Secrets `GHL_TOKEN`, `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID` — nunca hardcodeados, siempre `env.*` poblado vía `wrangler secret put`.
- Todas las llamadas a GHL usan `Version: v3` (no `2021-07-28`) y `Authorization: Bearer {GHL_TOKEN}`, base URL `https://services.leadconnectorhq.com`.
- `role` de usuario creado siempre `"admin"`, `type` siempre `"account"` — sin selector.
- `permissions` en `POST /users/` es el set fijo completo de `docs/permissions.md` (38 flags) — mismo objeto para todo usuario nuevo, sin personalización por rol (fuera de alcance).
- Password de usuario nuevo: mínimo 12 caracteres, 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial — validado client-side y server-side.
- Ningún request pasa de la pantalla 1 (entrada de email) a la pantalla 2 si el email no está en la whitelist de KV.
- Errores de API siempre responden `{ "error": { "code": "...", "message": "..." } }`.

---

## Task 1: Scaffolding del proyecto

**Files:**
- Create: `package.json`
- Create: `wrangler.jsonc`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `.dev.vars.example`
- Create: `src/index.js`
- Test: `test/index.test.js`

**Interfaces:**
- Produces: Worker `fetch(request, env, ctx)` que responde `404` a cualquier ruta (placeholder hasta que Task 14 conecte el router real). Binding KV `env.RESELLER_KV` disponible.

- [ ] **Step 1: Instalar dependencias de dev**

```bash
npm init -y
npm install -D wrangler@latest vitest@latest @cloudflare/vitest-pool-workers@latest
```

- [ ] **Step 2: Ajustar `package.json`**

Agregar `"type": "module"` y los scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Crear `wrangler.jsonc`**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "integracion-cuentas",
  "main": "src/index.js",
  "compatibility_date": "2026-08-19",
  "assets": {
    "directory": "./public/",
    "run_worker_first": ["/api/*"]
  },
  "kv_namespaces": [
    { "binding": "RESELLER_KV", "id": "local-dev-placeholder" }
  ],
  "observability": {
    "enabled": true
  }
}
```

`id` es un placeholder válido para `wrangler dev` y para los tests (corren
contra KV simulado localmente). Se reemplaza por el namespace real en el
Task 18, antes de deployar.

- [ ] **Step 4: Crear `public/` mínimo (para que `assets.directory` no falle)**

```bash
mkdir -p public
```

```html
<!-- public/index.html -->
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Integracion Cuentas</title></head>
<body><p>Placeholder — se reemplaza en Task 15.</p></body>
</html>
```

- [ ] **Step 5: Crear `vitest.config.js`**

```js
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
```

**Nota (corrección post-plan):** el snippet original de este plan usaba
`defineWorkersConfig` de `@cloudflare/vitest-pool-workers/config` — esa API
no existe en `@cloudflare/vitest-pool-workers@0.22.0` (el paquete que
instala `npm install -D @cloudflare/vitest-pool-workers@latest`, pareado con
Vitest 4). La versión actual usa un plugin de Vite (`cloudflareTest`)
exportado desde la raíz del paquete, registrado en `plugins: []` de
`defineConfig` de `vitest/config` — confirmado contra
`developers.cloudflare.com/workers/testing/vitest-integration/` y contra el
`.d.mts` del paquete instalado (`cloudflareTest(options): Vite.Plugin`,
`options.wrangler.configPath: string`). El uso de `cloudflare:test` (`env`,
`SELF`) dentro de los archivos de test, referenciado en todas las tasks
siguientes, no cambia.

- [ ] **Step 6: Crear `.gitignore` y `.dev.vars.example`**

```
# .gitignore
node_modules/
.wrangler/
.dev.vars
```

```
# .dev.vars.example
GHL_TOKEN=
GHL_COMPANY_ID=
GHL_SNAPSHOT_ID=
```

- [ ] **Step 7: Escribir el test de smoke (falla primero)**

```js
// test/index.test.js
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Worker entry point", () => {
  it("responde 404 con forma de error JSON en una ruta inexistente", async () => {
    const response = await SELF.fetch("https://example.com/api/no-existe");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 8: Correr el test y verificar que falla**

Run: `npx vitest run test/index.test.js`
Expected: FAIL (no existe `src/index.js` todavía, o no exporta `fetch`)

- [ ] **Step 9: Implementación mínima**

```js
// src/index.js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: `No existe ${request.method} ${url.pathname}` } }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
};
```

- [ ] **Step 10: Correr el test y verificar que pasa**

Run: `npx vitest run test/index.test.js`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc vitest.config.js .gitignore .dev.vars.example public/index.html src/index.js test/index.test.js
git commit -m "chore: scaffold Worker project (JS, wrangler, vitest-pool-workers)"
```

---

## Task 2: `src/config.js` — timezones, permissions fijos, normalización de email

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `getTimezoneForCountry(countryCode) -> string` (lanza `Error` si no hay mapeo), `normalizeEmail(email) -> string`, `FIXED_PERMISSIONS` (objeto de 38 flags, exportado tal cual, usado por Task 9).

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/config.test.js
import { describe, it, expect } from "vitest";
import { getTimezoneForCountry, normalizeEmail, FIXED_PERMISSIONS } from "../src/config.js";

describe("getTimezoneForCountry", () => {
  it("devuelve America/Lima para PE", () => {
    expect(getTimezoneForCountry("PE")).toBe("America/Lima");
  });

  it("devuelve America/Chicago para US", () => {
    expect(getTimezoneForCountry("US")).toBe("America/Chicago");
  });

  it("lanza error mencionando el código de país cuando no hay mapeo", () => {
    expect(() => getTimezoneForCountry("ZZ")).toThrow(/ZZ/);
  });
});

describe("normalizeEmail", () => {
  it("recorta espacios y pasa a minúsculas", () => {
    expect(normalizeEmail("  Juan.Perez@Agencia.com  ")).toBe("juan.perez@agencia.com");
  });
});

describe("FIXED_PERMISSIONS", () => {
  it("incluye los flags documentados en la API v3 actual", () => {
    expect(FIXED_PERMISSIONS.campaignsEnabled).toBe(true);
    expect(FIXED_PERMISSIONS.campaignsReadOnly).toBe(false);
    expect(FIXED_PERMISSIONS.contactsEnabled).toBe(true);
    expect(FIXED_PERMISSIONS.workflowsEnabled).toBe(true);
  });

  it("tiene 38 flags en total", () => {
    expect(Object.keys(FIXED_PERMISSIONS)).toHaveLength(38);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/config.test.js`
Expected: FAIL (`src/config.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/config.js

export const TIMEZONE_BY_COUNTRY = {
  PE: "America/Lima",
  US: "America/Chicago",
};

export function getTimezoneForCountry(countryCode) {
  const timezone = TIMEZONE_BY_COUNTRY[countryCode];
  if (!timezone) {
    throw new Error(`No hay timezone configurado para el país "${countryCode}"`);
  }
  return timezone;
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// Set base fijo de docs/permissions.md — mismo objeto para todo usuario
// nuevo creado desde el modal "Crear Usuario" (rol fijo "admin").
// Validar en la primera llamada real contra la cuenta (ver docs/ghl-create-user.md):
// si GHL ignora/rechaza los flags no documentados en v3, reducir a los 4
// confirmados (campaignsEnabled, campaignsReadOnly, contactsEnabled, workflowsEnabled).
export const FIXED_PERMISSIONS = {
  campaignsEnabled: true,
  campaignsReadOnly: false,
  contactsEnabled: true,
  workflowsEnabled: true,
  workflowsReadOnly: true,
  triggersEnabled: true,
  funnelsEnabled: true,
  websitesEnabled: false,
  opportunitiesEnabled: true,
  dashboardStatsEnabled: true,
  bulkRequestsEnabled: true,
  appointmentsEnabled: true,
  reviewsEnabled: true,
  onlineListingsEnabled: true,
  phoneCallEnabled: true,
  conversationsEnabled: true,
  assignedDataOnly: false,
  adwordsReportingEnabled: false,
  membershipEnabled: false,
  facebookAdsReportingEnabled: false,
  attributionsReportingEnabled: false,
  settingsEnabled: true,
  tagsEnabled: true,
  leadValueEnabled: true,
  marketingEnabled: true,
  agentReportingEnabled: true,
  botService: false,
  socialPlanner: true,
  bloggingEnabled: true,
  invoiceEnabled: true,
  affiliateManagerEnabled: true,
  contentAiEnabled: true,
  refundsEnabled: true,
  recordPaymentEnabled: true,
  cancelSubscriptionEnabled: true,
  paymentsEnabled: true,
  communitiesEnabled: true,
  exportPaymentsEnabled: true,
};
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/config.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: add config module (timezones, fixed permissions, email normalization)"
```

---

## Task 3: `src/kv/whitelist.js` — whitelist de resellers

**Files:**
- Create: `src/kv/whitelist.js`
- Test: `test/kv/whitelist.test.js`

**Interfaces:**
- Consumes: `normalizeEmail` de `src/config.js`.
- Produces: `isResellerWhitelisted(kv, email) -> Promise<boolean>`, usado por Task 10.

- [ ] **Step 1: Escribir el test (falla primero)**

```js
// test/kv/whitelist.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { isResellerWhitelisted } from "../../src/kv/whitelist.js";

describe("isResellerWhitelisted", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("devuelve true si el email normalizado está en la whitelist", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    expect(await isResellerWhitelisted(env.RESELLER_KV, "Juan.Perez@Agencia.com")).toBe(true);
  });

  it("devuelve false si la key no existe", async () => {
    expect(await isResellerWhitelisted(env.RESELLER_KV, "nadie@agencia.com")).toBe(false);
  });

  it("devuelve false si el valor guardado no es \"true\"", async () => {
    await env.RESELLER_KV.put("whitelist:otro@agencia.com", "false");
    expect(await isResellerWhitelisted(env.RESELLER_KV, "otro@agencia.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/kv/whitelist.test.js`
Expected: FAIL (`src/kv/whitelist.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/kv/whitelist.js
import { normalizeEmail } from "../config.js";

export async function isResellerWhitelisted(kv, email) {
  const key = `whitelist:${normalizeEmail(email)}`;
  const value = await kv.get(key);
  return value === "true";
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/kv/whitelist.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kv/whitelist.js test/kv/whitelist.test.js
git commit -m "feat: add reseller whitelist KV lookup"
```

---

## Task 4: `src/kv/resellerLinks.js` — vínculo reseller ↔ subcuenta

**Files:**
- Create: `src/kv/resellerLinks.js`
- Test: `test/kv/resellerLinks.test.js`

**Interfaces:**
- Consumes: `normalizeEmail` de `src/config.js`.
- Produces: `saveResellerLink(kv, { resellerEmail, locationId, name, city }) -> Promise<void>`, `getResellerLink(kv, resellerEmail, locationId) -> Promise<object|null>`, `listResellerSubaccounts(kv, resellerEmail) -> Promise<Array<{locationId, name, city}>>` — usados por Tasks 11, 12, 13.

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/kv/resellerLinks.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { saveResellerLink, getResellerLink, listResellerSubaccounts } from "../../src/kv/resellerLinks.js";

describe("resellerLinks", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("guarda y recupera un vínculo por email + locationId", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "Juan.Perez@Agencia.com",
      locationId: "loc_abc123",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });

    const link = await getResellerLink(env.RESELLER_KV, "juan.perez@agencia.com", "loc_abc123");
    expect(link.locationId).toBe("loc_abc123");
    expect(link.name).toBe("Clínica Dental Sonrisas");
    expect(link.city).toBe("Guadalajara");
    expect(typeof link.createdAt).toBe("string");
  });

  it("getResellerLink devuelve null si no existe el vínculo", async () => {
    const link = await getResellerLink(env.RESELLER_KV, "nadie@agencia.com", "loc_xxx");
    expect(link).toBeNull();
  });

  it("lista solo las subcuentas del email dado, usando la metadata", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_1",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_2",
      name: "Taller Mecánico El Rayo",
      city: "Monterrey",
    });
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "otro@agencia.com",
      locationId: "loc_3",
      name: "No debería aparecer",
      city: "CDMX",
    });

    const subaccounts = await listResellerSubaccounts(env.RESELLER_KV, "juan.perez@agencia.com");

    expect(subaccounts).toHaveLength(2);
    expect(subaccounts).toEqual(
      expect.arrayContaining([
        { locationId: "loc_1", name: "Clínica Dental Sonrisas", city: "Guadalajara" },
        { locationId: "loc_2", name: "Taller Mecánico El Rayo", city: "Monterrey" },
      ])
    );
  });

  it("lista vacía si el reseller no tiene subcuentas", async () => {
    expect(await listResellerSubaccounts(env.RESELLER_KV, "nadie@agencia.com")).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/kv/resellerLinks.test.js`
Expected: FAIL (`src/kv/resellerLinks.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/kv/resellerLinks.js
import { normalizeEmail } from "../config.js";

// Única fuente de verdad para el prefijo `reseller:{email}:` — buildKey y
// listResellerSubaccounts lo consumen desde acá para que no puedan
// desincronizarse si el formato de key cambia en el futuro.
function buildPrefix(resellerEmail) {
  return `reseller:${normalizeEmail(resellerEmail)}:`;
}

function buildKey(resellerEmail, locationId) {
  return `${buildPrefix(resellerEmail)}${locationId}`;
}

export async function saveResellerLink(kv, { resellerEmail, locationId, name, city }) {
  const key = buildKey(resellerEmail, locationId);
  const value = JSON.stringify({ locationId, name, city, createdAt: new Date().toISOString() });
  await kv.put(key, value, { metadata: { name, city } });
}

export async function getResellerLink(kv, resellerEmail, locationId) {
  const key = buildKey(resellerEmail, locationId);
  return kv.get(key, "json");
}

export async function listResellerSubaccounts(kv, resellerEmail) {
  const prefix = buildPrefix(resellerEmail);
  const { keys } = await kv.list({ prefix });
  return keys.map((entry) => ({
    locationId: entry.name.slice(prefix.length),
    name: entry.metadata?.name ?? "",
    city: entry.metadata?.city ?? "",
  }));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/kv/resellerLinks.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kv/resellerLinks.js test/kv/resellerLinks.test.js
git commit -m "feat: add reseller-subaccount KV link (save/get/list)"
```

---

## Task 5: `src/validation.js` — validación de payloads entrantes

**Files:**
- Create: `src/validation.js`
- Test: `test/validation.test.js`

**Interfaces:**
- Produces: `isValidEmail(value) -> boolean`, `isValidPassword(value) -> boolean`, `validateCreateSubaccountPayload(body) -> string[]`, `validateCreateUserPayload(body) -> string[]` — arrays vacíos significan "válido". Usados por Tasks 11 y 13.

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/validation.test.js
import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidPassword,
  validateCreateSubaccountPayload,
  validateCreateUserPayload,
} from "../src/validation.js";

describe("isValidEmail", () => {
  it("acepta un email con formato válido", () => {
    expect(isValidEmail("juan.perez@agencia.com")).toBe(true);
  });

  it("rechaza strings sin @", () => {
    expect(isValidEmail("juan.perez-agencia.com")).toBe(false);
  });

  it("rechaza undefined", () => {
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("acepta una password que cumple los 4 requisitos y 12+ caracteres", () => {
    expect(isValidPassword("Str0ng!Passw0rd")).toBe(true);
  });

  it("rechaza una password de menos de 12 caracteres", () => {
    expect(isValidPassword("Sh0rt!Aa")).toBe(false);
  });

  it("rechaza una password sin carácter especial", () => {
    expect(isValidPassword("LongPassword123")).toBe(false);
  });

  it("rechaza una password sin mayúscula", () => {
    expect(isValidPassword("longpassword123!")).toBe(false);
  });

  it("rechaza una password sin número", () => {
    expect(isValidPassword("LongPassword!!!")).toBe(false);
  });
});

describe("validateCreateSubaccountPayload", () => {
  const validPayload = {
    resellerEmail: "juan.perez@agencia.com",
    client: { firstName: "María", lastName: "López", phone: "+52 33 1234 5678", email: "maria@clinica.com" },
    business: {
      name: "Clínica Dental Sonrisas",
      address: "Av. Vallarta 1234",
      city: "Guadalajara",
      state: "Jalisco",
      country: "MX",
      postalCode: "44100",
      website: "https://clinicasonrisas.mx",
    },
    installSnapshot: true,
  };

  it("no devuelve errores para un payload completo y válido", () => {
    expect(validateCreateSubaccountPayload(validPayload)).toEqual([]);
  });

  it("reporta resellerEmail inválido", () => {
    const errors = validateCreateSubaccountPayload({ ...validPayload, resellerEmail: "no-es-email" });
    expect(errors.some((e) => e.includes("resellerEmail"))).toBe(true);
  });

  it("reporta business.name faltante", () => {
    const errors = validateCreateSubaccountPayload({
      ...validPayload,
      business: { ...validPayload.business, name: "" },
    });
    expect(errors.some((e) => e.includes("business.name"))).toBe(true);
  });

  it("reporta installSnapshot no-boolean", () => {
    const errors = validateCreateSubaccountPayload({ ...validPayload, installSnapshot: "si" });
    expect(errors.some((e) => e.includes("installSnapshot"))).toBe(true);
  });

  it("no exige business.website", () => {
    const { website, ...businessSinWebsite } = validPayload.business;
    const errors = validateCreateSubaccountPayload({ ...validPayload, business: businessSinWebsite });
    expect(errors).toEqual([]);
  });
});

describe("validateCreateUserPayload", () => {
  const validPayload = {
    resellerEmail: "juan.perez@agencia.com",
    locationId: "loc_abc123",
    firstName: "Carlos",
    lastName: "Ramírez",
    email: "carlos@clinica.com",
    phone: "+52 33 9876 5432",
    password: "Str0ng!Passw0rd",
  };

  it("no devuelve errores para un payload completo y válido", () => {
    expect(validateCreateUserPayload(validPayload)).toEqual([]);
  });

  it("reporta locationId faltante", () => {
    const errors = validateCreateUserPayload({ ...validPayload, locationId: "" });
    expect(errors.some((e) => e.includes("locationId"))).toBe(true);
  });

  it("reporta password que no cumple la política", () => {
    const errors = validateCreateUserPayload({ ...validPayload, password: "corta" });
    expect(errors.some((e) => e.includes("password"))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/validation.test.js`
Expected: FAIL (`src/validation.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/validation.js

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mín. 12 caracteres, 1 minúscula, 1 mayúscula, 1 número, 1 carácter especial.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export function isValidEmail(value) {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

export function isValidPassword(value) {
  return typeof value === "string" && PASSWORD_REGEX.test(value);
}

export function validateCreateSubaccountPayload(body) {
  const errors = [];
  if (!isValidEmail(body?.resellerEmail)) errors.push("resellerEmail inválido o faltante");

  const client = body?.client ?? {};
  if (!client.firstName) errors.push("client.firstName es requerido");
  if (!client.lastName) errors.push("client.lastName es requerido");
  if (!client.phone) errors.push("client.phone es requerido");
  if (!isValidEmail(client.email)) errors.push("client.email inválido o faltante");

  const business = body?.business ?? {};
  if (!business.name) errors.push("business.name es requerido");
  if (!business.address) errors.push("business.address es requerido");
  if (!business.city) errors.push("business.city es requerido");
  if (!business.state) errors.push("business.state es requerido");
  if (!business.country) errors.push("business.country es requerido");
  if (!business.postalCode) errors.push("business.postalCode es requerido");

  if (typeof body?.installSnapshot !== "boolean") errors.push("installSnapshot debe ser boolean");

  return errors;
}

export function validateCreateUserPayload(body) {
  const errors = [];
  if (!isValidEmail(body?.resellerEmail)) errors.push("resellerEmail inválido o faltante");
  if (!body?.locationId) errors.push("locationId es requerido");
  if (!body?.firstName) errors.push("firstName es requerido");
  if (!body?.lastName) errors.push("lastName es requerido");
  if (!isValidEmail(body?.email)) errors.push("email inválido o faltante");
  if (!body?.phone) errors.push("phone es requerido");
  if (!isValidPassword(body?.password)) {
    errors.push(
      "password debe tener mínimo 12 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial"
    );
  }
  return errors;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/validation.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/validation.js test/validation.test.js
git commit -m "feat: add request payload validation"
```

---

## Task 6: `src/http.js` — helpers de response JSON

**Files:**
- Create: `src/http.js`
- Test: `test/http.test.js`

**Interfaces:**
- Produces: `jsonResponse(data, init?) -> Response`, `errorResponse(status, code, message) -> Response` — usados por todos los handlers (Tasks 10–13) y el router (Task 14).

- [ ] **Step 1: Escribir el test (falla primero)**

```js
// test/http.test.js
import { describe, it, expect } from "vitest";
import { jsonResponse, errorResponse } from "../src/http.js";

describe("jsonResponse", () => {
  it("serializa el body y setea Content-Type", async () => {
    const response = jsonResponse({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("usa status 200 por default", () => {
    expect(jsonResponse({}).status).toBe(200);
  });
});

describe("errorResponse", () => {
  it("arma la forma { error: { code, message } } con el status dado", async () => {
    const response = errorResponse(400, "VALIDATION_ERROR", "campo faltante");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "campo faltante" },
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/http.test.js`
Expected: FAIL (`src/http.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/http.js

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export function errorResponse(status, code, message) {
  return jsonResponse({ error: { code, message } }, { status });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/http.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/http.js test/http.test.js
git commit -m "feat: add JSON response helpers"
```

---

## Task 7: `src/ghl/client.js` — cliente HTTP hacia GHL

**Files:**
- Create: `src/ghl/client.js`
- Test: `test/ghl/client.test.js`

**Interfaces:**
- Produces: `ghlFetch(env, path, { method, body }) -> Promise<object|null>`, clase `GhlApiError extends Error` con `.status` y `.body` — usados por Tasks 8 y 9.

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/ghl/client.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { ghlFetch, GhlApiError } from "../../src/ghl/client.js";

const env = { GHL_TOKEN: "test-token" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ghlFetch", () => {
  it("llama a la URL correcta con headers Version v3 y Authorization Bearer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await ghlFetch(env, "/locations/", { method: "POST", body: { name: "Test" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://services.leadconnectorhq.com/locations/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          Version: "v3",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Test" }),
      })
    );
  });

  it("devuelve el body parseado como JSON cuando la respuesta es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 }))
    );

    const result = await ghlFetch(env, "/locations/", { method: "POST", body: {} });
    expect(result).toEqual({ id: "loc_abc" });
  });

  it("lanza GhlApiError con el message de GHL cuando la respuesta no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "companyId inválido" }), { status: 400 })
      )
    );

    await expect(ghlFetch(env, "/locations/", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "GhlApiError",
      status: 400,
      message: "companyId inválido",
    });
  });

  it("GhlApiError usa un mensaje default si GHL no manda message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    await expect(ghlFetch(env, "/locations/", { method: "POST", body: {} })).rejects.toThrow(
      /GHL respondió 500/
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/ghl/client.test.js`
Expected: FAIL (`src/ghl/client.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/ghl/client.js

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "v3";

export class GhlApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    this.body = body;
  }
}

export async function ghlFetch(env, path, { method = "GET", body } = {}) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: GHL_API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new GhlApiError(data?.message ?? `GHL respondió ${response.status}`, {
      status: response.status,
      body: data,
    });
  }

  return data;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/ghl/client.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ghl/client.js test/ghl/client.test.js
git commit -m "feat: add GHL API client (Version v3, Bearer auth, error passthrough)"
```

---

## Task 8: `src/ghl/locations.js` — crear subcuenta en GHL

**Files:**
- Create: `src/ghl/locations.js`
- Test: `test/ghl/locations.test.js`

**Interfaces:**
- Consumes: `ghlFetch` de `src/ghl/client.js`.
- Produces: `createLocation(env, params) -> Promise<object>` (devuelve el location tal como lo manda GHL, incluye `.id`) — usado por Task 11.

- [ ] **Step 1: Escribir el test (falla primero)**

```js
// test/ghl/locations.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { createLocation } from "../../src/ghl/locations.js";

const env = { GHL_TOKEN: "test-token", GHL_COMPANY_ID: "comp_123", GHL_SNAPSHOT_ID: "snap_456" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLocation", () => {
  it("arma el payload correcto y devuelve la respuesta de GHL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "loc_abc", name: "Clínica Dental Sonrisas", city: "Guadalajara" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createLocation(env, {
      name: "Clínica Dental Sonrisas",
      phone: "+52 33 1234 5678",
      address: "Av. Vallarta 1234",
      city: "Guadalajara",
      state: "Jalisco",
      country: "MX",
      postalCode: "44100",
      website: "https://clinicasonrisas.mx",
      timezone: "America/Lima",
      prospectInfo: { firstName: "María", lastName: "López", email: "maria@clinica.com" },
      installSnapshot: true,
    });

    expect(result).toEqual({ id: "loc_abc", name: "Clínica Dental Sonrisas", city: "Guadalajara" });

    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.companyId).toBe("comp_123");
    expect(sentBody.snapshotId).toBe("snap_456");
    expect(sentBody.name).toBe("Clínica Dental Sonrisas");
    expect(sentBody.settings).toBeUndefined();
    expect(sentBody.social).toBeUndefined();
  });

  it("no incluye snapshotId cuando installSnapshot es false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createLocation(env, {
      name: "Taller Mecánico El Rayo",
      address: "Calle Falsa 123",
      city: "Monterrey",
      state: "Nuevo León",
      country: "MX",
      postalCode: "64000",
      prospectInfo: { firstName: "Juan", lastName: "Pérez", email: "juan@taller.com" },
      installSnapshot: false,
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body).snapshotId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/ghl/locations.test.js`
Expected: FAIL (`src/ghl/locations.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/ghl/locations.js
import { ghlFetch } from "./client.js";

export async function createLocation(
  env,
  { name, phone, address, city, state, country, postalCode, website, timezone, prospectInfo, installSnapshot }
) {
  const payload = {
    name,
    phone,
    companyId: env.GHL_COMPANY_ID,
    address,
    city,
    state,
    country,
    postalCode,
    website,
    timezone,
    prospectInfo,
  };

  if (installSnapshot) {
    payload.snapshotId = env.GHL_SNAPSHOT_ID;
  }

  return ghlFetch(env, "/locations/", { method: "POST", body: payload });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/ghl/locations.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ghl/locations.js test/ghl/locations.test.js
git commit -m "feat: add GHL createLocation"
```

---

## Task 9: `src/ghl/users.js` — crear usuario en GHL

**Files:**
- Create: `src/ghl/users.js`
- Test: `test/ghl/users.test.js`

**Interfaces:**
- Consumes: `ghlFetch` de `src/ghl/client.js`, `FIXED_PERMISSIONS` de `src/config.js`.
- Produces: `createUser(env, params) -> Promise<object>` (devuelve el user tal como lo manda GHL, incluye `.id`) — usado por Task 13.

- [ ] **Step 1: Escribir el test (falla primero)**

```js
// test/ghl/users.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { createUser } from "../../src/ghl/users.js";
import { FIXED_PERMISSIONS } from "../../src/config.js";

const env = { GHL_TOKEN: "test-token", GHL_COMPANY_ID: "comp_123" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUser", () => {
  it("arma el payload con role admin, type account y permissions fijos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "usr_xyz" }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createUser(env, {
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      password: "Str0ng!Passw0rd",
      phone: "+52 33 9876 5432",
      locationId: "loc_abc123",
    });

    expect(result).toEqual({ id: "usr_xyz" });

    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.companyId).toBe("comp_123");
    expect(sentBody.type).toBe("account");
    expect(sentBody.role).toBe("admin");
    expect(sentBody.locationIds).toEqual(["loc_abc123"]);
    expect(sentBody.permissions).toEqual(FIXED_PERMISSIONS);
    expect(sentBody.scopes).toBeUndefined();
    expect(sentBody.profilePhoto).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/ghl/users.test.js`
Expected: FAIL (`src/ghl/users.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/ghl/users.js
import { ghlFetch } from "./client.js";
import { FIXED_PERMISSIONS } from "../config.js";

export async function createUser(env, { firstName, lastName, email, password, phone, locationId }) {
  const payload = {
    companyId: env.GHL_COMPANY_ID,
    firstName,
    lastName,
    email,
    password,
    phone,
    type: "account",
    role: "admin",
    locationIds: [locationId],
    permissions: FIXED_PERMISSIONS,
  };

  return ghlFetch(env, "/users/", { method: "POST", body: payload });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/ghl/users.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ghl/users.js test/ghl/users.test.js
git commit -m "feat: add GHL createUser (fixed role admin + permissions)"
```

---

## Task 10: `GET /api/whitelist` — verificar reseller autorizado

**Files:**
- Create: `src/handlers/verifyReseller.js`
- Test: `test/handlers/verifyReseller.test.js`

**Interfaces:**
- Consumes: `isValidEmail` (Task 5), `isResellerWhitelisted` (Task 3), `jsonResponse`/`errorResponse` (Task 6).
- Produces: `handleVerifyReseller(request, env) -> Promise<Response>` — usado por el router (Task 14).

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/handlers/verifyReseller.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleVerifyReseller } from "../../src/handlers/verifyReseller.js";

describe("handleVerifyReseller", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("devuelve authorized:true si el email está en la whitelist", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    const request = new Request("https://example.com/api/whitelist?email=juan.perez@agencia.com");

    const response = await handleVerifyReseller(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "juan.perez@agencia.com", authorized: true });
  });

  it("devuelve authorized:false si el email no está en la whitelist", async () => {
    const request = new Request("https://example.com/api/whitelist?email=nadie@agencia.com");
    const response = await handleVerifyReseller(request, env);
    expect(await response.json()).toEqual({ email: "nadie@agencia.com", authorized: false });
  });

  it("responde 400 si falta el query param email", async () => {
    const request = new Request("https://example.com/api/whitelist");
    const response = await handleVerifyReseller(request, env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/handlers/verifyReseller.test.js`
Expected: FAIL (`src/handlers/verifyReseller.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/handlers/verifyReseller.js
import { errorResponse, jsonResponse } from "../http.js";
import { isValidEmail } from "../validation.js";
import { normalizeEmail } from "../config.js";
import { isResellerWhitelisted } from "../kv/whitelist.js";

export async function handleVerifyReseller(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!isValidEmail(email)) {
    return errorResponse(400, "VALIDATION_ERROR", "email inválido o faltante");
  }

  const authorized = await isResellerWhitelisted(env.RESELLER_KV, email);
  return jsonResponse({ email: normalizeEmail(email), authorized });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/handlers/verifyReseller.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/verifyReseller.js test/handlers/verifyReseller.test.js
git commit -m "feat: add GET /api/whitelist handler"
```

---

## Task 11: `POST /api/subaccounts` — crear subcuenta

**Files:**
- Create: `src/handlers/createSubaccount.js`
- Test: `test/handlers/createSubaccount.test.js`

**Interfaces:**
- Consumes: `validateCreateSubaccountPayload` (Task 5), `getTimezoneForCountry` (Task 2), `createLocation`/`GhlApiError` (Tasks 7–8), `saveResellerLink` (Task 4), `jsonResponse`/`errorResponse` (Task 6).
- Produces: `handleCreateSubaccount(request, env) -> Promise<Response>` — usado por el router (Task 14).

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/handlers/createSubaccount.test.js
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCreateSubaccount } from "../../src/handlers/createSubaccount.js";

const validBody = {
  resellerEmail: "juan.perez@agencia.com",
  client: { firstName: "María", lastName: "López", phone: "+52 33 1234 5678", email: "maria@clinica.com" },
  business: {
    name: "Clínica Dental Sonrisas",
    address: "Av. Vallarta 1234",
    city: "Guadalajara",
    state: "Jalisco",
    country: "MX",
    postalCode: "44100",
    website: "https://clinicasonrisas.mx",
  },
  installSnapshot: true,
};

function postRequest(body) {
  return new Request("https://example.com/api/subaccounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("handleCreateSubaccount", () => {
  it("crea la subcuenta en GHL, guarda el vínculo en KV y devuelve 201", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "loc_abc123", name: "Clínica Dental Sonrisas", city: "Guadalajara" }), {
          status: 200,
        })
      )
    );

    const response = await handleCreateSubaccount(postRequest(validBody), env);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      locationId: "loc_abc123",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });

    const link = await env.RESELLER_KV.get("reseller:juan.perez@agencia.com:loc_abc123", "json");
    expect(link.name).toBe("Clínica Dental Sonrisas");
  });

  it("responde 400 sin llamar a GHL si el payload es inválido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateSubaccount(postRequest({ ...validBody, resellerEmail: "no-es-email" }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 si el país no tiene timezone configurado", async () => {
    const response = await handleCreateSubaccount(
      postRequest({ ...validBody, business: { ...validBody.business, country: "ZZ" } }),
      env
    );
    expect(response.status).toBe(400);
  });

  it("responde 502 con el mensaje de GHL si GHL rechaza la creación", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "companyId inválido" }), { status: 400 }))
    );

    const response = await handleCreateSubaccount(postRequest(validBody), env);

    expect(response.status).toBe(502);
    expect((await response.json()).error).toEqual({ code: "GHL_ERROR", message: "companyId inválido" });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/handlers/createSubaccount.test.js`
Expected: FAIL (`src/handlers/createSubaccount.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/handlers/createSubaccount.js
import { errorResponse, jsonResponse } from "../http.js";
import { validateCreateSubaccountPayload } from "../validation.js";
import { getTimezoneForCountry } from "../config.js";
import { createLocation } from "../ghl/locations.js";
import { GhlApiError } from "../ghl/client.js";
import { saveResellerLink } from "../kv/resellerLinks.js";

export async function handleCreateSubaccount(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "El body no es JSON válido");
  }

  const errors = validateCreateSubaccountPayload(body);
  if (errors.length > 0) {
    return errorResponse(400, "VALIDATION_ERROR", errors.join("; "));
  }

  let timezone;
  try {
    timezone = getTimezoneForCountry(body.business.country);
  } catch (err) {
    return errorResponse(400, "VALIDATION_ERROR", err.message);
  }

  let location;
  try {
    location = await createLocation(env, {
      name: body.business.name,
      phone: body.client.phone,
      address: body.business.address,
      city: body.business.city,
      state: body.business.state,
      country: body.business.country,
      postalCode: body.business.postalCode,
      website: body.business.website,
      timezone,
      prospectInfo: {
        firstName: body.client.firstName,
        lastName: body.client.lastName,
        email: body.client.email,
      },
      installSnapshot: body.installSnapshot,
    });
  } catch (err) {
    if (err instanceof GhlApiError) {
      return errorResponse(502, "GHL_ERROR", err.message);
    }
    throw err;
  }

  await saveResellerLink(env.RESELLER_KV, {
    resellerEmail: body.resellerEmail,
    locationId: location.id,
    name: location.name,
    city: location.city,
  });

  return jsonResponse({ locationId: location.id, name: location.name, city: location.city }, { status: 201 });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/handlers/createSubaccount.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/createSubaccount.js test/handlers/createSubaccount.test.js
git commit -m "feat: add POST /api/subaccounts handler"
```

---

## Task 12: `GET /api/subaccounts` — listar subcuentas de un reseller

**Files:**
- Create: `src/handlers/listSubaccounts.js`
- Test: `test/handlers/listSubaccounts.test.js`

**Interfaces:**
- Consumes: `isValidEmail` (Task 5), `listResellerSubaccounts` (Task 4), `jsonResponse`/`errorResponse` (Task 6).
- Produces: `handleListSubaccounts(request, env) -> Promise<Response>` — usado por el router (Task 14).

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/handlers/listSubaccounts.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleListSubaccounts } from "../../src/handlers/listSubaccounts.js";
import { saveResellerLink } from "../../src/kv/resellerLinks.js";

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("handleListSubaccounts", () => {
  it("devuelve las subcuentas ligadas al resellerEmail dado", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_1",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });

    const request = new Request("https://example.com/api/subaccounts?resellerEmail=juan.perez@agencia.com");
    const response = await handleListSubaccounts(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      subaccounts: [{ locationId: "loc_1", name: "Clínica Dental Sonrisas", city: "Guadalajara" }],
    });
  });

  it("devuelve lista vacía (no error) si el reseller no tiene subcuentas", async () => {
    const request = new Request("https://example.com/api/subaccounts?resellerEmail=nadie@agencia.com");
    const response = await handleListSubaccounts(request, env);
    expect(response.status).toBe(200);
    expect((await response.json()).subaccounts).toEqual([]);
  });

  it("responde 400 si falta resellerEmail", async () => {
    const request = new Request("https://example.com/api/subaccounts");
    const response = await handleListSubaccounts(request, env);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/handlers/listSubaccounts.test.js`
Expected: FAIL (`src/handlers/listSubaccounts.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/handlers/listSubaccounts.js
import { errorResponse, jsonResponse } from "../http.js";
import { isValidEmail } from "../validation.js";
import { normalizeEmail } from "../config.js";
import { listResellerSubaccounts } from "../kv/resellerLinks.js";

export async function handleListSubaccounts(request, env) {
  const url = new URL(request.url);
  const resellerEmail = url.searchParams.get("resellerEmail");

  if (!isValidEmail(resellerEmail)) {
    return errorResponse(400, "VALIDATION_ERROR", "resellerEmail inválido o faltante");
  }

  const subaccounts = await listResellerSubaccounts(env.RESELLER_KV, resellerEmail);
  return jsonResponse({ resellerEmail: normalizeEmail(resellerEmail), subaccounts });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/handlers/listSubaccounts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/listSubaccounts.js test/handlers/listSubaccounts.test.js
git commit -m "feat: add GET /api/subaccounts handler"
```

---

## Task 13: `POST /api/users` — crear usuario en una subcuenta

**Files:**
- Create: `src/handlers/createUser.js`
- Test: `test/handlers/createUser.test.js`

**Interfaces:**
- Consumes: `validateCreateUserPayload` (Task 5), `getResellerLink` (Task 4), `createUser`/`GhlApiError` de `src/ghl/users.js` y `src/ghl/client.js` (Tasks 7, 9), `jsonResponse`/`errorResponse` (Task 6).
- Produces: `handleCreateUser(request, env) -> Promise<Response>` — usado por el router (Task 14).

- [ ] **Step 1: Escribir los tests (fallan primero)**

```js
// test/handlers/createUser.test.js
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCreateUser } from "../../src/handlers/createUser.js";
import { saveResellerLink } from "../../src/kv/resellerLinks.js";

const validBody = {
  resellerEmail: "juan.perez@agencia.com",
  locationId: "loc_abc123",
  firstName: "Carlos",
  lastName: "Ramírez",
  email: "carlos@clinica.com",
  phone: "+52 33 9876 5432",
  password: "Str0ng!Passw0rd",
};

function postRequest(body) {
  return new Request("https://example.com/api/users", { method: "POST", body: JSON.stringify(body) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  await saveResellerLink(env.RESELLER_KV, {
    resellerEmail: "juan.perez@agencia.com",
    locationId: "loc_abc123",
    name: "Clínica Dental Sonrisas",
    city: "Guadalajara",
  });
});

describe("handleCreateUser", () => {
  it("crea el usuario en GHL y devuelve 201 cuando la subcuenta pertenece al reseller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "usr_xyz" }), { status: 201 })));

    const response = await handleCreateUser(postRequest(validBody), env);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ userId: "usr_xyz", locationId: "loc_abc123" });
  });

  it("responde 403 si el locationId no está ligado a ese resellerEmail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateUser(
      postRequest({ ...validBody, locationId: "loc_de_otro_reseller" }),
      env
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 sin llamar a GHL si la password no cumple la política", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateUser(postRequest({ ...validBody, password: "corta" }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 502 con el mensaje de GHL si GHL rechaza la password igual", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "password no cumple la política de GHL" }), { status: 400 }))
    );

    const response = await handleCreateUser(postRequest(validBody), env);

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toBe("password no cumple la política de GHL");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/handlers/createUser.test.js`
Expected: FAIL (`src/handlers/createUser.js` no existe)

- [ ] **Step 3: Implementación**

```js
// src/handlers/createUser.js
import { errorResponse, jsonResponse } from "../http.js";
import { validateCreateUserPayload } from "../validation.js";
import { getResellerLink } from "../kv/resellerLinks.js";
import { createUser } from "../ghl/users.js";
import { GhlApiError } from "../ghl/client.js";

export async function handleCreateUser(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "El body no es JSON válido");
  }

  const errors = validateCreateUserPayload(body);
  if (errors.length > 0) {
    return errorResponse(400, "VALIDATION_ERROR", errors.join("; "));
  }

  const link = await getResellerLink(env.RESELLER_KV, body.resellerEmail, body.locationId);
  if (!link) {
    return errorResponse(403, "FORBIDDEN", "Esa subcuenta no está ligada a este reseller");
  }

  let user;
  try {
    user = await createUser(env, {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      password: body.password,
      phone: body.phone,
      locationId: body.locationId,
    });
  } catch (err) {
    if (err instanceof GhlApiError) {
      return errorResponse(502, "GHL_ERROR", err.message);
    }
    throw err;
  }

  return jsonResponse({ userId: user.id, locationId: body.locationId }, { status: 201 });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/handlers/createUser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/createUser.js test/handlers/createUser.test.js
git commit -m "feat: add POST /api/users handler with ownership check"
```

---

## Task 14: Router + wiring del entry point

**Files:**
- Modify: `src/index.js`
- Create: `src/router.js`
- Modify: `test/index.test.js`
- Test: `test/router.test.js`

**Interfaces:**
- Consumes: los 4 handlers (Tasks 10–13), `errorResponse` (Task 6).
- Produces: `routeRequest(request, env) -> Promise<Response>`, y `src/index.js` exporta el `fetch` real del Worker.

- [ ] **Step 1: Escribir el test de router (falla primero)**

```js
// test/router.test.js
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { routeRequest } from "../src/router.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("routeRequest", () => {
  it("enruta GET /api/whitelist al handler correcto", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    const response = await routeRequest(
      new Request("https://example.com/api/whitelist?email=juan.perez@agencia.com"),
      env
    );
    expect(response.status).toBe(200);
  });

  it("responde 404 con forma de error para una ruta no registrada", async () => {
    const response = await routeRequest(new Request("https://example.com/api/no-existe"), env);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("responde 500 con forma de error si un handler lanza una excepción no controlada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const response = await routeRequest(
      new Request("https://example.com/api/subaccounts", {
        method: "POST",
        body: JSON.stringify({
          resellerEmail: "juan.perez@agencia.com",
          client: { firstName: "A", lastName: "B", phone: "1", email: "a@b.com" },
          business: { name: "N", address: "A", city: "C", state: "S", country: "PE", postalCode: "1" },
          installSnapshot: false,
        }),
      }),
      env
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/router.test.js`
Expected: FAIL (`src/router.js` no existe)

- [ ] **Step 3: Implementación del router**

```js
// src/router.js
import { handleVerifyReseller } from "./handlers/verifyReseller.js";
import { handleCreateSubaccount } from "./handlers/createSubaccount.js";
import { handleListSubaccounts } from "./handlers/listSubaccounts.js";
import { handleCreateUser } from "./handlers/createUser.js";
import { errorResponse } from "./http.js";

const ROUTES = [
  { method: "GET", pattern: /^\/api\/whitelist$/, handler: handleVerifyReseller },
  { method: "POST", pattern: /^\/api\/subaccounts$/, handler: handleCreateSubaccount },
  { method: "GET", pattern: /^\/api\/subaccounts$/, handler: handleListSubaccounts },
  { method: "POST", pattern: /^\/api\/users$/, handler: handleCreateUser },
];

export async function routeRequest(request, env) {
  const url = new URL(request.url);
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(url.pathname));

  if (!route) {
    return errorResponse(404, "NOT_FOUND", `No existe ${request.method} ${url.pathname}`);
  }

  try {
    return await route.handler(request, env);
  } catch (err) {
    console.error(err);
    return errorResponse(500, "INTERNAL_ERROR", "Error interno del servidor");
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/router.test.js`
Expected: PASS

- [ ] **Step 5: Reemplazar `src/index.js` por el wiring real**

```js
// src/index.js
import { routeRequest } from "./router.js";

export default {
  async fetch(request, env) {
    return routeRequest(request, env);
  },
};
```

- [ ] **Step 6: Actualizar `test/index.test.js`** (el placeholder de Task 1 ya cubría 404; queda igual, correrlo de nuevo para confirmar que sigue pasando con el router real)

Run: `npx vitest run test/index.test.js`
Expected: PASS

- [ ] **Step 7: Correr toda la suite de backend**

Run: `npx vitest run`
Expected: PASS (todos los tests de Tasks 1–14)

- [ ] **Step 8: Commit**

```bash
git add src/index.js src/router.js test/router.test.js
git commit -m "feat: wire router and 4 API endpoints into Worker entry point"
```

---

## Task 15: Frontend — shell + pantalla 1 (entrada de email) + pantalla 2 (selección)

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `public/state.js`
- Test: `test/frontend/state.test.js`

**Interfaces:**
- Produces: `createAppState() -> object` con `.resellerEmail`, `.screen` (`"email" | "select" | "create-subaccount" | "create-user"`), y funciones puras `advanceToSelect(state, email)`, `goToScreen(state, screen)` — usadas por `app.js` (DOM) y por Tasks 16–17.

La lógica de transición de pantallas se extrae a `state.js` como funciones puras
testeables; `app.js` solo hace wiring de DOM (no se testea con TDD estricto,
se verifica manualmente con `wrangler dev` al final de la Task 17).

- [ ] **Step 1: Escribir el test de estado (falla primero)**

```js
// test/frontend/state.test.js
import { describe, it, expect } from "vitest";
import { createAppState, advanceToSelect, goToScreen } from "../../public/state.js";

describe("createAppState", () => {
  it("arranca en la pantalla email sin resellerEmail", () => {
    const state = createAppState();
    expect(state.screen).toBe("email");
    expect(state.resellerEmail).toBeNull();
  });
});

describe("advanceToSelect", () => {
  it("guarda el email normalizado y pasa a la pantalla select", () => {
    const state = advanceToSelect(createAppState(), "  Juan.Perez@Agencia.com  ");
    expect(state.resellerEmail).toBe("juan.perez@agencia.com");
    expect(state.screen).toBe("select");
  });
});

describe("goToScreen", () => {
  it("cambia la pantalla activa", () => {
    const state = goToScreen(advanceToSelect(createAppState(), "a@b.com"), "create-subaccount");
    expect(state.screen).toBe("create-subaccount");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/frontend/state.test.js`
Expected: FAIL (`public/state.js` no existe)

- [ ] **Step 3: Implementación de `state.js`**

```js
// public/state.js

export function createAppState() {
  return { screen: "email", resellerEmail: null };
}

export function advanceToSelect(state, email) {
  return { ...state, resellerEmail: String(email).trim().toLowerCase(), screen: "select" };
}

export function goToScreen(state, screen) {
  return { ...state, screen };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/frontend/state.test.js`
Expected: PASS

- [ ] **Step 5: Shell HTML con las 4 pantallas (ocultas vía `hidden`)**

```html
<!-- public/index.html -->
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Integracion Cuentas</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main>
    <section id="screen-email">
      <h1>Ingresá tu correo de reseller</h1>
      <form id="email-form">
        <input type="email" id="email-input" required placeholder="tu@agencia.com" />
        <button type="submit">Continuar</button>
      </form>
      <p id="email-error" class="error" hidden></p>
    </section>

    <section id="screen-select" hidden>
      <h1>¿Qué querés hacer?</h1>
      <button id="btn-create-subaccount">Crear Subcuenta</button>
      <button id="btn-create-user">Crear Usuario</button>
    </section>

    <section id="screen-create-subaccount" hidden>
      <!-- form completo: Task 16 -->
    </section>

    <section id="screen-create-user" hidden>
      <!-- listado + modal: Task 17 -->
    </section>
  </main>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: `styles.css` mínimo** (layout simple, sin diseño elaborado — no es el foco del brief)

```css
/* public/styles.css */
body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
section[hidden] { display: none; }
.error { color: #b00020; }
button { cursor: pointer; }
```

- [ ] **Step 7: `app.js` — wiring de pantallas 1 y 2**

```js
// public/app.js
import { createAppState, advanceToSelect, goToScreen } from "./state.js";

let state = createAppState();

const screens = {
  email: document.getElementById("screen-email"),
  select: document.getElementById("screen-select"),
  "create-subaccount": document.getElementById("screen-create-subaccount"),
  "create-user": document.getElementById("screen-create-user"),
};

function render() {
  for (const [name, el] of Object.entries(screens)) {
    el.hidden = state.screen !== name;
  }
}

async function checkWhitelist(email) {
  const response = await fetch(`/api/whitelist?email=${encodeURIComponent(email)}`);
  const data = await response.json();
  return data.authorized === true;
}

document.getElementById("email-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email-input").value;
  const errorEl = document.getElementById("email-error");
  errorEl.hidden = true;

  const authorized = await checkWhitelist(email);
  if (!authorized) {
    errorEl.textContent = "Este correo no está autorizado. Contactá al equipo técnico.";
    errorEl.hidden = false;
    return;
  }

  state = advanceToSelect(state, email);
  render();
});

document.getElementById("btn-create-subaccount").addEventListener("click", () => {
  state = goToScreen(state, "create-subaccount");
  render();
});

document.getElementById("btn-create-user").addEventListener("click", () => {
  state = goToScreen(state, "create-user");
  render();
});

render();
```

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/styles.css public/app.js public/state.js test/frontend/state.test.js
git commit -m "feat: frontend shell + pantallas 1 y 2 (entrada email, selección)"
```

---

## Task 16: Frontend — pantalla 3 (Crear Subcuenta)

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `public/forms.js`
- Test: `test/frontend/forms.test.js`

**Interfaces:**
- Consumes: `state.resellerEmail` (Task 15).
- Produces: `buildCreateSubaccountPayload(formData, resellerEmail) -> object` (función pura, testeable) que arma el body exacto para `POST /api/subaccounts` — usada por `app.js`.

- [ ] **Step 1: Escribir el test (falla primero)**

```js
// test/frontend/forms.test.js
import { describe, it, expect } from "vitest";
import { buildCreateSubaccountPayload } from "../../public/forms.js";

describe("buildCreateSubaccountPayload", () => {
  it("arma el payload con la forma que espera POST /api/subaccounts", () => {
    const formData = {
      clientFirstName: "María",
      clientLastName: "López",
      clientPhone: "+52 33 1234 5678",
      clientEmail: "maria@clinica.com",
      businessName: "Clínica Dental Sonrisas",
      businessAddress: "Av. Vallarta 1234",
      businessCity: "Guadalajara",
      businessState: "Jalisco",
      businessCountry: "MX",
      businessPostalCode: "44100",
      businessWebsite: "https://clinicasonrisas.mx",
      installSnapshot: "with",
    };

    const payload = buildCreateSubaccountPayload(formData, "juan.perez@agencia.com");

    expect(payload).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      client: {
        firstName: "María",
        lastName: "López",
        phone: "+52 33 1234 5678",
        email: "maria@clinica.com",
      },
      business: {
        name: "Clínica Dental Sonrisas",
        address: "Av. Vallarta 1234",
        city: "Guadalajara",
        state: "Jalisco",
        country: "MX",
        postalCode: "44100",
        website: "https://clinicasonrisas.mx",
      },
      installSnapshot: true,
    });
  });

  it("installSnapshot es false cuando el radio es \"without\"", () => {
    const payload = buildCreateSubaccountPayload({ installSnapshot: "without" }, "a@b.com");
    expect(payload.installSnapshot).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/frontend/forms.test.js`
Expected: FAIL (`public/forms.js` no existe)

- [ ] **Step 3: Implementación**

```js
// public/forms.js

export function buildCreateSubaccountPayload(formData, resellerEmail) {
  return {
    resellerEmail,
    client: {
      firstName: formData.clientFirstName,
      lastName: formData.clientLastName,
      phone: formData.clientPhone,
      email: formData.clientEmail,
    },
    business: {
      name: formData.businessName,
      address: formData.businessAddress,
      city: formData.businessCity,
      state: formData.businessState,
      country: formData.businessCountry,
      postalCode: formData.businessPostalCode,
      website: formData.businessWebsite,
    },
    installSnapshot: formData.installSnapshot === "with",
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/frontend/forms.test.js`
Expected: PASS

- [ ] **Step 5: Agregar el form real a `public/index.html`** (reemplaza el comentario placeholder de Task 15 en `#screen-create-subaccount`)

```html
<section id="screen-create-subaccount" hidden>
  <h1>Crear Subcuenta</h1>
  <form id="create-subaccount-form">
    <fieldset>
      <legend>Datos del cliente</legend>
      <input name="clientFirstName" placeholder="Nombre" required />
      <input name="clientLastName" placeholder="Apellido" required />
      <input name="clientPhone" placeholder="Celular" required />
      <input type="email" name="clientEmail" placeholder="Email" required />
    </fieldset>
    <fieldset>
      <legend>Datos del negocio</legend>
      <input name="businessName" placeholder="Nombre de la subcuenta" required />
      <input name="businessAddress" placeholder="Dirección" required />
      <input name="businessCity" placeholder="Ciudad" required />
      <input name="businessState" placeholder="Región/Provincia/Estado" required />
      <select name="businessCountry" required>
        <option value="">País</option>
        <option value="PE">Perú</option>
        <option value="US">Estados Unidos</option>
      </select>
      <input name="businessPostalCode" placeholder="Código postal" required />
      <input name="businessWebsite" placeholder="Sitio web (opcional)" />
      <label><input type="radio" name="installSnapshot" value="with" checked /> Con snapshot</label>
      <label><input type="radio" name="installSnapshot" value="without" /> Sin snapshot</label>
    </fieldset>
    <button type="submit">Crear subcuenta</button>
  </form>
  <p id="create-subaccount-error" class="error" hidden></p>
  <p id="create-subaccount-success" hidden></p>
</section>
```

`businessCountry` solo lista los países ya presentes en `TIMEZONE_BY_COUNTRY`
(`src/config.js`) — agregar una opción acá siempre implica agregar su
timezone ahí también.

- [ ] **Step 6: Wiring en `app.js`**

```js
// agregar a public/app.js
import { buildCreateSubaccountPayload } from "./forms.js";

document.getElementById("create-subaccount-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = buildCreateSubaccountPayload(formData, state.resellerEmail);

  const errorEl = document.getElementById("create-subaccount-error");
  const successEl = document.getElementById("create-subaccount-success");
  errorEl.hidden = true;
  successEl.hidden = true;

  const response = await fetch("/api/subaccounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    errorEl.textContent = data.error.message;
    errorEl.hidden = false;
    return;
  }

  successEl.textContent = `Subcuenta "${data.name}" creada en ${data.city}.`;
  successEl.hidden = false;
  form.reset();
});
```

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.js public/forms.js test/frontend/forms.test.js
git commit -m "feat: pantalla Crear Subcuenta"
```

---

## Task 17: Frontend — pantalla 4 (listar subcuentas + modal Crear Usuario)

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/forms.js`
- Modify: `test/frontend/forms.test.js`

**Interfaces:**
- Produces: `buildCreateUserPayload(formData, { resellerEmail, locationId }) -> object`, agregado a `public/forms.js`.

- [ ] **Step 1: Agregar el test (falla primero)**

```js
// agregar a test/frontend/forms.test.js
import { buildCreateUserPayload } from "../../public/forms.js";

describe("buildCreateUserPayload", () => {
  it("arma el payload con la forma que espera POST /api/users", () => {
    const formData = {
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      phone: "+52 33 9876 5432",
      password: "Str0ng!Passw0rd",
    };

    const payload = buildCreateUserPayload(formData, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_abc123",
    });

    expect(payload).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_abc123",
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      phone: "+52 33 9876 5432",
      password: "Str0ng!Passw0rd",
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/frontend/forms.test.js`
Expected: FAIL (`buildCreateUserPayload` no existe)

- [ ] **Step 3: Implementación — agregar a `public/forms.js`**

```js
// agregar a public/forms.js

export function buildCreateUserPayload(formData, { resellerEmail, locationId }) {
  return {
    resellerEmail,
    locationId,
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,
    password: formData.password,
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/frontend/forms.test.js`
Expected: PASS

- [ ] **Step 5: HTML — tarjetas de subcuentas + modal, reemplaza el comentario placeholder en `#screen-create-user`**

```html
<section id="screen-create-user" hidden>
  <h1>Crear Usuario</h1>
  <div id="subaccounts-list"></div>

  <dialog id="create-user-modal">
    <form id="create-user-form" method="dialog">
      <input type="hidden" name="locationId" />
      <input name="firstName" placeholder="Nombre" required />
      <input name="lastName" placeholder="Apellido" required />
      <input type="email" name="email" placeholder="Correo" required />
      <input name="phone" placeholder="Teléfono" required />
      <input
        type="password"
        name="password"
        placeholder="Contraseña (mín. 12, mayús., minús., número, carácter especial)"
        minlength="12"
        pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$"
        required
      />
      <button type="submit">Crear usuario</button>
      <button type="button" id="close-modal">Cancelar</button>
    </form>
    <p id="create-user-error" class="error" hidden></p>
  </dialog>
</section>
```

El atributo `pattern` replica exactamente `PASSWORD_REGEX` de
`src/validation.js` — mantenerlos sincronizados si la política cambia.

- [ ] **Step 6: Wiring en `app.js`**

```js
// agregar a public/app.js
import { buildCreateUserPayload } from "./forms.js";

const modal = document.getElementById("create-user-modal");

async function loadSubaccounts() {
  const response = await fetch(`/api/subaccounts?resellerEmail=${encodeURIComponent(state.resellerEmail)}`);
  const data = await response.json();
  const list = document.getElementById("subaccounts-list");
  list.innerHTML = "";

  for (const sub of data.subaccounts) {
    const card = document.createElement("button");
    card.textContent = `${sub.name} — ${sub.city}`;
    card.addEventListener("click", () => {
      document.querySelector('#create-user-form [name="locationId"]').value = sub.locationId;
      document.getElementById("create-user-error").hidden = true;
      modal.showModal();
    });
    list.appendChild(card);
  }
}

document.getElementById("btn-create-user").addEventListener("click", loadSubaccounts);

document.getElementById("close-modal").addEventListener("click", () => modal.close());

document.getElementById("create-user-form").addEventListener("submit", async (event) => {
  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = buildCreateUserPayload(formData, {
    resellerEmail: state.resellerEmail,
    locationId: formData.locationId,
  });

  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  const errorEl = document.getElementById("create-user-error");
  if (!response.ok) {
    event.preventDefault();
    errorEl.textContent = data.error.message;
    errorEl.hidden = false;
    return;
  }

  form.reset();
});
```

`method="dialog"` cierra el modal solo en submit exitoso; en error se hace
`event.preventDefault()` para mantenerlo abierto y mostrar `create-user-error`.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.js public/forms.js test/frontend/forms.test.js
git commit -m "feat: pantalla Crear Usuario (listado + modal)"
```

---

## Task 18: KV real, secrets, README y verificación manual end-to-end

**Files:**
- Modify: `wrangler.jsonc`
- Create: `README.md`

**Interfaces:** ninguna (task de cierre — infraestructura real + verificación manual, no agrega código de aplicación).

- [ ] **Step 1: Crear el namespace de KV real**

```bash
npx wrangler kv namespace create RESELLER_KV
```

Copiar el `id` que devuelve y reemplazar `"local-dev-placeholder"` en
`wrangler.jsonc` (Task 1, Step 3).

- [ ] **Step 2: Cargar los secrets**

```bash
npx wrangler secret put GHL_TOKEN
npx wrangler secret put GHL_COMPANY_ID
npx wrangler secret put GHL_SNAPSHOT_ID
```

- [ ] **Step 3: Escribir `README.md`**

```markdown
# Integracion Cuentas

Worker de GHL para que resellers creen subcuentas y usuarios sin depender
del equipo técnico. Ver `brief-integracion-cuentas.md` y
`docs/design/integracion-cuentas-design.md` para el diseño completo.

## Desarrollo local

​```bash
npm install
cp .dev.vars.example .dev.vars   # completar con secrets de test
npm run dev
​```

## Tests

​```bash
npm test              # toda la suite
npx vitest run test/handlers/createUser.test.js   # un archivo puntual
​```

## Deploy

​```bash
npx wrangler kv namespace create RESELLER_KV   # una vez, ver Task 18
npx wrangler secret put GHL_TOKEN
npx wrangler secret put GHL_COMPANY_ID
npx wrangler secret put GHL_SNAPSHOT_ID
npm run deploy
​```

## Agregar un reseller a la whitelist

​```bash
npx wrangler kv key put --binding RESELLER_KV "whitelist:nuevo@agencia.com" "true" --remote
​```
```

- [ ] **Step 4: Correr toda la suite una vez más antes de la prueba manual**

Run: `npm test`
Expected: PASS (todos los tests de Tasks 1–17)

- [ ] **Step 5: Verificación manual end-to-end con `wrangler dev`**

```bash
npm run dev
```

Con el worker corriendo local:
1. `npx wrangler kv key put --binding RESELLER_KV "whitelist:tu-email@test.com" "true"` (local, sin `--remote`)
2. Abrir `http://localhost:8787`, entrar ese email → debe avanzar a la pantalla de selección.
3. "Crear Subcuenta" → completar el form → confirmar que devuelve 201 y que la tarjeta aparece luego en "Crear Usuario".
4. "Crear Usuario" → elegir la tarjeta → completar el modal → confirmar 201.
5. **Punto pendiente de `docs/ghl-create-user.md`:** revisar en el dashboard de GHL (o en la respuesta cruda) si los 38 flags de `permissions` se guardaron. Si GHL los ignoró/rechazó, reducir `FIXED_PERMISSIONS` en `src/config.js` a los 4 flags documentados en v3 y volver a correr `test/config.test.js` + `test/ghl/users.test.js` (ajustar sus expectativas al nuevo objeto).

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc README.md
git commit -m "chore: real KV namespace, secrets setup, README"
```

---

## Self-review

- **Cobertura del spec:** las 4 pantallas del brief → Tasks 15–17; los 3 endpoints del brief + el de whitelist (necesario para la pantalla 1→2, no estaba en el brief original pero sí en las correcciones del chat) → Tasks 10–13; esquema de KV → Tasks 3–4; integración GHL (`Version: v3`, permissions fijos, role admin) → Tasks 7–9; validación de password → Task 5 (server) + Task 17 (client, `pattern` en el input); whitelist manual → Task 18, Step "Agregar un reseller".
- **Placeholders:** el único valor no resuelto de antemano es el `id` real del KV namespace (Task 1 usa `"local-dev-placeholder"`, válido para dev/test local, reemplazado en Task 18 con un comando real) — no es un "TBD" de lógica, es una dependencia de infraestructura que solo existe después de correr `wrangler kv namespace create`.
- **Consistencia de tipos/nombres:** `locationId`, `resellerEmail`, `installSnapshot`, `FIXED_PERMISSIONS`, `GhlApiError` se usan con el mismo nombre en todas las tasks que los tocan — verificado línea por línea al escribir cada `Interfaces:`.
