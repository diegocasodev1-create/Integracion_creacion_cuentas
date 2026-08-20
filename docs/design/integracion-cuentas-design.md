# Diseño — Integracion Cuentas

Consolida las decisiones de diseño acordadas en el chat de planning, a partir
de `brief-integracion-cuentas.md`. Este documento es el spec que sigue el plan
de implementación en `docs/superpowers/plans/`.

## Stack y estructura de carpetas

- Cloudflare Worker único (JavaScript vanilla, sin TypeScript, sin framework).
- Backend (API) y frontend (4 pantallas HTML) se sirven desde el mismo Worker:
  frontend vía **Workers Static Assets**, backend vía el script del Worker,
  separados por `run_worker_first: ["/api/*"]` en `wrangler.jsonc` — todo lo
  que empieza con `/api/` corre el script; el resto se sirve como asset
  estático directamente, sin pasar por el Worker.
- Cloudflare KV para: vínculo reseller↔subcuenta y whitelist de resellers.

```
Integracion Cuentas/
├── brief-integracion-cuentas.md
├── CLAUDE.md
├── README.md
├── package.json
├── wrangler.jsonc
├── vitest.config.js
├── docs/
│   ├── ghl-create-location.md
│   ├── ghl-create-user.md
│   ├── permissions.md
│   └── design/
│       └── integracion-cuentas-design.md
├── src/
│   ├── index.js            # entry point del Worker
│   ├── router.js           # matching de rutas /api/*
│   ├── http.js             # helpers jsonResponse/errorResponse
│   ├── config.js           # timezone por país, permissions fijos, normalizeEmail
│   ├── validation.js       # validación de payloads entrantes
│   ├── handlers/
│   │   ├── verifyReseller.js    # GET  /api/whitelist
│   │   ├── createSubaccount.js  # POST /api/subaccounts
│   │   ├── listSubaccounts.js   # GET  /api/subaccounts
│   │   └── createUser.js        # POST /api/users
│   ├── ghl/
│   │   ├── client.js       # fetch wrapper: base URL, Version v3, Authorization
│   │   ├── locations.js    # createLocation()
│   │   └── users.js        # createUser()
│   └── kv/
│       ├── resellerLinks.js  # saveResellerLink/getResellerLink/listResellerSubaccounts
│       └── whitelist.js      # isResellerWhitelisted
├── public/                 # Static Assets — las 4 pantallas
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── test/
    ├── config.test.js
    ├── validation.test.js
    ├── kv/
    │   ├── whitelist.test.js
    │   └── resellerLinks.test.js
    ├── ghl/
    │   ├── client.test.js
    │   ├── locations.test.js
    │   └── users.test.js
    ├── handlers/
    │   ├── verifyReseller.test.js
    │   ├── createSubaccount.test.js
    │   ├── listSubaccounts.test.js
    │   └── createUser.test.js
    └── router.test.js
```

## Esquema de KV

Dos usos, en el mismo namespace (`RESELLER_KV`).

### 1. Vínculo reseller ↔ subcuenta

**Decisión:** una key por par `(resellerEmail, locationId)`, con el email
como prefijo — así `KV.list({prefix})` hace de índice, sin mantener un array
aparte (evita condiciones de carrera en escrituras concurrentes).

```
Key:      reseller:{emailNormalizado}:{locationId}
Value:    JSON { locationId, name, city, createdAt }
Metadata: { name, city }   ← permite listar sin N+1 GETs
```

`emailNormalizado` = `email.trim().toLowerCase()`.

**Ejemplo real:**
```
Key:   reseller:juan.perez@agencia.com:loc_8x7K2mQpR3nT9vLc4Zdw
Value: {"locationId":"loc_8x7K2mQpR3nT9vLc4Zdw","name":"Clínica Dental Sonrisas","city":"Guadalajara","createdAt":"2026-08-19T15:32:07.123Z"}
Meta:  {"name":"Clínica Dental Sonrisas","city":"Guadalajara"}

Key:   reseller:juan.perez@agencia.com:loc_3Bq9WmXeYh6Jf2Ls8Ndp
Value: {"locationId":"loc_3Bq9WmXeYh6Jf2Ls8Ndp","name":"Taller Mecánico El Rayo","city":"Monterrey","createdAt":"2026-08-12T09:11:44.902Z"}
Meta:  {"name":"Taller Mecánico El Rayo","city":"Monterrey"}
```

- **Listar subcuentas de un reseller:** `KV.list({ prefix: "reseller:{email}:" })`,
  usa la metadata de cada key — 1 sola llamada a KV.
- **Verificar ownership antes de crear usuario:** `KV.get("reseller:{email}:{locationId}")`
  directo, O(1).

### 2. Whitelist de resellers autorizados

```
Key:   whitelist:{emailNormalizado}
Value: "true"
```

Se llena manualmente por ahora (`wrangler kv key put`), sin panel de admin.
Se consulta antes de dejar pasar de pantalla 1 (entrada de correo) a
pantalla 2 (selección). Si la key no existe o el valor no es `"true"`, no
está autorizado.

**Ejemplo:**
```
Key:   whitelist:juan.perez@agencia.com
Value: true
```

## Contratos de los 4 endpoints

