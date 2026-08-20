// public/app.js
import { createAppState, advanceToSelect, goToScreen } from "./state.js";
import { buildCreateSubaccountPayload, buildCreateUserPayload } from "./forms.js";

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

// GHL injects the logged-in reseller's email into the iframe URL as
// `?email=...` (Custom Menu Link). Screen 1 has no free-text fallback: this
// is a UX/flow mitigation against casually typing an arbitrary email, NOT
// cryptographic authentication — the real defense against a direct API
// caller is the server-side whitelist check in the handlers (see
// src/handlers/createSubaccount.js, listSubaccounts.js, createUser.js).
// If the param is absent (URL opened directly, not via the GHL menu), the
// form is hidden entirely and a blocking message is shown instead — there
// is intentionally no way to type an email in that case.
function initEmailScreen() {
  const emailParam = new URL(window.location.href).searchParams.get("email");
  const form = document.getElementById("email-form");
  const blockedEl = document.getElementById("email-blocked");

  if (emailParam) {
    const input = document.getElementById("email-input");
    input.value = emailParam;
    input.readOnly = true;
  } else {
    form.hidden = true;
    blockedEl.hidden = false;
  }
}
initEmailScreen();

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

const modal = document.getElementById("create-user-modal");

async function loadSubaccounts() {
  const list = document.getElementById("subaccounts-list");
  try {
    const response = await fetch(`/api/subaccounts?resellerEmail=${encodeURIComponent(state.resellerEmail)}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    list.innerHTML = "";

    for (const sub of data.subaccounts) {
      const card = document.createElement("button");
      card.textContent = `${sub.name} — ${sub.city}`;
      card.addEventListener("click", () => {
        document.querySelector('#create-user-form [name="locationId"]').value = sub.locationId;
        document.getElementById("create-user-error").hidden = true;
        modal.showModal();
      });
      list.appendChild(card);
    }

    if (data.subaccounts.length === 0) {
      list.innerHTML =
        '<p>Todavía no tenés subcuentas, o la que acabás de crear puede tardar hasta un minuto en aparecer. <button id="refresh-subaccounts">Actualizar</button></p>';
      document.getElementById("refresh-subaccounts").addEventListener("click", () => loadSubaccounts());
    }
  } catch (error) {
    // Network error, non-2xx response, or JSON parse error
    list.innerHTML = "<p>No se pudieron cargar las subcuentas.</p>";
  }
}

document.getElementById("btn-create-user").addEventListener("click", () => {
  state = goToScreen(state, "create-user");
  render();
  loadSubaccounts();
});

document.getElementById("create-subaccount-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = buildCreateSubaccountPayload(formData, state.resellerEmail);

  const errorEl = document.getElementById("create-subaccount-error");
  const successEl = document.getElementById("create-subaccount-success");
  const submitButton = form.querySelector('button[type="submit"]');
  errorEl.hidden = true;
  successEl.hidden = true;

  submitButton.disabled = true;
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
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("close-modal").addEventListener("click", () => modal.close());

document.getElementById("create-user-form").addEventListener("submit", async (event) => {
  // CRITICAL: Call preventDefault synchronously as the first line (before any await)
  event.preventDefault();

  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = buildCreateUserPayload(formData, {
    resellerEmail: state.resellerEmail,
    locationId: formData.locationId,
  });

  const errorEl = document.getElementById("create-user-error");
  const successEl = document.getElementById("create-user-success");
  const submitButton = form.querySelector('button[type="submit"]');
  errorEl.hidden = true;
  successEl.hidden = true;

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/users", {
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

    form.reset();
    // Only close modal on success
    modal.close();
    successEl.textContent = "Usuario creado correctamente.";
    successEl.hidden = false;
  } catch (error) {
    // Network error or JSON parse error
    errorEl.textContent = "No se pudo crear el usuario. Intentá de nuevo.";
    errorEl.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

render();
