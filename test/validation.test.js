import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidPassword,
  validateCreateSubaccountPayload,
  validateCreateUserPayload,
} from "../src/validation.js";

describe("isValidEmail", () => {
  it("acepta un email con formato válido", () => {
    expect(isValidEmail("juan.perez@agencia.com")).toBe(true);
  });

  it("rechaza strings sin @", () => {
    expect(isValidEmail("juan.perez-agencia.com")).toBe(false);
  });

  it("rechaza undefined", () => {
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("acepta una password que cumple los 4 requisitos y 12+ caracteres", () => {
    expect(isValidPassword("Str0ng!Passw0rd")).toBe(true);
  });

  it("rechaza una password de menos de 12 caracteres", () => {
    expect(isValidPassword("Sh0rt!Aa")).toBe(false);
  });

  it("rechaza una password sin carácter especial", () => {
    expect(isValidPassword("LongPassword123")).toBe(false);
  });

  it("rechaza una password sin mayúscula", () => {
    expect(isValidPassword("longpassword123!")).toBe(false);
  });

  it("rechaza una password sin número", () => {
    expect(isValidPassword("LongPassword!!!")).toBe(false);
  });
});

describe("validateCreateSubaccountPayload", () => {
  const validPayload = {
    resellerEmail: "juan.perez@agencia.com",
    client: { firstName: "María", lastName: "López", phone: "+52 33 1234 5678", email: "maria@clinica.com" },
    business: {
      name: "Clínica Dental Sonrisas",
      address: "Av. Vallarta 1234",
      city: "Guadalajara",
      state: "Jalisco",
      country: "MX",
      postalCode: "44100",
      website: "https://clinicasonrisas.mx",
    },
    installSnapshot: true,
  };

  it("no devuelve errores para un payload completo y válido", () => {
    expect(validateCreateSubaccountPayload(validPayload)).toEqual([]);
  });

  it("reporta resellerEmail inválido", () => {
    const errors = validateCreateSubaccountPayload({ ...validPayload, resellerEmail: "no-es-email" });
    expect(errors.some((e) => e.includes("resellerEmail"))).toBe(true);
  });

  it("reporta business.name faltante", () => {
    const errors = validateCreateSubaccountPayload({
      ...validPayload,
      business: { ...validPayload.business, name: "" },
    });
    expect(errors.some((e) => e.includes("business.name"))).toBe(true);
  });

  it("reporta installSnapshot no-boolean", () => {
    const errors = validateCreateSubaccountPayload({ ...validPayload, installSnapshot: "si" });
    expect(errors.some((e) => e.includes("installSnapshot"))).toBe(true);
  });

  it("no exige business.website", () => {
    const { website, ...businessSinWebsite } = validPayload.business;
    const errors = validateCreateSubaccountPayload({ ...validPayload, business: businessSinWebsite });
    expect(errors).toEqual([]);
  });
});

describe("validateCreateUserPayload", () => {
  const validPayload = {
    resellerEmail: "juan.perez@agencia.com",
    locationId: "loc_abc123",
    firstName: "Carlos",
    lastName: "Ramírez",
    email: "carlos@clinica.com",
    phone: "+52 33 9876 5432",
    password: "Str0ng!Passw0rd",
  };

  it("no devuelve errores para un payload completo y válido", () => {
    expect(validateCreateUserPayload(validPayload)).toEqual([]);
  });

  it("reporta locationId faltante", () => {
    const errors = validateCreateUserPayload({ ...validPayload, locationId: "" });
    expect(errors.some((e) => e.includes("locationId"))).toBe(true);
  });

  it("reporta password que no cumple la política", () => {
    const errors = validateCreateUserPayload({ ...validPayload, password: "corta" });
    expect(errors.some((e) => e.includes("password"))).toBe(true);
  });
});
