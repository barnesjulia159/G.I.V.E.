export const MIN_PASSWORD_LENGTH = 6;

export function registrationInputError(email: string, password: string, role: string) {
  if (!email || !password) return "Email and password are required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return `Password must contain at least ${MIN_PASSWORD_LENGTH} non-padding characters.`;
  }
  if (role !== "volunteer" && role !== "nonprofit") return "Invalid account type.";
  return null;
}
