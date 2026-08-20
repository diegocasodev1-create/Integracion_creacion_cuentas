export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export function errorResponse(status, code, message) {
  return jsonResponse({ error: { code, message } }, { status });
}
