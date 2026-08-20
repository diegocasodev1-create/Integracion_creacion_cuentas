import { describe, it, expect, vi, afterEach } from "vitest";
import { ghlFetch, GhlApiError } from "../../src/ghl/client.js";

const env = { GHL_TOKEN: "test-token" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ghlFetch", () => {
  it("llama a la URL correcta con headers Version v3 y Authorization Bearer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await ghlFetch(env, "/locations/", { method: "POST", body: { name: "Test" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://services.leadconnectorhq.com/locations/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          Version: "v3",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Test" }),
      })
    );
  });

  it("devuelve el body parseado como JSON cuando la respuesta es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "loc_abc" }), { status: 200 }))
    );

    const result = await ghlFetch(env, "/locations/", { method: "POST", body: {} });
    expect(result).toEqual({ id: "loc_abc" });
  });

  it("lanza GhlApiError con el message de GHL cuando la respuesta no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "companyId inválido" }), { status: 400 })
      )
    );

    await expect(ghlFetch(env, "/locations/", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "GhlApiError",
      status: 400,
      message: "companyId inválido",
    });
  });

  it("GhlApiError usa un mensaje default si GHL no manda message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    await expect(ghlFetch(env, "/locations/", { method: "POST", body: {} })).rejects.toThrow(
      /GHL respondió 500/
    );
  });

  it("lanza GhlApiError (no un SyntaxError crudo) cuando GHL responde un body no-JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }))
    );

    await expect(ghlFetch(env, "/locations/", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "GhlApiError",
      status: 502,
    });
  });
});
