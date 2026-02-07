import { UserNotFoundError } from '../../domain/errors';
export async function updateUser(input, deps) {
    const update = { id: input.id };
    if (input.email)
        update.email = input.email;
    if (input.password) {
        update.passwordHash = await deps.passwordHasher.hash(input.password);
    }
    if (input.status)
        update.status = input.status;
    if (input.locale)
        update.locale = input.locale;
    const user = await deps.users.update(update);
    if (!user) {
        throw new UserNotFoundError(input.id);
    }
    return user;
}
