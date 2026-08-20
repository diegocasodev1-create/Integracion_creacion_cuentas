import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { routeRequest } from "../src/router.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("routeRequest", () => {
  it("enruta GET /api/whitelist al handler correcto", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    const response = await routeRequest(
      new Request("https://example.com/api/whitelist?email=juan.perez@agencia.com"),
      env
    );
    expect(response.status).toBe(200);
  });

  it("responde 404 con forma de error para una ruta no registrada", async () => {
    const response = await routeRequest(new Request("https://example.com/api/no-existe"), env);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("responde 500 con forma de error si un handler lanza una excepción no controlada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const response = await routeRequest(
      new Request("https://example.com/api/subaccounts", {
        method: "POST",
        body: JSON.stringify({
          resellerEmail: "juan.perez@agencia.com",
          client: { firstName: "A", lastName: "B", phone: "1", email: "a@b.com" },
          business: { name: "N", address: "A", city: "C", state: "S", country: "PE", postalCode: "1" },
          installSnapshot: false,
        }),
      }),
      env
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  });
});
