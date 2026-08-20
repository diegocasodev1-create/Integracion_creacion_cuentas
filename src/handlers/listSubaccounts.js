import { errorResponse, jsonResponse } from "../http.js";
import { isValidEmail } from "../validation.js";
import { normalizeEmail } from "../config.js";
import { listResellerSubaccounts } from "../kv/resellerLinks.js";
import { isResellerWhitelisted } from "../kv/whitelist.js";

export async function handleListSubaccounts(request, env) {
  const url = new URL(request.url);
  const resellerEmail = url.searchParams.get("resellerEmail");

  if (!isValidEmail(resellerEmail)) {
    return errorResponse(400, "VALIDATION_ERROR", "resellerEmail inválido o faltante");
  }

  const authorized = await isResellerWhitelisted(env.RESELLER_KV, resellerEmail);
  if (!authorized) {
    return errorResponse(403, "FORBIDDEN", "Este correo no está autorizado");
  }

  const subaccounts = await listResellerSubaccounts(env.RESELLER_KV, resellerEmail);
  return jsonResponse({ resellerEmail: normalizeEmail(resellerEmail), subaccounts });
}
