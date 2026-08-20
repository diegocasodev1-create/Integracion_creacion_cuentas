export function buildCreateSubaccountPayload(formData, resellerEmail) {
  return {
    resellerEmail,
    client: {
      firstName: formData.clientFirstName,
      lastName: formData.clientLastName,
      phone: formData.clientPhone,
      email: formData.clientEmail,
    },
    business: {
      name: formData.businessName,
      address: formData.businessAddress,
      city: formData.businessCity,
      state: formData.businessState,
      country: formData.businessCountry,
      postalCode: formData.businessPostalCode,
      website: formData.businessWebsite,
    },
    installSnapshot: formData.installSnapshot === "with",
  };
}

export function buildCreateUserPayload(formData, { resellerEmail, locationId }) {
  return {
    resellerEmail,
    locationId,
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,
    password: formData.password,
  };
}
