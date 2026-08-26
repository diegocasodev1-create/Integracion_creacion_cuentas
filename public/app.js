// public/app.js
import { createAppState, goToScreen, resolveEmailSubmit } from "./state.js";
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

// Screen 1 has a free-text email input: the reseller types the email they're
// registered with, we validate it against /api/whitelist, and either advance
// to the menu or show an inline error they can correct without losing the
// page. (A prior version tried pre-filling this from a GHL Custom Menu Link
// query param instead — reverted after it failed against the real embedded
// link; see CLAUDE.md "Screen 1 email source" for details.)
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

  const { state: nextState, error } = resolveEmailSubmit(state, email, authorized);
  if (error) {
    errorEl.textContent = error;
    errorEl.hidden = false;
    return;
  }

  state = nextState;
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
