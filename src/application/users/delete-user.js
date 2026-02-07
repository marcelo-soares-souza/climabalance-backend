import { UserNotFoundError } from '../../domain/errors';
export async function deleteUser(id, deps) {
    const user = await deps.users.softDelete(id);
    if (!user) {
        throw new UserNotFoundError(id);
    }
    return user;
}
