import type { UserFilters, UserRepository } from '../../domain/user/user-repository';

export async function listUsers(filters: UserFilters, deps: { users: UserRepository }) {
  return deps.users.list(filters);
}
