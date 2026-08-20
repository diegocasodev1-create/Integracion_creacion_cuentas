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
