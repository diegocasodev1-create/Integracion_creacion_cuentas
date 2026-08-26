# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Implemented. The Worker is scaffolded and functional:

- **Backend** (`src/`): `router.js` dispatches to 4 handlers in `src/handlers/`
  (`verifyReseller`, `createSubaccount`, `listSubaccounts`, `createUser`);
  `src/kv/` holds the whitelist and reseller-link KV modules; `src/ghl/`
  holds the GHL API client (`client.js`) plus `locations.js`/`users.js`;
  `src/config.js`, `src/validation.js`, and `src/http.js` hold shared
  config, validation, and response helpers.
- **Frontend** (`public/`): a 4-screen vanilla-JS iframe app
  (`index.html`, `app.js`, `forms.js`, `state.js`, `styles.css`).
- **Docs**: `docs/design/integracion-cuentas-design.md`, `docs/ghl-*.md`,
  `docs/permissions.md`.
- **Deploy**: live in production at
  `https://integracion-cuentas.diegocaso.workers.dev` — confirmed with a
  direct curl (`GET /` → 200, `GET /api/no-existe` → 404 with the
  expected `{"error":{"code":"NOT_FOUND",...}}` shape). The 3 secrets
  (`GHL_TOKEN`, `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID`) and the
  `RESELLER_KV` binding are confirmed against the real Cloudflare
  account. See `progress.md` for the latest verified operational state
  and open items carried between sessions.
- **Resolved as of 2026-08-26** (see `progress.md` for full detail):
  - `FIXED_PERMISSIONS` (38 flags) was validated against a real
    `POST /users/` call. GHL accepts all 38, doesn't reject or trim them
    — but it force-overrides `workflowsEnabled` to `false` regardless of
    the value sent, and auto-adds ~10 more flags of its own (not in our
    set, all default `true`). No need to reduce the set to the 4
    documented in v3.
  - The `502 Forbidden resource` on `POST /locations/` and
    `POST /users/` was **not** the rotated `GHL_SNAPSHOT_ID` — a control
    call without snapshot failed identically. Root cause was a stale
    `GHL_COMPANY_ID` secret (the token's real company didn't match it);
    fixed by updating the secret to the correct company id and
    redeploying. Both `GHL_SNAPSHOT_ID` (`JhOOoC5tfvWcz6EInWMm`) and the
    corrected `GHL_COMPANY_ID` are now confirmed working end-to-end
    (whitelist → create subaccount with snapshot → list → create user).
  - Real test subaccounts/users created during this verification are
    pending cleanup in the GHL dashboard — see `progress.md`.

Commands:

```bash
npm test                                  # full test suite (vitest)
npx vitest run <path/to/file.test.js>     # single test file
npm run dev                               # wrangler dev (local)
npm run deploy                            # wrangler deploy
```

## What this project is

"Integracion Cuentas" is a standalone Cloudflare Worker, embedded in the GHL (GoHighLevel) CRM as a Custom Menu Link (iframe), that lets resellers self-serve two actions without involving the technical team:

1. **Crear Subcuenta** — create a new GHL sub-account (location) for a client.
2. **Crear Usuario** — add a user to one of the reseller's existing sub-accounts.

Full user flow and field lists are in `brief-integracion-cuentas.md` — the UX/mockup is already validated, do not redesign it.

## Key architecture decisions (from the brief)

- **New, independent Worker** — does not reuse or share code with the existing Ascend worker, even though a similar reseller↔location link exists there (`location:{locationId} → theme` in KV). That prior implementation is not accessible; the KV schema here must be designed fresh, optimizing for simplicity of maintenance/querying (e.g. list of `locationIds` per email vs. one record per sub-account with an inverse index by email — pick one deliberately when implementing).
- **GHL API integration** — two endpoints, with schemas already confirmed against `docs.gohighlevel.com`:
  - `POST /locations/` (create sub-account): `name, phone, companyId, address, city, state, country, postalCode, website, timezone, prospectInfo{firstName,lastName,email}, settings{...}, social{...}, snapshotId`. Do **not** include the optional `twilio` or `mailgun` blocks. **`settings` and `social` are documented-optional fields the API accepts, but this integration deliberately does not send either** — no form field feeds them and the brief doesn't define desired values; GHL applies its own defaults. This is a recorded decision, not an omission: see `docs/design/integracion-cuentas-design.md:240-241` and `docs/ghl-create-location.md:35`, enforced by `test/ghl/locations.test.js:40-41` (`sentBody.settings`/`sentBody.social` asserted `undefined`).
  - `POST /users/` (create user): `companyId, firstName, lastName, email, password, phone, type: "account", role, locationIds[], permissions{...}`. Use the legacy `permissions` flags object, **not** the newer `scopes`/`scopesAssignedToOnly` model. Do not include `profilePhoto`, `platformLanguage`, or `twilioPhone`.
  - Full GHL API reference docs should be placed under `docs/` in this repo (per the brief's checklist) so implementation can match the schema exactly — check there before/instead of relying on training data for these two endpoints.
- **Snapshot** — a single fixed `snapshotId` (agency config, not user-selectable); the "create sub-account" form only offers a with/without-snapshot radio choice.
- **Secrets** — `GHL_TOKEN` (agency-level token), `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID` are Worker secrets, never hardcoded.
- **Storage** — Cloudflare KV for the reseller-email ↔ locationId link. No other persistence layer.
- **Out of scope for now** — per-role customization of the `permissions` object; a single fixed base set is used for every new user until role logic is defined later.
- **Screen 1 email source — free-text input (rolled back from query-param auto-fill)** — screen 1 has a free-text `#email-input`; the reseller types their email, `public/app.js`'s `email-form` submit handler calls `GET /api/whitelist?email=...`, and `public/state.js`'s `resolveEmailSubmit(state, email, authorized)` decides the transition: advances to the `select` screen on success, or returns an inline error ("Este correo no está autorizado...") on failure — the page is never blocked, the reseller can correct and retry. `resolveEmailSubmit` is covered by `test/frontend/state.test.js`.
  **History — do not re-introduce query-param auto-fill without re-reading this:** commit `9c9b649` (2026-08-20) replaced the free-text input with automatic pre-fill from a GHL Custom Menu Link query param (`?email=...`), read via `new URL(window.location.href).searchParams.get("email")`, with the whole screen blocked if the param was missing. **That mechanism was tested against the real embedded Custom Menu Link in GHL on 2026-08-26 and failed** — the page showed the block message instead of the menu, i.e. the query param never reached the iframe in the real environment. Root cause was not investigated (candidates: the Custom Menu Link's Target URL config in GHL, or a parsing bug in `app.js`) — the team chose to revert to manual input rather than keep debugging the automatic mechanism. The auto-fill code was fully removed, not just disabled; the server-side authorization boundary was never part of this mechanism and is unaffected either way — it's the whitelist check in `src/handlers/createSubaccount.js`, `listSubaccounts.js`, and `createUser.js` (added in a prior fix wave). Do not treat client-supplied email (typed or query-param) as proof of identity when touching backend code.

## Stack

Cloudflare Worker (independent deployment) + Cloudflare KV. No framework mandated unless there's an explicit preference when implementation starts.
