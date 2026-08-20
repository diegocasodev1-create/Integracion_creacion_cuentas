import { normalizeEmail } from "../config.js";

export async function isResellerWhitelisted(kv, email) {
  const key = `whitelist:${normalizeEmail(email)}`;
  const value = await kv.get(key);
  return value === "true";
}
