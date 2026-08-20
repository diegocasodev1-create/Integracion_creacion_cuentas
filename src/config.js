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
