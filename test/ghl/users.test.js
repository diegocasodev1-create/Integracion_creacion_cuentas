import { describe, it, expect, vi, afterEach } from "vitest";
import { createUser } from "../../src/ghl/users.js";
import { FIXED_PERMISSIONS } from "../../src/config.js";

const env = { GHL_TOKEN: "test-token", GHL_COMPANY_ID: "comp_123" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUser", () => {
  it("arma el payload con role admin, type account y permissions fijos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "usr_xyz" }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createUser(env, {
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      password: "Str0ng!Passw0rd",
      phone: "+52 33 9876 5432",
      locationId: "loc_abc123",
    });

    expect(result).toEqual({ id: "usr_xyz" });

    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.companyId).toBe("comp_123");
    expect(sentBody.type).toBe("account");
    expect(sentBody.role).toBe("admin");
    expect(sentBody.locationIds).toEqual(["loc_abc123"]);
    expect(sentBody.permissions).toEqual(FIXED_PERMISSIONS);
    expect(sentBody.scopes).toBeUndefined();
    expect(sentBody.profilePhoto).toBeUndefined();
  });
});
