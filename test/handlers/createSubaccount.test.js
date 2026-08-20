import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCreateSubaccount } from "../../src/handlers/createSubaccount.js";

const validBody = {
  resellerEmail: "juan.perez@agencia.com",
  client: { firstName: "María", lastName: "López", phone: "+52 33 1234 5678", email: "maria@clinica.com" },
  business: {
    name: "Clínica Dental Sonrisas",
    address: "Av. Vallarta 1234",
    city: "Guadalajara",
    state: "Jalisco",
    country: "MX",
    postalCode: "44100",
    website: "https://clinicasonrisas.mx",
  },
  installSnapshot: true,
};

function postRequest(body) {
  return new Request("https://example.com/api/subaccounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
});

describe("handleCreateSubaccount", () => {
  it("crea la subcuenta en GHL, guarda el vínculo en KV y devuelve 201 usando los valores que devuelve GHL (no los del request)", async () => {
    // El name/city que responde GHL es deliberadamente distinto al del
    // request — si el handler usara body.business.* en vez de la respuesta
    // de GHL, este test lo detecta.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "loc_abc123", name: "Clínica Dental Sonrisas S.A.", city: "Zapopan" }),
          { status: 200 }
        )
      )
    );

    const response = await handleCreateSubaccount(postRequest(validBody), env);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      locationId: "loc_abc123",
      name: "Clínica Dental Sonrisas S.A.",
      city: "Zapopan",
    });

    const link = await env.RESELLER_KV.get("reseller:juan.perez@agencia.com:loc_abc123", "json");
    expect(link.name).toBe("Clínica Dental Sonrisas S.A.");
    expect(link.city).toBe("Zapopan");
  });

  it("responde 400 sin llamar a GHL si el body no es JSON válido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://example.com/api/subaccounts", {
      method: "POST",
      body: "esto no es json{{{",
    });
    const response = await handleCreateSubaccount(request, env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 sin llamar a GHL si el payload es inválido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateSubaccount(postRequest({ ...validBody, resellerEmail: "no-es-email" }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 sin llamar a GHL si el país no tiene timezone configurado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateSubaccount(
      postRequest({ ...validBody, business: { ...validBody.business, country: "ZZ" } }),
      env
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 502 con el mensaje de GHL si GHL rechaza la creación", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "companyId inválido" }), { status: 400 }))
    );

    const response = await handleCreateSubaccount(postRequest(validBody), env);

    expect(response.status).toBe(502);
    expect((await response.json()).error).toEqual({ code: "GHL_ERROR", message: "companyId inválido" });
  });
});
