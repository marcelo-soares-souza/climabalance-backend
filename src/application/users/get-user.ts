import type { UserRepository } from '../../domain/user/user-repository';

export async function getUser(id: string, deps: { users: UserRepository }) {
  const user = await deps.users.findById(id);
  if (!user || user.deletedAt) {
    throw new Error('user_not_found');
  }
  return user;
}
