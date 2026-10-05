import bcrypt from "bcryptjs";

export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 30,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  specialChars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

export const validatePassword = (password) => {
  const errors = [];

  // Check if password is provided
  if (!password) {
    errors.push("Password is required");
    return { isValid: false, errors, strength: "WEAK" };
  }

  // Check minimum length
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`,
    );
  }

  // Check maximum length
  if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
    errors.push(
      `Password must be less than ${PASSWORD_REQUIREMENTS.maxLength} characters`,
    );
  }

  // Check for uppercase letter
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check for lowercase letter
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check for number
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check for special character
  if (PASSWORD_REQUIREMENTS.requireSpecialChar) {
    const specialCharRegex = new RegExp(
      `[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]`,
    );
    if (!specialCharRegex.test(password)) {
      errors.push(
        `Password must contain at least one special character (${PASSWORD_REQUIREMENTS.specialChars})`,
      );
    }
  }

  // Check for common weak passwords
  const commonPasswords = [
    "password123",
    "password123!",
    "12345678",
    "123456789",
    "qwerty123",
    "admin123",
    "letmein123",
    "welcome123",
    "abc123456",
    "password1",
    "Password123!",
    "Passw0rd!",
    "12345678",
    "87654321",
    "11111111",
    "00000000",
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common and easily guessable");
  }

  // Check for sequences
  const sequences = ["12345678", "abcdefgh", "qwertyui", "zxcvbnm", "asdfghjk"];
  for (const seq of sequences) {
    if (password.toLowerCase().includes(seq)) {
      errors.push("Password contains a common keyboard sequence");
      break;
    }
  }

  // Check for repeated characters (more than 2 in a row)
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password contains repeated characters (e.g., "aaa")');
  }

  // Check for username-like patterns (optional)
  if (
    password.toLowerCase().includes("admin") ||
    password.toLowerCase().includes("user") ||
    password.toLowerCase().includes("password")
  ) {
    errors.push("Password contains common words (admin, user, password)");
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    strength: getPasswordStrength(password),
  };
};

export const getPasswordStrength = (password) => {
  let score = 0;

  if (!password) return "WEAK";

  // Length
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Complexity
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Determine strength
  if (score <= 2) return "WEAK";
  if (score <= 4) return "MEDIUM";
  if (score <= 6) return "STRONG";
  return "VERY_STRONG";
};

export const getPasswordStrengthColor = (strength) => {
  const colors = {
    WEAK: "#ff4444",
    MEDIUM: "#ffaa00",
    STRONG: "#44bb44",
    VERY_STRONG: "#0066cc",
  };
  return colors[strength] || "#999";
};

export const getPasswordStrengthLabel = (strength) => {
  const labels = {
    WEAK: "Weak - Add more characters and variety",
    MEDIUM: "Medium - Add special characters for better security",
    STRONG: "Strong - Good password!",
    VERY_STRONG: "Very Strong - Excellent password!",
  };
  return labels[strength] || strength;
};

export const generateStrongPassword = (length = 12) => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const specials = "!@#$%^&*()_+-=";

  const allChars = uppercase + lowercase + numbers + specials;
  let password = "";

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specials[Math.floor(Math.random() * specials.length)];

  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

export default {
  validatePassword,
  getPasswordStrength,
  getPasswordStrengthColor,
  getPasswordStrengthLabel,
  generateStrongPassword,
  PASSWORD_REQUIREMENTS,
};
