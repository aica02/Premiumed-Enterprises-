export const COUNTRY_CODES = [
  { code: "+63", country: "Philippines", flag: "🇵🇭" },
  { code: "+1", country: "United States / Canada", flag: "🇺🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+82", country: "South Korea", flag: "🇰🇷" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+60", country: "Malaysia", flag: "🇲🇾" },
  { code: "+66", country: "Thailand", flag: "🇹🇭" },
  { code: "+84", country: "Vietnam", flag: "🇻🇳" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+971", country: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+39", country: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+7", country: "Russia / Kazakhstan", flag: "🇷🇺" },
];

export const FIELD_MAX_LENGTHS = {
  dialysisCenterName: 100,
  yearEstablished: 4,
  registrationNumber: 17,
  tinNumber: 17,
  machines: 3,
  address: 250,
  mobile: 12,
  landline: 12,
  email: 150,
  ownerName: 100,
  medicalDirector: 100,
  nephrologist: 100,
  unitManager: 100,
  purchasingContact: 100,
  designation: 100,
  procurementMobile: 12,
  procurementEmail: 150,
};

export const formatFieldValue = (name, value) => {
  value = String(value ?? "");

  switch (name) {
    case "machines":
      return value.replace(/\D/g, "");

    case "landline": {
      value = value.replace(/\D/g, "").slice(0, 10);

      if (value.length > 2) {
        value = value.slice(0, 2) + "-" + value.slice(2);
      }

      if (value.length > 7) {
        value = value.slice(0, 7) + "-" + value.slice(7);
      }

      return value;
    }

    case "mobile":
    case "procurementMobile": {
      value = value.replace(/\D/g, "").slice(0, 10);

      if (value.length > 3) {
        value = value.slice(0, 3) + " " + value.slice(3);
      }

      if (value.length > 7) {
        value = value.slice(0, 7) + " " + value.slice(7);
      }

      return value;
    }

    case "email":
    case "procurementEmail":
      return value.toLowerCase().replace(/\s/g, "");

    case "registrationNumber":
    case "tinNumber": {
      const digits = value.replace(/\D/g, "").slice(0, 14);
      return digits
        .replace(/(\d{3})(?=\d)/, "$1-")
        .replace(/(\d{3}-\d{3})(?=\d)/, "$1-")
        .replace(/(\d{3}-\d{3}-\d{3})(?=\d)/, "$1-");
    }

    case "dialysisCenterName":
    case "address":
    case "ownerName":
    case "medicalDirector":
    case "nephrologist":
    case "unitManager":
    case "purchasingContact":
    case "designation":
      return value.replace(/\s{2,}/g, " ");

    default:
      return value;
  }
};

export const formatFieldInput = (name, value) => {
  const formattedValue = formatFieldValue(name, value);
  const maxLength = FIELD_MAX_LENGTHS[name];
  return maxLength ? formattedValue.slice(0, maxLength) : formattedValue;
};

export const formatInternationalPhone = (countryCode, phone) =>
  `${countryCode}${phone.replace(/\s/g, "")}`;
