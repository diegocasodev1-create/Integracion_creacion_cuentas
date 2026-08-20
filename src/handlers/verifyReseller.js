import { errorResponse, jsonResponse } from "../http.js";
import { isValidEmail } from "../validation.js";
import { normalizeEmail } from "../config.js";
import { isResellerWhitelisted } from "../kv/whitelist.js";

export async function handleVerifyReseller(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!isValidEmail(email)) {
    return errorResponse(400, "VALIDATION_ERROR", "email inválido o faltante");
  }

  const authorized = await isResellerWhitelisted(env.RESELLER_KV, email);
  return jsonResponse({ email: normalizeEmail(email), authorized });
}
