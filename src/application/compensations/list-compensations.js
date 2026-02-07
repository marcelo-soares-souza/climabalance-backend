import { ForbiddenError } from '../../domain/errors';
export async function listCompensations(deps, input) {
    const isAdmin = input.actorRoles.includes('administrator');
    const isSelf = input.actorUserId === input.supporterUserId;
    if (!isAdmin && !isSelf) {
        throw new ForbiddenError('auth.forbidden');
    }
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    return deps.historyRepository.listBySupporter({
        supporterUserId: input.supporterUserId,
        status: input.status,
        limit,
        offset,
    });
}
function normalizeLimit(value) {
    if (value == null || Number.isNaN(value))
        return 20;
    const parsed = Math.trunc(value);
    if (parsed <= 0)
        return 20;
    return Math.min(parsed, 100);
}
function normalizeOffset(value) {
    if (value == null || Number.isNaN(value))
        return 0;
    const parsed = Math.trunc(value);
    if (parsed < 0)
        return 0;
    return parsed;
}
