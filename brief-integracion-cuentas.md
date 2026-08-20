# Brief — Proyecto "Integracion Cuentas"

## Objetivo
Integración para GHL (GoHighLevel) que permite a resellers crear subcuentas nuevas
para sus clientes y agregar usuarios a subcuentas existentes, sin depender del
equipo técnico. Se despliega como Cloudflare Worker independiente y se embebe en
el CRM como Custom Menu Link (iframe).

## Flujo de usuario (ya validado con mockup, no rediscutir el diseño)

1. **Entrada**: el reseller ingresa el correo con el que está registrado.
2. **Selección**: dos opciones — "Crear Subcuenta" y "Crear Usuario".
3. **Crear Subcuenta**: formulario con:
   - Datos del cliente: nombre, apellido, celular, email (obligatorios)
   - Datos del negocio: nombre de la subcuenta, dirección, dirección postal,
     ciudad, región/provincia/estado, país, código postal, sitio web,
     ¿instalar snapshot? — radio de 2 opciones (con snapshot / sin snapshot).
     El snapshot es uno solo, fijo (un único `snapshotId` predefinido), no hay
     selector entre varios.
   - Al enviar: crea la subcuenta en GHL y guarda el vínculo
     `resellerEmail → locationId`.
4. **Crear Usuario**: lista las subcuentas ya ligadas a ese correo reseller
   (tarjetas con nombre y ciudad). Al presionar el botón de una tarjeta se abre
   un modal con nombre, correo, teléfono y contraseña, que crea el usuario y
   lo asigna a esa subcuenta puntual.

## Vínculo reseller ↔ subcuentas

Se guarda en Cloudflare KV. No hay acceso al código donde ya se implementó algo
similar en otro proyecto (Ascend, `location:{locationId} → theme`) — reconstruir
el mecanismo desde cero, diseñando el esquema de claves que resulte más simple
de mantener y de consultar (por ejemplo: lista de locationIds por email, o un
registro por subcuenta con índice inverso por email).

## Integración con GHL

- `POST /locations/` para crear subcuenta — schema ya confirmado por Diego
  contra la documentación oficial (docs.gohighlevel.com). Campos a usar: name,
  phone, companyId, address, city, state, country, postalCode, website,
  timezone, prospectInfo{firstName,lastName,email}, settings{...},
  social{...}, snapshotId. **No incluir** los bloques opcionales `twilio` ni
  `mailgun` — no forman parte de este flujo.
- `POST /users/` para crear usuario — schema también confirmado. Campos:
  companyId, firstName, lastName, email, password, phone, type ("account"),
  role, locationIds[], permissions{...}. **Usar el objeto `permissions`
  (flags legacy)**, no el modelo nuevo de `scopes`/`scopesAssignedToOnly`.
  Tampoco incluir profilePhoto, platformLanguage ni twilioPhone — no forman
  parte de este flujo por ahora.
- Aun así, colocar la documentación completa en `docs/` dentro del proyecto
  para que Claude Code la tenga como referencia exacta al implementar.
- **Header `Version: v3`** (confirmado contra la doc oficial actual — NO usar
  `2021-07-28`, es una versión anterior en modo mantenimiento).
- **Password de crear usuario**: GHL exige mínimo 12 caracteres, 1 mayúscula,
  1 minúscula, 1 número y 1 carácter especial. El campo del modal debe validar
  esto (client-side y también manejar el error si GHL lo rechaza).
- **Posible discrepancia en `permissions`**: el objeto de 37 flags en
  `docs/permissions.md` puede ser de una versión anterior de la API — la doc
  v3 actual solo documenta 4 flags en su ejemplo. Enviarlo completo en la
  primera prueba real contra la cuenta y verificar en la respuesta de GHL si
  los flags extra se aceptan o se ignoran silenciosamente.
- El token de GHL es a nivel de agencia. Va como secret
  (`GHL_TOKEN`, `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID`), nunca hardcodeado.

## Stack

- Cloudflare Worker independiente (nuevo — no reutiliza el worker de Ascend)
- **JavaScript vanilla** (no TypeScript, sin framework) — mismo patrón que el
  resto del ecosistema de proyectos ya en producción
- Cloudflare KV para el vínculo reseller ↔ subcuentas
- **Todo el proyecto vive en un único Worker**: backend (los 3 endpoints) y
  frontend (las 4 pantallas en HTML) se sirven desde el mismo proyecto/archivo,
  sin separar en un deploy de Cloudflare Pages aparte. La interfaz no es lo
  suficientemente compleja como para justificar dos despliegues distintos.

## Fuera de alcance por ahora

- Personalizar el objeto `permissions` por tipo de usuario/rol — se usa un
  set base fijo (el mismo para todo usuario nuevo) hasta que se defina una
  lógica de roles más adelante.

## Antes de que Claude Code empiece

- [ ] Colocar la documentación de la API de GHL dentro de `docs/` en el proyecto
      (referencia: https://marketplace.gohighlevel.com/docs/ghl/locations/create-location/
      y https://marketplace.gohighlevel.com/docs/ghl/users/create-user/)
- [ ] Confirmar el plan de la cuenta agencia habilita creación de subcuentas
      (Agency Pro)
- [ ] Definir el `snapshotId` fijo a usar y guardarlo como variable de config