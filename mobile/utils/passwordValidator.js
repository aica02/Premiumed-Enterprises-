
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 20,
  specialChars: '!@#$%^&*(),.?":{}|<>'
};

export const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    errors.push('Password is required');
    return {
      isValid: false,
      errors: errors,
      strength: 'WEAK'
    };
  }
  
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }
  if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
    errors.push(`Password must be less than ${PASSWORD_REQUIREMENTS.maxLength} characters`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    strength: getPasswordStrength(password)
  };
};

export const getPasswordStrength = (password) => {
  if (!password) return 'WEAK';
  
  let score = 0;
  if (password.length >= PASSWORD_REQUIREMENTS.minLength) score++;
  if (password.length <= PASSWORD_REQUIREMENTS.maxLength) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password)) score++;
  
  if (score <= 2) return 'WEAK';
  if (score <= 4) return 'MEDIUM';
  if (score <= 5) return 'STRONG';
  return 'VERY_STRONG';
};

export const getPasswordStrengthColor = (strength) => {
  switch(strength) {
    case 'WEAK': return '#EF4444'; // Red
    case 'MEDIUM': return '#F59E0B'; // Yellow
    case 'STRONG': return '#3B82F6'; // Blue
    case 'VERY_STRONG': return '#10B981'; // Green
    default: return '#EF4444';
  }
};

export const getPasswordStrengthLabel = (strength) => {
  switch(strength) {
    case 'WEAK': return 'Weak';
    case 'MEDIUM': return 'Medium';
    case 'STRONG': return 'Strong';
    case 'VERY_STRONG': return 'Very Strong';
    default: return 'Weak';
  }
};

export const isPasswordValid = (password) => {
  return validatePassword(password).isValid;
};

export const getPasswordRequirements = (password) => {
  return [
    { 
      label: `At least ${PASSWORD_REQUIREMENTS.minLength} characters`, 
      valid: password.length >= PASSWORD_REQUIREMENTS.minLength 
    },
    { 
      label: `Less than ${PASSWORD_REQUIREMENTS.maxLength} characters`, 
      valid: password.length <= PASSWORD_REQUIREMENTS.maxLength 
    },
    { 
      label: "Contains uppercase letter", 
      valid: /[A-Z]/.test(password) 
    },
    { 
      label: "Contains lowercase letter", 
      valid: /[a-z]/.test(password) 
    },
    { 
      label: "Contains a number", 
      valid: /[0-9]/.test(password) 
    },
    { 
      label: "Contains a special character", 
      valid: new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password) 
    }
  ];
};