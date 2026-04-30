import type { UserRepository } from '../../domain/user/user-repository';
import { UserNotFoundError } from '../../domain/errors';

export async function deleteUser(id: string, deps: { users: UserRepository }) {
  const user = await deps.users.findById(id);
  if (!user || user.deletedAt) {
    throw new UserNotFoundError(id);
  }

  await deps.users.cascadeSoftDelete(id);

  await deps.users.softDelete(id);
}
