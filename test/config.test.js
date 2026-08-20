import { describe, it, expect } from "vitest";
import { getTimezoneForCountry, normalizeEmail, FIXED_PERMISSIONS } from "../src/config.js";

describe("getTimezoneForCountry", () => {
  it("devuelve America/Lima para PE", () => {
    expect(getTimezoneForCountry("PE")).toBe("America/Lima");
  });

  it("devuelve America/Chicago para US", () => {
    expect(getTimezoneForCountry("US")).toBe("America/Chicago");
  });

  it("lanza error mencionando el código de país cuando no hay mapeo", () => {
    expect(() => getTimezoneForCountry("ZZ")).toThrow(/ZZ/);
  });
});

describe("normalizeEmail", () => {
  it("recorta espacios y pasa a minúsculas", () => {
    expect(normalizeEmail("  Juan.Perez@Agencia.com  ")).toBe("juan.perez@agencia.com");
  });
});

describe("FIXED_PERMISSIONS", () => {
  it("incluye los flags documentados en la API v3 actual", () => {
    expect(FIXED_PERMISSIONS.campaignsEnabled).toBe(true);
    expect(FIXED_PERMISSIONS.campaignsReadOnly).toBe(false);
    expect(FIXED_PERMISSIONS.contactsEnabled).toBe(true);
    expect(FIXED_PERMISSIONS.workflowsEnabled).toBe(true);
  });

  it("tiene 38 flags en total", () => {
    expect(Object.keys(FIXED_PERMISSIONS)).toHaveLength(38);
  });
});
