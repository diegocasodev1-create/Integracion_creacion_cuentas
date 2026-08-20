import { ghlFetch } from "./client.js";
import { FIXED_PERMISSIONS } from "../config.js";

export async function createUser(env, { firstName, lastName, email, password, phone, locationId }) {
  const payload = {
    companyId: env.GHL_COMPANY_ID,
    firstName,
    lastName,
    email,
    password,
    phone,
    type: "account",
    role: "admin",
    locationIds: [locationId],
    permissions: FIXED_PERMISSIONS,
  };

  return ghlFetch(env, "/users/", { method: "POST", body: payload });
}
