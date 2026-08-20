import { describe, it, expect } from "vitest";
import { buildCreateSubaccountPayload, buildCreateUserPayload } from "../../public/forms.js";

describe("buildCreateSubaccountPayload", () => {
  it("arma el payload con la forma que espera POST /api/subaccounts", () => {
    const formData = {
      clientFirstName: "María",
      clientLastName: "López",
      clientPhone: "+52 33 1234 5678",
      clientEmail: "maria@clinica.com",
      businessName: "Clínica Dental Sonrisas",
      businessAddress: "Av. Vallarta 1234",
      businessCity: "Guadalajara",
      businessState: "Jalisco",
      businessCountry: "MX",
      businessPostalCode: "44100",
      businessWebsite: "https://clinicasonrisas.mx",
      installSnapshot: "with",
    };

    const payload = buildCreateSubaccountPayload(formData, "juan.perez@agencia.com");

    expect(payload).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      client: {
        firstName: "María",
        lastName: "López",
        phone: "+52 33 1234 5678",
        email: "maria@clinica.com",
      },
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
    });
  });

  it("installSnapshot es false cuando el radio es \"without\"", () => {
    const payload = buildCreateSubaccountPayload({ installSnapshot: "without" }, "a@b.com");
    expect(payload.installSnapshot).toBe(false);
  });
});

describe("buildCreateUserPayload", () => {
  it("arma el payload con la forma que espera POST /api/users", () => {
    const formData = {
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      phone: "+52 33 9876 5432",
      password: "Str0ng!Passw0rd",
    };

    const payload = buildCreateUserPayload(formData, {
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_abc123",
    });

    expect(payload).toEqual({
      resellerEmail: "juan.perez@agencia.com",
      locationId: "loc_abc123",
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos@clinica.com",
      phone: "+52 33 9876 5432",
      password: "Str0ng!Passw0rd",
    });
  });
});
