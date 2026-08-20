import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCreateUser } from "../../src/handlers/createUser.js";
import { saveResellerLink } from "../../src/kv/resellerLinks.js";

const validBody = {
  resellerEmail: "juan.perez@agencia.com",
  locationId: "loc_abc123",
  firstName: "Carlos",
  lastName: "Ramírez",
  email: "carlos@clinica.com",
  phone: "+52 33 9876 5432",
  password: "Str0ng!Passw0rd",
};

function postRequest(body) {
  return new Request("https://example.com/api/users", { method: "POST", body: JSON.stringify(body) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const { keys } = await env.RESELLER_KV.list();
  await Promise.all(keys.map((k) => env.RESELLER_KV.delete(k.name)));
  await saveResellerLink(env.RESELLER_KV, {
    resellerEmail: "juan.perez@agencia.com",
    locationId: "loc_abc123",
    name: "Clínica Dental Sonrisas",
    city: "Guadalajara",
  });
});

describe("handleCreateUser", () => {
  it("responde 400 sin llamar a GHL si el body no es JSON válido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://example.com/api/users", {
      method: "POST",
      body: "esto no es json{{{",
    });
    const response = await handleCreateUser(request, env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("crea el usuario en GHL y devuelve 201 cuando la subcuenta pertenece al reseller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "usr_xyz" }), { status: 201 })));

    const response = await handleCreateUser(postRequest(validBody), env);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ userId: "usr_xyz", locationId: "loc_abc123" });
  });

  it("responde 403 si el locationId no está ligado a ese resellerEmail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateUser(
      postRequest({ ...validBody, locationId: "loc_de_otro_reseller" }),
      env
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 sin llamar a GHL si la password no cumple la política", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCreateUser(postRequest({ ...validBody, password: "corta" }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 502 con el mensaje de GHL si GHL rechaza la password igual", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "password no cumple la política de GHL" }), { status: 400 }))
    );

    const response = await handleCreateUser(postRequest(validBody), env);

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toBe("password no cumple la política de GHL");
  });
});
