// public/state.js

export function createAppState() {
  return { screen: "email", resellerEmail: null };
}

export function advanceToSelect(state, email) {
  return { ...state, resellerEmail: String(email).trim().toLowerCase(), screen: "select" };
}

export function goToScreen(state, screen) {
  return { ...state, screen };
}

export function resolveEmailSubmit(state, email, authorized) {
  if (!authorized) {
    return { state, error: "Este correo no está autorizado. Contactá al equipo técnico." };
  }
  return { state: advanceToSelect(state, email), error: null };
}
