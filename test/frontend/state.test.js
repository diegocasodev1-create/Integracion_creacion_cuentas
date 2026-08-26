// test/frontend/state.test.js
import { describe, it, expect } from "vitest";
import { createAppState, advanceToSelect, goToScreen, resolveEmailSubmit } from "../../public/state.js";

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

describe("resolveEmailSubmit", () => {
  it("avanza a la pantalla select y normaliza el email cuando el reseller está autorizado", () => {
    const { state, error } = resolveEmailSubmit(createAppState(), "  Juan.Perez@Agencia.com  ", true);

    expect(state.screen).toBe("select");
    expect(state.resellerEmail).toBe("juan.perez@agencia.com");
    expect(error).toBeNull();
  });

  it("no avanza de pantalla y devuelve un error cuando el reseller no está autorizado", () => {
    const initial = createAppState();

    const { state, error } = resolveEmailSubmit(initial, "desconocido@agencia.com", false);

    expect(state).toBe(initial);
    expect(state.screen).toBe("email");
    expect(error).toBe("Este correo no está autorizado. Contactá al equipo técnico.");
  });
});
