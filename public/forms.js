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
