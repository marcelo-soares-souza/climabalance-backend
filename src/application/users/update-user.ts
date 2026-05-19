import type { UserRepository } from "../../domain/user/user-repository";
import type { PasswordHasher } from "../../infrastructure/crypto/password";
import { UserNotFoundError } from "../../domain/errors";

export type UpdateUserInput = {
  id: string;
  email?: string;
  password?: string;
  status?: "active" | "pending" | "suspended";
  locale?: string;
};

export async function updateUser(
  input: UpdateUserInput,
  deps: {
    users: UserRepository;
    passwordHasher: PasswordHasher;
  },
) {
  const update: {
    id: string;
    email?: string;
    passwordHash?: string;
    status?: "active" | "pending" | "suspended";
    locale?: string;
  } = { id: input.id };

  if (input.email) update.email = input.email;
  if (input.password) {
    update.passwordHash = await deps.passwordHasher.hash(input.password);
  }
  if (input.status) update.status = input.status;
  if (input.locale) update.locale = input.locale;

  const user = await deps.users.update(update);
  if (!user) {
    throw new UserNotFoundError(input.id);
  }
  return user;
}
