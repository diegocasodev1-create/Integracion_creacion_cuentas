import { errorResponse, jsonResponse } from "../http.js";
import { validateCreateSubaccountPayload } from "../validation.js";
import { getTimezoneForCountry } from "../config.js";
import { createLocation } from "../ghl/locations.js";
import { GhlApiError } from "../ghl/client.js";
import { saveResellerLink } from "../kv/resellerLinks.js";

export async function handleCreateSubaccount(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "El body no es JSON válido");
  }

  const errors = validateCreateSubaccountPayload(body);
  if (errors.length > 0) {
    return errorResponse(400, "VALIDATION_ERROR", errors.join("; "));
  }

  let timezone;
  try {
    timezone = getTimezoneForCountry(body.business.country);
  } catch (err) {
    return errorResponse(400, "VALIDATION_ERROR", err.message);
  }

  let location;
  try {
    location = await createLocation(env, {
      name: body.business.name,
      phone: body.client.phone,
      address: body.business.address,
      city: body.business.city,
      state: body.business.state,
      country: body.business.country,
      postalCode: body.business.postalCode,
      website: body.business.website,
      timezone,
      prospectInfo: {
        firstName: body.client.firstName,
        lastName: body.client.lastName,
        email: body.client.email,
      },
      installSnapshot: body.installSnapshot,
    });
  } catch (err) {
    if (err instanceof GhlApiError) {
      return errorResponse(502, "GHL_ERROR", err.message);
    }
    throw err;
  }

  await saveResellerLink(env.RESELLER_KV, {
    resellerEmail: body.resellerEmail,
    locationId: location.id,
    name: location.name,
    city: location.city,
  });

  return jsonResponse({ locationId: location.id, name: location.name, city: location.city }, { status: 201 });
}
