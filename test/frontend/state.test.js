// test/frontend/state.test.js
import { describe, it, expect } from "vitest";
import { createAppState, advanceToSelect, goToScreen } from "../../public/state.js";

describe("createAppState", () => {
  it("arranca en la pantalla email sin resellerEmail", () => {
    const state = createAppState();
    expect(state.screen).toBe("email");
    expect(state.resellerEmail).toBeNull();
  });
});

describe("advanceToSelect", () => {
  it("guarda el email normalizado y pasa a la pantalla select", () => {
    const state = advanceToSelect(createAppState(), "  Juan.Perez@Agencia.com  ");
    expect(state.resellerEmail).toBe("juan.perez@agencia.com");
    expect(state.screen).toBe("select");
  });
});

describe("goToScreen", () => {
  it("cambia la pantalla activa", () => {
    const state = goToScreen(advanceToSelect(createAppState(), "a@b.com"), "create-subaccount");
    expect(state.screen).toBe("create-subaccount");
  });
});
