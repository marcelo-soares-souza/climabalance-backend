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
  _area: Area,
  _actorUserId: string | undefined,
  _actorRoles: readonly string[] | undefined
): boolean {
  return true;
}
