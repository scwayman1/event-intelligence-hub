export interface PasswordCheck {
  label: string;
  met: boolean;
}

export function validatePassword(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return validatePassword(password).every((c) => c.met);
}
