# GHL — `POST /locations/` (crear subcuenta)

Referencia: https://marketplace.gohighlevel.com/docs/ghl/locations/create-location/
Confirmado contra la doc oficial por Diego (ver brief) y verificado en esta
integración contra `https://marketplace.gohighlevel.com/docs/Versioning/`.

## Request

- **Método:** `POST`
- **URL:** `https://services.leadconnectorhq.com/locations/`
- **Headers:**
  - `Authorization: Bearer {GHL_TOKEN}` (token de agencia)
  - `Version: v3`
  - `Content-Type: application/json`

### Body — campos que usa esta integración

| Campo | Tipo | Origen | Obligatorio |
|---|---|---|---|
| `name` | string | `business.name` (form) | sí |
| `companyId` | string | secret `GHL_COMPANY_ID` | sí |
| `phone` | string | `client.phone` (form) | no |
| `address` | string | `business.address` (form) | no |
| `city` | string | `business.city` (form) | no |
| `state` | string | `business.state` (form) | no |
| `country` | string | `business.country` (form) | no |
| `postalCode` | string | `business.postalCode` (form) | no |
| `website` | string | `business.website` (form) | no |
| `timezone` | string | derivado de `business.country` vía mapa fijo en `src/config.js` — no es campo del form | no |
| `prospectInfo.firstName` | string | `client.firstName` | no |
| `prospectInfo.lastName` | string | `client.lastName` | no |
| `prospectInfo.email` | string | `client.email` | no |
| `snapshotId` | string | secret `GHL_SNAPSHOT_ID`, solo si `installSnapshot: true` | no |

**No se envían** `settings` ni `social`: son opcionales, el brief no define valores deseados para ellos y no hay campos de form que los alimenten — se omiten para no imponer un comportamiento no solicitado; GHL aplica sus defaults.

**No incluir** los bloques `twilio` ni `mailgun` — fuera de alcance del flujo (brief).

## Response 200

```json
{
  "id": "loc_8x7K2mQpR3nT9vLc4Zdw",
  "companyId": "comp_xxx",
  "name": "Clínica Dental Sonrisas",
  "phone": "+52 33 1234 5678",
  "email": null,
  "address": "Av. Vallarta 1234",
  "city": "Guadalajara",
  "state": "Jalisco",
  "domain": null,
  "country": "MX",
  "postalCode": "44100",
  "website": "https://clinicasonrisas.mx",
  "timezone": "America/Lima",
  "settings": { "...": "..." },
  "social": { "...": "..." }
}
```

`id` es el `locationId` que se guarda en KV (ver `docs/design/integracion-cuentas-design.md`).

## Requisito de cuenta

Requiere plan de agencia **Agency Pro** — confirmar antes de probar en real (checklist del brief).

## Errores

No documentados de forma exhaustiva en la doc pública. El cliente (`src/ghl/client.js`)
hace passthrough del `message` que devuelva GHL cuando `response.ok` es `false`.
