const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "v3";

export class GhlApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    this.body = body;
  }
}

export async function ghlFetch(env, path, { method = "GET", body } = {}) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: GHL_API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new GhlApiError(data?.message ?? `GHL respondió ${response.status}`, {
      status: response.status,
      body: data,
    });
  }

  return data;
}
