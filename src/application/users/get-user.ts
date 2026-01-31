import type { UserRepository } from '../../domain/user/user-repository';
import { UserNotFoundError } from '../../domain/errors';

export async function getUser(id: string, deps: { users: UserRepository }) {
  const user = await deps.users.findById(id);
  if (!user || user.deletedAt) {
    throw new UserNotFoundError(id);
  }
  return user;
}
