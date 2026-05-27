import type { UserRepository } from "../../domain/user/user-repository";

export async function resolveUserIsBrazilian(
  userRepository: UserRepository,
  userId: string,
): Promise<boolean> {
  const profile = await userRepository.getProfile(userId);
  if (!profile) return false;

  return profile.countryCode === "BR" || profile.addressCountry === "BR";
}

export async function resolveUserCurrency(
  userRepository: UserRepository,
  userId: string,
): Promise<"BRL" | "USD"> {
  const isBrazilian = await resolveUserIsBrazilian(userRepository, userId);
  return isBrazilian ? "BRL" : "USD";
}
