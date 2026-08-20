import { errorResponse, jsonResponse } from "../http.js";
import { validateCreateUserPayload } from "../validation.js";
import { getResellerLink } from "../kv/resellerLinks.js";
import { createUser } from "../ghl/users.js";
import { GhlApiError } from "../ghl/client.js";
import { isResellerWhitelisted } from "../kv/whitelist.js";

export async function handleCreateUser(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "El body no es JSON válido");
  }

  const errors = validateCreateUserPayload(body);
  if (errors.length > 0) {
    return errorResponse(400, "VALIDATION_ERROR", errors.join("; "));
  }

  const authorized = await isResellerWhitelisted(env.RESELLER_KV, body.resellerEmail);
  if (!authorized) {
    return errorResponse(403, "FORBIDDEN", "Este correo no está autorizado");
  }

  const link = await getResellerLink(env.RESELLER_KV, body.resellerEmail, body.locationId);
  if (!link) {
    return errorResponse(403, "FORBIDDEN", "Esa subcuenta no está ligada a este reseller");
  }

  let user;
  try {
    user = await createUser(env, {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      password: body.password,
      phone: body.phone,
      locationId: body.locationId,
    });
  } catch (err) {
    if (err instanceof GhlApiError) {
      return errorResponse(502, "GHL_ERROR", err.message);
    }
    throw err;
  }

  if (!user?.id) {
    return errorResponse(502, "GHL_ERROR", "GHL no devolvió un id de usuario válido");
  }

  return jsonResponse({ userId: user.id, locationId: body.locationId }, { status: 201 });
}
