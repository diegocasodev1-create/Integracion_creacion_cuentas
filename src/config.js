export const TIMEZONE_BY_COUNTRY = {
  PE: "America/Lima",
  US: "America/Chicago",
  MX: "America/Mexico_City",
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
// Validado contra la cuenta real (2026-08-26, ver progress.md): GHL acepta
// los 38 flags tal cual, sin rechazar la request ni recortar ninguno. Dos
// matices confirmados en la respuesta real:
// - GHL sobrescribe workflowsEnabled a `false` sin importar el valor
//   enviado (se mandó `true`, volvió `false`); el resto de los 38 flags
//   vuelven con el mismo valor enviado.
// - GHL agrega ~10 flags adicionales por su cuenta que no están en este
//   set (opportunitiesBulkActionsEnabled, certificatesEnabled,
//   mediaStorageEnabled, reportingEnabled, adPublishingEnabled,
//   adPublishingReadOnly, wordpressEnabled, customMenuLinkReadOnly,
//   customMenuLinkWrite, gokollabEnabled), todos en `true` por default.
// No hace falta reducir el set a los 4 documentados en v3 — GHL no rechaza
// ni ignora los otros 34.
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
