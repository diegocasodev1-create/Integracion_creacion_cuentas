import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { saveResellerLink, getResellerLink, listResellerSubaccounts } from "../../src/kv/resellerLinks.js";

describe("resellerLinks", () => {
  beforeEach(async () => {
    const { keys } = await env.RESELLER_KV.list();
    await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  });

  it("guarda y recupera un vínculo por email + locationId", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "Juan.Perez@Agencia.com",
      locationId: "loc_abc123",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });

    const link = await getResellerLink(env.RESELLER_KV, "juan.perez@agencia.com", "loc_abc123");
    expect(link.locationId).toBe("loc_abc123");
    expect(link.name).toBe("Clínica Dental Sonrisas");
    expect(link.city).toBe("Guadalajara");
    expect(typeof link.createdAt).toBe("string");
  });

  it("getResellerLink devuelve null si no existe el vínculo", async () => {
    const link = await getResellerLink(env.RESELLER_KV, "nadie@agencia.com", "loc_xxx");
    expect(link).toBeNull();
  });

  it("lista solo las subcuentas del email dado, usando la metadata", async () => {
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_1",
      name: "Clínica Dental Sonrisas",
      city: "Guadalajara",
    });
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_2",
      name: "Taller Mecánico El Rayo",
      city: "Monterrey",
    });
    await saveResellerLink(env.RESELLER_KV, {
      resellerEmail: "otro@agencia.com",
      locationId: "loc_3",
      name: "No debería aparecer",
      city: "CDMX",
    });

    const subaccounts = await listResellerSubaccounts(env.RESELLER_KV, "juan.perez@agencia.com");

    expect(subaccounts).toHaveLength(2);
    expect(subaccounts).toEqual(
      expect.arrayContaining([
        { locationId: "loc_1", name: "Clínica Dental Sonrisas", city: "Guadalajara" },
        { locationId: "loc_2", name: "Taller Mecánico El Rayo", city: "Monterrey" },
      ])
    );
  });

  it("lista vacía si el reseller no tiene subcuentas", async () => {
    expect(await listResellerSubaccounts(env.RESELLER_KV, "nadie@agencia.com")).toEqual([]);
  });
});
