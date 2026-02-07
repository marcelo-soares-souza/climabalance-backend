import { UserNotFoundError } from '../../domain/errors';
export async function getUser(id, deps) {
    const user = await deps.users.findById(id);
    if (!user || user.deletedAt) {
        throw new UserNotFoundError(id);
    }
    return user;
}
