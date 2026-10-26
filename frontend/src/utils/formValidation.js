const FIELD_LABELS = {
  dialysisCenterName: "Dialysis Center Name",
  facilityType: "Type of Facility",
  yearEstablished: "Year Established",
  registrationNumber: "TIN Number",
  tinNumber: "TIN Number",
  machines: "Number of Machines",
  address: "Registered Address",
  location: "Location",
  mobile: "Mobile Number",
  phone: "Phone Number",
  phoneNumber: "Phone Number",
  landline: "Landline Number",
  email: "Email Address",
  procurementEmail: "Procurement Email Address",
  ownership: "Ownership",
  ownerName: "Owner's Name",
  ownerFirstName: "First Name",
  ownerLastName: "Last Name",
  medicalDirectorFirstName: "First Name",
  medicalDirectorLastName: "Last Name",
  nephrologistFirstName: "First Name",
  nephrologistLastName: "Last Name",
  unitManagerFirstName: "First Name",
  unitManagerLastName: "Last Name",
  fullName: "Full Name",
  contact: "Full Name",
  contactFirstName: "First Name",
  contactLastName: "Last Name",
  firstName: "First Name",
  lastName: "Last Name",
  medicalDirector: "Medical Director's Name",
  nephrologist: "Nephrologist Name",
  unitManager: "Unit Manager / Administrator",
  purchasingContact: "Purchasing Contact Person",
  designation: "Designation",
  procurementMobile: "Procurement Mobile Number",
  role: "Role",
  name: "Supplier Name",
};

const FIELD_ALIASES = {
  name: "dialysisCenterName",
  tinNumber: "registrationNumber",
  location: "address",
  fullName: "ownerName",
  firstName: "ownerName",
  lastName: "ownerName",
  ownerFirstName: "ownerName",
  ownerLastName: "ownerName",
  medicalDirectorFirstName: "medicalDirector",
  medicalDirectorLastName: "medicalDirector",
  nephrologistFirstName: "nephrologist",
  nephrologistLastName: "nephrologist",
  unitManagerFirstName: "unitManager",
  unitManagerLastName: "unitManager",
  purchasingFirstName: "purchasingContact",
  purchasingLastName: "purchasingContact",
  contactFirstName: "ownerName",
  contactLastName: "ownerName",
  contact: "ownerName",
  phoneNumber: "mobile",
  phone: "mobile",
};

export const combineFullName = (firstName = "", lastName = "") =>
  [firstName, lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ");

export const splitFullName = (fullName = "") => {
  const [firstName = "", ...lastNameParts] = String(fullName)
    .trim()
    .split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
};

export const validateField = (name, value, options = {}) => {
  const trimmedValue = String(value ?? "").trim();
  const label = options.label || FIELD_LABELS[name] || name;
  const required = options.required !== false;

  if (!trimmedValue) {
    return required ? `${label} is required.` : "";
  }

  switch (FIELD_ALIASES[name] || name) {
    case "dialysisCenterName":
      if (trimmedValue.length > 100) {
        return `${label} cannot exceed 100 characters.`;
      }
      if (!/^[a-zA-Z0-9\s&.,'-]+$/.test(trimmedValue)) {
        return "Invalid input. Letters, numbers, spaces, (.), (') (,) and (-) only.";
      }
      return "";

    case "yearEstablished": {
      if (!/^\d{4}$/.test(trimmedValue)) {
        return "Year Established must contain exactly 4 digits.";
      }
      const year = Number(trimmedValue);
      const currentYear = new Date().getFullYear();
      if (year < 1900 || year > currentYear) {
        return `Year Established must be between 1900 and ${currentYear}.`;
      }
      return "";
    }

    case "registrationNumber":
      return /^\d{3}-\d{3}-\d{3}-\d{5}$/.test(trimmedValue)
        ? ""
        : "Enter a valid TIN number (xxx-xxx-xxx-xxxxx).";

    case "machines": {
      if (!/^\d+$/.test(trimmedValue)) {
        return "Number of Machines must contain numbers only.";
      }
      const machineCount = Number(trimmedValue);
      if (machineCount < 1) {
        return "Number of Machines must be at least 1.";
      }
      if (machineCount > 500) {
        return "Number of Machines cannot exceed 500.";
      }
      return "";
    }

    case "address":
      return trimmedValue.length > 250
        ? `${label} cannot exceed 250 characters.`
        : "";

    case "mobile":
    case "procurementMobile":
      return /^\d{3} \d{3} \d{4}$/.test(trimmedValue)
        ? ""
        : "Enter a valid mobile number.";

    case "landline":
      return /^\d{2}-\d{4}-\d{4}$/.test(trimmedValue)
        ? ""
        : "Enter a valid landline number (XX-XXXX-XXXX).";

    case "email":
    case "procurementEmail":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)
        ? ""
        : "Enter a valid email address.";

    case "ownerName":
    case "medicalDirector":
    case "nephrologist":
    case "unitManager":
    case "purchasingContact":
      if (trimmedValue.length > 100) {
        return `${label} cannot exceed 100 characters.`;
      }
      return /^[a-zA-Z\s.,'-]+$/.test(trimmedValue)
        ? ""
        : "Invalid input. Letters, spaces, (.), (') (,) and (-) only.";

    case "designation":
      return trimmedValue.length > 100
        ? `${label} cannot exceed 100 characters.`
        : "";

    default:
      return "";
  }
};

export const validateFields = (values, fields, fieldOptions = {}) =>
  fields.reduce((errors, field) => {
    errors[field] = validateField(field, values[field], fieldOptions[field]);
    return errors;
  }, {});
