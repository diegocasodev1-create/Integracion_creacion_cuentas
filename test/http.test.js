import { describe, it, expect } from "vitest";
import { jsonResponse, errorResponse } from "../src/http.js";

describe("jsonResponse", () => {
  it("serializa el body y setea Content-Type", async () => {
    const response = jsonResponse({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("usa status 200 por default", () => {
    expect(jsonResponse({}).status).toBe(200);
  });
});

describe("errorResponse", () => {
  it("arma la forma { error: { code, message } } con el status dado", async () => {
    const response = errorResponse(400, "VALIDATION_ERROR", "campo faltante");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "campo faltante" },
    });
  });
});
