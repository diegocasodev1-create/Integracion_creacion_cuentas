# GHL — Objeto `permissions` (Create User)

Set completo de flags que acepta el campo `permissions` en `POST /users/`.

```json
{
  "campaignsEnabled": true,
  "campaignsReadOnly": false,
  "contactsEnabled": true,
  "workflowsEnabled": true,
  "workflowsReadOnly": true,
  "triggersEnabled": true,
  "funnelsEnabled": true,
  "websitesEnabled": false,
  "opportunitiesEnabled": true,
  "dashboardStatsEnabled": true,
  "bulkRequestsEnabled": true,
  "appointmentsEnabled": true,
  "reviewsEnabled": true,
  "onlineListingsEnabled": true,
  "phoneCallEnabled": true,
  "conversationsEnabled": true,
  "assignedDataOnly": false,
  "adwordsReportingEnabled": false,
  "membershipEnabled": false,
  "facebookAdsReportingEnabled": false,
  "attributionsReportingEnabled": false,
  "settingsEnabled": true,
  "tagsEnabled": true,
  "leadValueEnabled": true,
  "marketingEnabled": true,
  "agentReportingEnabled": true,
  "botService": false,
  "socialPlanner": true,
  "bloggingEnabled": true,
  "invoiceEnabled": true,
  "affiliateManagerEnabled": true,
  "contentAiEnabled": true,
  "refundsEnabled": true,
  "recordPaymentEnabled": true,
  "cancelSubscriptionEnabled": true,
  "paymentsEnabled": true,
  "communitiesEnabled": true,
  "exportPaymentsEnabled": true
}
```

Este es el set base fijo a usar para todo usuario creado desde el modal
"Crear Usuario" (rol fijo `admin`, ver brief).