Todos bajo `/api/`, JSON en request y response. Errores con forma:
`{ "error": { "code": "...", "message": "..." } }`.

### `GET /api/whitelist?email=...`

Chequeo de la pantalla 1 antes de avanzar a la pantalla 2.

- **200:** `{ "email": "juan.perez@agencia.com", "authorized": true }` (o `false`)
- **400:** `email` faltante o con formato inválido.

No llama a GHL — solo lee KV.

### `POST /api/subaccounts` — Crear Subcuenta

**Request:**
```json
{
  "resellerEmail": "juan.perez@agencia.com",
  "client": {
    "firstName": "María",
    "lastName": "López",
    "phone": "+52 33 1234 5678",
    "email": "maria.lopez@clinica.com"
  },
  "business": {
    "name": "Clínica Dental Sonrisas",
    "address": "Av. Vallarta 1234",
    "city": "Guadalajara",
    "state": "Jalisco",
    "country": "MX",
    "postalCode": "44100",
    "website": "https://clinicasonrisas.mx"
  },
  "installSnapshot": true
}
```
Un solo campo de dirección (`business.address`) — mapea directo a `address`
en GHL. `timezone` no viaja en el request: el handler lo deriva de
`business.country` vía `TIMEZONE_BY_COUNTRY` en `src/config.js`.

**Validación de campos obligatorios:** `resellerEmail`, todo `client.*`,
`business.name/address/city/state/country/postalCode`, `installSnapshot`
(boolean). `business.website` es opcional.

**201:**
```json
{ "locationId": "loc_8x7K2mQpR3nT9vLc4Zdw", "name": "Clínica Dental Sonrisas", "city": "Guadalajara" }
```

**Errores:** `400 VALIDATION_ERROR` (incluye país sin timezone configurado en
`TIMEZONE_BY_COUNTRY`), `502 GHL_ERROR` (passthrough del mensaje de GHL).

**Efecto secundario:** guarda el registro en KV (ver esquema arriba).

### `GET /api/subaccounts?resellerEmail=...` — Listar subcuentas

**200:**
```json
{
  "resellerEmail": "juan.perez@agencia.com",
  "subaccounts": [
    { "locationId": "loc_8x7K2mQpR3nT9vLc4Zdw", "name": "Clínica Dental Sonrisas", "city": "Guadalajara" }
  ]
}
```
Lista vacía si no hay subcuentas — no es error. **400** si falta/formato
inválido `resellerEmail`. No llama a GHL.

### `POST /api/users` — Crear Usuario

**Request:**
```json
{
  "resellerEmail": "juan.perez@agencia.com",
  "locationId": "loc_8x7K2mQpR3nT9vLc4Zdw",
  "firstName": "Carlos",
  "lastName": "Ramírez",
  "email": "carlos.ramirez@clinica.com",
  "phone": "+52 33 9876 5432",
  "password": "Str0ng!Passw0rd2026"
}
```

**Antes de llamar a GHL:** `GET reseller:{resellerEmail}:{locationId}` en KV;
si no existe → `403 FORBIDDEN` (la subcuenta no está ligada a ese reseller).

**Validación:** todos los campos requeridos + `password` debe cumplir
`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$` (mín. 12
caracteres, 1 minúscula, 1 mayúscula, 1 número, 1 carácter especial) — se
valida tanto client-side (modal) como server-side; si pasa la validación
propia pero GHL igual la rechaza, se hace passthrough del error de GHL.

**201:**
```json
{ "userId": "usr_9Qa1ZmNc7VxT2LpKw", "locationId": "loc_8x7K2mQpR3nT9vLc4Zdw" }
```

**Errores:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `502 GHL_ERROR`.

**`role`** fijo `"admin"` (sin selector), **`type`** fijo `"account"`,
**`permissions`** el set fijo de `docs/permissions.md` (pendiente de
confirmar contra la respuesta real de GHL, ver ese doc).

## Integración GHL — detalles resueltos

- Base URL: `https://services.leadconnectorhq.com`
- Header `Version: v3` en las 3 llamadas (no `2021-07-28` — esa es una
  versión anterior en mantenimiento; `v3` es la vigente para esta
  integración, confirmado contra `docs/Versioning/` de GHL).
- Header `Authorization: Bearer {GHL_TOKEN}`.
- Secrets: `GHL_TOKEN`, `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID` — nunca
  hardcodeados, via `wrangler secret put`.

## Decisiones/asunciones registradas (no bloquean el plan)

- `settings` y `social` no se envían en `POST /locations/` (opcionales, sin
  campo de form que los alimente).
- Campos de `business` requeridos en nuestra validación: `name`, `address`,
  `city`, `state`, `country`, `postalCode`. `website` opcional.
- `timezone` fijo por país en `src/config.js` (`TIMEZONE_BY_COUNTRY`) — solo
  cubre los países ya confirmados (`PE`→`America/Lima`, `US`→`America/Chicago`,
  `MX`→`America/Mexico_City`); agregar más países ahí a medida que se
  necesiten.
- El objeto `permissions` (38 flags, `docs/permissions.md`) se manda
  completo en la primera prueba real; se ajusta a los 4 flags documentados
  si GHL los rechaza/ignora — ver `docs/ghl-create-user.md`.
