import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleVerifyReseller } from "../../src/handlers/verifyReseller.js";

describe("handleVerifyReseller", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("devuelve authorized:true si el email está en la whitelist", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    const request = new Request("https://example.com/api/whitelist?email=juan.perez@agencia.com");

    const response = await handleVerifyReseller(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "juan.perez@agencia.com", authorized: true });
  });

  it("devuelve authorized:false si el email no está en la whitelist", async () => {
    const request = new Request("https://example.com/api/whitelist?email=nadie@agencia.com");
    const response = await handleVerifyReseller(request, env);
    expect(await response.json()).toEqual({ email: "nadie@agencia.com", authorized: false });
  });

  it("responde 400 si falta el query param email", async () => {
    const request = new Request("https://example.com/api/whitelist");
    const response = await handleVerifyReseller(request, env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
