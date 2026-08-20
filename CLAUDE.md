# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation. The repository currently contains only `brief-integracion-cuentas.md` (the spec, in Spanish) — no source code, no `package.json`/`wrangler.toml`, no `docs/` yet. There are no build/lint/test commands to run because nothing has been scaffolded. Once the project is initialized (Cloudflare Worker via Wrangler), update this file with real commands (`wrangler dev`, `wrangler deploy`, test runner, single-test invocation) and the actual module layout.

## What this project is

"Integracion Cuentas" is a standalone Cloudflare Worker, embedded in the GHL (GoHighLevel) CRM as a Custom Menu Link (iframe), that lets resellers self-serve two actions without involving the technical team:

1. **Crear Subcuenta** — create a new GHL sub-account (location) for a client.
2. **Crear Usuario** — add a user to one of the reseller's existing sub-accounts.

Full user flow and field lists are in `brief-integracion-cuentas.md` — the UX/mockup is already validated, do not redesign it.

## Key architecture decisions (from the brief)

- **New, independent Worker** — does not reuse or share code with the existing Ascend worker, even though a similar reseller↔location link exists there (`location:{locationId} → theme` in KV). That prior implementation is not accessible; the KV schema here must be designed fresh, optimizing for simplicity of maintenance/querying (e.g. list of `locationIds` per email vs. one record per sub-account with an inverse index by email — pick one deliberately when implementing).
- **GHL API integration** — two endpoints, with schemas already confirmed against `docs.gohighlevel.com`:
  - `POST /locations/` (create sub-account): `name, phone, companyId, address, city, state, country, postalCode, website, timezone, prospectInfo{firstName,lastName,email}, settings{...}, social{...}, snapshotId`. Do **not** include the optional `twilio` or `mailgun` blocks.
  - `POST /users/` (create user): `companyId, firstName, lastName, email, password, phone, type: "account", role, locationIds[], permissions{...}`. Use the legacy `permissions` flags object, **not** the newer `scopes`/`scopesAssignedToOnly` model. Do not include `profilePhoto`, `platformLanguage`, or `twilioPhone`.
  - Full GHL API reference docs should be placed under `docs/` in this repo (per the brief's checklist) so implementation can match the schema exactly — check there before/instead of relying on training data for these two endpoints.
- **Snapshot** — a single fixed `snapshotId` (agency config, not user-selectable); the "create sub-account" form only offers a with/without-snapshot radio choice.
- **Secrets** — `GHL_TOKEN` (agency-level token), `GHL_COMPANY_ID`, `GHL_SNAPSHOT_ID` are Worker secrets, never hardcoded.
- **Storage** — Cloudflare KV for the reseller-email ↔ locationId link. No other persistence layer.
- **Out of scope for now** — per-role customization of the `permissions` object; a single fixed base set is used for every new user until role logic is defined later.

## Stack

Cloudflare Worker (independent deployment) + Cloudflare KV. No framework mandated unless there's an explicit preference when implementation starts.
