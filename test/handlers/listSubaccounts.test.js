import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleListSubaccounts } from "../../src/handlers/listSubaccounts.js";
import { saveResellerLink } from "../../src/kv/resellerLinks.js";

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("handleListSubaccounts", () => {
  it("devuelve las subcuentas ligadas al resellerEmail dado", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_1",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });

    const request = new Request("https://example.com/api/subaccounts?resellerEmail=juan.perez@agencia.com");
    const response = await handleListSubaccounts(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      subaccounts: [{ locationId: "loc_1", name: "Clínica Dental Sonrisas", city: "Guadalajara" }],
    });
  });

  it("devuelve lista vacía (no error) si el reseller no tiene subcuentas", async () => {
    const request = new Request("https://example.com/api/subaccounts?resellerEmail=nadie@agencia.com");
    const response = await handleListSubaccounts(request, env);
    expect(response.status).toBe(200);
    expect((await response.json()).subaccounts).toEqual([]);
  });

  it("responde 400 si falta resellerEmail", async () => {
    const request = new Request("https://example.com/api/subaccounts");
    const response = await handleListSubaccounts(request, env);
    expect(response.status).toBe(400);
  });
});
