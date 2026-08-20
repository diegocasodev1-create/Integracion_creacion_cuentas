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
