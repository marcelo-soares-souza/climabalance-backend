function hasRole(roles, role) {
    return roles?.includes(role) ?? false;
}
export function canManageAreaMedia(area, actorUserId, actorRoles) {
    if (hasRole(actorRoles, 'administrator')) {
        return true;
    }
    return area.ownerUserId === actorUserId;
}
export function canReadAreaMedia(area, actorUserId, actorRoles) {
    if (area.isActive()) {
        return true;
    }
    if (hasRole(actorRoles, 'administrator') || hasRole(actorRoles, 'analyst')) {
        return true;
    }
    if (!actorUserId) {
        return false;
    }
    return area.ownerUserId === actorUserId;
}
