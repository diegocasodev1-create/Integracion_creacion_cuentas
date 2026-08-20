import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Worker entry point", () => {
  it("responde 404 con forma de error JSON en una ruta inexistente", async () => {
    const response = await SELF.fetch("https://example.com/api/no-existe");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
