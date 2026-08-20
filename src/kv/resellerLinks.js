import { normalizeEmail } from "../config.js";

function buildPrefix(resellerEmail) {
  return `reseller:${normalizeEmail(resellerEmail)}:`;
}

function buildKey(resellerEmail, locationId) {
  return buildPrefix(resellerEmail) + locationId;
}

export async function saveResellerLink(kv, { resellerEmail, locationId, name, city }) {
  const key = buildKey(resellerEmail, locationId);
  const value = JSON.stringify({ locationId, name, city, createdAt: new Date().toISOString() });
  await kv.put(key, value, { metadata: { name, city } });
}

export async function getResellerLink(kv, resellerEmail, locationId) {
  const key = buildKey(resellerEmail, locationId);
  return kv.get(key, "json");
}

export async function listResellerSubaccounts(kv, resellerEmail) {
  const prefix = buildPrefix(resellerEmail);
  const { keys } = await kv.list({ prefix });
  return keys.map((entry) => ({
    locationId: entry.name.slice(prefix.length),
    name: entry.metadata?.name ?? "",
    city: entry.metadata?.city ?? "",
  }));
}
