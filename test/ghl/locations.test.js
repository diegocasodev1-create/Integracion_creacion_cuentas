import { describe, it, expect, vi, afterEach } from "vitest";
import { createLocation } from "../../src/ghl/locations.js";

const env = { GHL_TOKEN: "test-token", GHL_COMPANY_ID: "comp_123", GHL_SNAPSHOT_ID: "snap_456" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLocation", () => {
  it("arma el payload correcto y devuelve la respuesta de GHL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "loc_abc", name: "Clínica Dental Sonrisas", city: "Guadalajara" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createLocation(env, {
      name: "Clínica Dental Sonrisas",
      phone: "+52 33 1234 5678",
      address: "Av. Vallarta 1234",
      city: "Guadalajara",
      state: "Jalisco",
      country: "MX",
      postalCode: "44100",
      website: "https://clinicasonrisas.mx",
      timezone: "America/Lima",
      prospectInfo: { firstName: "María", lastName: "López", email: "maria@clinica.com" },
      installSnapshot: true,
    });

    expect(result).toEqual({ id: "loc_abc", name: "Clínica Dental Sonrisas", city: "Guadalajara" });

    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.companyId).toBe("comp_123");
    expect(sentBody.snapshotId).toBe("snap_456");
    expect(sentBody.name).toBe("Clínica Dental Sonrisas");
    expect(sentBody.settings).toBeUndefined();
    expect(sentBody.social).toBeUndefined();
  });

  it("no incluye snapshotId cuando installSnapshot es false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createLocation(env, {
      name: "Taller Mecánico El Rayo",
      address: "Calle Falsa 123",
      city: "Monterrey",
      state: "Nuevo León",
      country: "MX",
      postalCode: "64000",
      prospectInfo: { firstName: "Juan", lastName: "Pérez", email: "juan@taller.com" },
      installSnapshot: false,
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body).snapshotId).toBeUndefined();
  });
});
