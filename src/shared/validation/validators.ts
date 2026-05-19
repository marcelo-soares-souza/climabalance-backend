export type ValidationError = {
  field: string;
  message: string;
};

export function requireString(
  input: unknown,
  field: string,
  maxLength = 255,
): ValidationError | string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { field, message: "required" };
  }
  if (input.length > maxLength) {
    return { field, message: "too_long" };
  }
  return input.trim();
}

export function requireEmail(
  input: unknown,
  field = "email",
): ValidationError | string {
  const value = requireString(input, field, 320);
  if (typeof value !== "string") return value;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!ok) return { field, message: "invalid_email" };
  return value.toLowerCase();
}

export function optionalString(
  input: unknown,
  field: string,
  maxLength = 255,
): ValidationError | string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  return requireString(input, field, maxLength);
}
