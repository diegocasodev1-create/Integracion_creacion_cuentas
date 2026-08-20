// public/app.js
import { createAppState, advanceToSelect, goToScreen } from "./state.js";
import { buildCreateSubaccountPayload } from "./forms.js";

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
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  const data = await response.json();
  return data.authorized === true;
}

document.getElementById("email-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email-input").value;
  const errorEl = document.getElementById("email-error");
  errorEl.hidden = true;

  let authorized;
  try {
    authorized = await checkWhitelist(email);
  } catch (error) {
    // Network error, non-2xx response, or JSON parse error
    errorEl.textContent = "No se pudo verificar el correo. Intentá de nuevo.";
    errorEl.hidden = false;
    return;
  }

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

document.getElementById("create-subaccount-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = buildCreateSubaccountPayload(formData, state.resellerEmail);

  const errorEl = document.getElementById("create-subaccount-error");
  const successEl = document.getElementById("create-subaccount-success");
  errorEl.hidden = true;
  successEl.hidden = true;

  try {
    const response = await fetch("/api/subaccounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      errorEl.textContent = data.error.message;
      errorEl.hidden = false;
      return;
    }

    successEl.textContent = `Subcuenta "${data.name}" creada en ${data.city}.`;
    successEl.hidden = false;
    form.reset();
  } catch (error) {
    // Network error or JSON parse error
    errorEl.textContent = "No se pudo crear la subcuenta. Intentá de nuevo.";
    errorEl.hidden = false;
  }
});

render();
