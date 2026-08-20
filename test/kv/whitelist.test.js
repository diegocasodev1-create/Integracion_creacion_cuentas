import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { isResellerWhitelisted } from "../../src/kv/whitelist.js";

describe("isResellerWhitelisted", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("devuelve true si el email normalizado está en la whitelist", async () => {
    await env.RESELLER_KV.put("whitelist:juan.perez@agencia.com", "true");
    expect(await isResellerWhitelisted(env.RESELLER_KV, "Juan.Perez@Agencia.com")).toBe(true);
  });

  it("devuelve false si la key no existe", async () => {
    expect(await isResellerWhitelisted(env.RESELLER_KV, "nadie@agencia.com")).toBe(false);
  });

  it("devuelve false si el valor guardado no es \"true\"", async () => {
    await env.RESELLER_KV.put("whitelist:otro@agencia.com", "false");
    expect(await isResellerWhitelisted(env.RESELLER_KV, "otro@agencia.com")).toBe(false);
  });
});
