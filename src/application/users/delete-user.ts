import type { UserRepository } from '../../domain/user/user-repository';
import { UserNotFoundError } from '../../domain/errors';

export async function deleteUser(id: string, deps: { users: UserRepository }) {
  const user = await deps.users.softDelete(id);
  if (!user) {
    throw new UserNotFoundError(id);
  }
  return user;
}
