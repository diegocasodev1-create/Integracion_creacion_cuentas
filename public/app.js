// public/app.js
import { createAppState, advanceToSelect, goToScreen } from "./state.js";

let state = createAppState();

const screens = {
  email: document.getElementById("screen-email"),
  select: document.getElementById("screen-select"),
  "create-subaccount": document.getElementById("screen-create-subaccount"),
  "create-user": document.getElementById("screen-create-user"),
};

function render() {
  for (const [name, el] of Object.entries(screens)) {
    el.hidden = state.screen !== name;
  }
}

async function checkWhitelist(email) {
  const response = await fetch(`/api/whitelist?email=${encodeURIComponent(email)}`);
  const data = await response.json();
  return data.authorized === true;
}

document.getElementById("email-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email-input").value;
  const errorEl = document.getElementById("email-error");
  errorEl.hidden = true;

  const authorized = await checkWhitelist(email);
  if (!authorized) {
    errorEl.textContent = "Este correo no está autorizado. Contactá al equipo técnico.";
    errorEl.hidden = false;
    return;
  }

  state = advanceToSelect(state, email);
  render();
});

document.getElementById("btn-create-subaccount").addEventListener("click", () => {
  state = goToScreen(state, "create-subaccount");
  render();
});

document.getElementById("btn-create-user").addEventListener("click", () => {
  state = goToScreen(state, "create-user");
  render();
});

render();
