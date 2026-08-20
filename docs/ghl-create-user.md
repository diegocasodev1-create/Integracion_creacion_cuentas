# GHL — `POST /users/` (crear usuario)

Referencia: https://marketplace.gohighlevel.com/docs/ghl/users/create-user/

## Request

- **Método:** `POST`
- **URL:** `https://services.leadconnectorhq.com/users/`
- **Headers:**
  - `Authorization: Bearer {GHL_TOKEN}`
  - `Version: v3`
  - `Content-Type: application/json`

### Body — campos que usa esta integración

| Campo | Tipo | Origen | Obligatorio |
|---|---|---|---|
| `companyId` | string | secret `GHL_COMPANY_ID` | sí |
| `firstName` | string | modal "Crear Usuario" | sí |
| `lastName` | string | modal | sí |
| `email` | string | modal | sí |
| `password` | string | modal — mín. 12 caracteres, 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial (exigido por GHL, validado también client-side) | sí |
| `phone` | string | modal | no |
| `type` | string | fijo: `"account"` | sí |
| `role` | string | fijo: `"admin"` (sin selector, ver brief/decisión) | sí |
| `locationIds` | array | `[locationId]` de la tarjeta seleccionada | sí |
| `permissions` | object | set base fijo, ver `docs/permissions.md` | no |

**Usar el objeto `permissions` (flags legacy)**, no `scopes`/`scopesAssignedToOnly`.
No incluir `profilePhoto`, `platformLanguage` ni `twilioPhone`.

### Sobre `permissions`

`docs/permissions.md` trae 37 flags de una fuente que puede no corresponder a la
versión `v3` actual (la doc pública `v3` solo documenta 4 flags de ejemplo:
`campaignsEnabled`, `campaignsReadOnly`, `contactsEnabled`, `workflowsEnabled`).
Decisión: mandar el objeto completo de 37 flags en la primera llamada real de
prueba contra la cuenta y revisar la respuesta —

- si GHL los acepta/guarda → se deja el set completo.
- si GHL los ignora o rechaza → se reduce a los 4 documentados.

No bloquea el plan de implementación; se resuelve en la tarea de verificación
manual end-to-end (ver plan).

## Response 201

```json
{
  "id": "usr_9Qa1ZmNc7VxT2LpKw",
  "name": "Carlos Ramírez",
  "firstName": "Carlos",
  "lastName": "Ramírez",
  "email": "carlos.ramirez@clinica.com",
  "phone": "+52 33 9876 5432",
  "extension": null,
  "permissions": { "...": "..." },
  "scopes": ["..."],
  "roles": { "type": "account", "role": "admin", "locationIds": ["loc_8x7K2mQpR3nT9vLc4Zdw"] },
  "lcPhone": {},
  "platformLanguage": "en_US"
}
```

`id` es el `userId` que devuelve nuestra API (no se persiste en KV — el vínculo
que importa ya existe vía `reseller:{email}:{locationId}`).

## Errores

No documentados de forma exhaustiva en la doc pública (ej. password débil,
email duplicado). El cliente (`src/ghl/client.js`) hace passthrough del
`message` que devuelva GHL cuando `response.ok` es `false`.
