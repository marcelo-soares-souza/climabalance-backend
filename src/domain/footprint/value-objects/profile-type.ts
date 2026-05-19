/**
 * Profile type for footprint calculations
 */
export type ProfileType = "individual" | "legal_entity";

export const PROFILE_TYPES: ProfileType[] = ["individual", "legal_entity"];

export function isValidProfileType(value: string): value is ProfileType {
  return PROFILE_TYPES.includes(value as ProfileType);
}

export function validateProfileType(value: string): ProfileType {
  if (!isValidProfileType(value)) {
    throw new Error(
      `Invalid profile type: ${value}. Must be one of: ${PROFILE_TYPES.join(", ")}`,
    );
  }
  return value;
}
