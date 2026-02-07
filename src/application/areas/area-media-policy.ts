import type { Area } from '../../domain/areas/entities/area';

function hasRole(roles: readonly string[] | undefined, role: string): boolean {
  return roles?.includes(role) ?? false;
}

export function canManageAreaMedia(
  area: Area,
  actorUserId: string,
  actorRoles: readonly string[] | undefined
): boolean {
  if (hasRole(actorRoles, 'administrator')) {
    return true;
  }
  return area.ownerUserId === actorUserId;
}

export function canReadAreaMedia(
  area: Area,
  actorUserId: string | undefined,
  actorRoles: readonly string[] | undefined
): boolean {
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
