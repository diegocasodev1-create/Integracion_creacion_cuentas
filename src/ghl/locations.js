import { ghlFetch } from "./client.js";

export async function createLocation(
  env,
  { name, phone, address, city, state, country, postalCode, website, timezone, prospectInfo, installSnapshot }
) {
  const payload = {
    name,
    phone,
    companyId: env.GHL_COMPANY_ID,
    address,
    city,
    state,
    country,
    postalCode,
    website,
    timezone,
    prospectInfo,
  };

  if (installSnapshot) {
    payload.snapshotId = env.GHL_SNAPSHOT_ID;
  }

  return ghlFetch(env, "/locations/", { method: "POST", body: payload });
}
