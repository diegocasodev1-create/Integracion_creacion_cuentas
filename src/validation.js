const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mín. 12 caracteres, 1 minúscula, 1 mayúscula, 1 número, 1 carácter especial.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export function isValidEmail(value) {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

export function isValidPassword(value) {
  return typeof value === "string" && PASSWORD_REGEX.test(value);
}

export function validateCreateSubaccountPayload(body) {
  const errors = [];
  if (!isValidEmail(body?.resellerEmail)) errors.push("resellerEmail inválido o faltante");

  const client = body?.client ?? {};
  if (!client.firstName) errors.push("client.firstName es requerido");
  if (!client.lastName) errors.push("client.lastName es requerido");
  if (!client.phone) errors.push("client.phone es requerido");
  if (!isValidEmail(client.email)) errors.push("client.email inválido o faltante");

  const business = body?.business ?? {};
  if (!business.name) errors.push("business.name es requerido");
  if (!business.address) errors.push("business.address es requerido");
  if (!business.city) errors.push("business.city es requerido");
  if (!business.state) errors.push("business.state es requerido");
  if (!business.country) errors.push("business.country es requerido");
  if (!business.postalCode) errors.push("business.postalCode es requerido");

  if (typeof body?.installSnapshot !== "boolean") errors.push("installSnapshot debe ser boolean");

  return errors;
}

export function validateCreateUserPayload(body) {
  const errors = [];
  if (!isValidEmail(body?.resellerEmail)) errors.push("resellerEmail inválido o faltante");
  if (!body?.locationId) errors.push("locationId es requerido");
  if (!body?.firstName) errors.push("firstName es requerido");
  if (!body?.lastName) errors.push("lastName es requerido");
  if (!isValidEmail(body?.email)) errors.push("email inválido o faltante");
  if (!body?.phone) errors.push("phone es requerido");
  if (!isValidPassword(body?.password)) {
    errors.push(
      "password debe tener mínimo 12 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial"
    );
  }
  return errors;
}
