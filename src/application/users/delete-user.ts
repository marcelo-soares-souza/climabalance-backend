import type { UserRepository } from '../../domain/user/user-repository';

export async function deleteUser(id: string, deps: { users: UserRepository }) {
  const user = await deps.users.softDelete(id);
  if (!user) {
    throw new Error('user_not_found');
  }
  return user;
}
