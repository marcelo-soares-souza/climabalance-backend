import type { HttpContext } from './router';
import type { AuditLogSeverity } from '../../domain/audit/audit-log-repository';

/**
 * Extract audit log context from HTTP request.
 * This helper automatically captures common fields for audit logging.
 */
export function extractAuditContext(ctx: HttpContext): {
  actorEmail?: string;
  clientIp?: string;
  userAgent?: string;
  requestId?: string;
  referer?: string;
} {
  const headers = ctx.request.headers;

  return {
    actorEmail: (ctx.auth as { userId: string; roles: string[]; email?: string } | undefined)?.email,
    clientIp: ctx.clientIp ?? headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0],
    userAgent: headers.get('user-agent') ?? undefined,
    requestId: ctx.requestId,
    referer: headers.get('referer') ?? headers.get('referrer') ?? undefined,
  };
}

/**
 * Categorize audit log entry based on action and entity type.
 */
export function categorizeAuditEntry(action: string, entityType: string): string[] {
  const categories: string[] = [];

  // Financial operations
  if (entityType.includes('payment') || entityType.includes('compensation') || action.includes('payment')) {
    categories.push('financial');
  }

  // Security operations
  if (action.includes('login') || action.includes('logout') || action.includes('auth') ||
      action.includes('password') || action.includes('token')) {
    categories.push('security');
  }

  // Data modifications
  if (action.includes('create') || action.includes('update') || action.includes('delete') ||
      action.includes('modify')) {
    categories.push('data_modification');
  }

  // Compliance/certification
  if (entityType.includes('certificate') || entityType.includes('area') || action.includes('approve') ||
      action.includes('reject') || action.includes('audit')) {
    categories.push('compliance');
  }

  // User management
  if (entityType === 'user' || action.includes('register') || action.includes('role')) {
    categories.push('user_management');
  }

  return categories.length > 0 ? categories : ['general'];
}

/**
 * Determine severity based on action and success status.
 */
export function determineSeverity(
  action: string,
  success: boolean,
  httpStatus?: number
): AuditLogSeverity {
  // Critical failures
  if (!success && (httpStatus === 500 || httpStatus === 503)) {
    return 'critical';
  }

  // Security failures
  if (!success && (action.includes('login') || action.includes('auth'))) {
    return 'warning';
  }

  // General failures
  if (!success || (httpStatus && httpStatus >= 400)) {
    return 'error';
  }

  // Critical success operations
  if (action.includes('delete') || action.includes('suspend') || action.includes('revoke')) {
    return 'warning';
  }

  // Important operations
  if (action.includes('approve') || action.includes('activate') || action.includes('payment') ||
      action.includes('certificate')) {
    return 'info';
  }

  // Default
  return 'info';
}

/**
 * Check if operation is sensitive (requires special attention).
 */
export function isSensitiveOperation(action: string, entityType: string): boolean {
  const sensitiveActions = [
    'delete', 'suspend', 'revoke', 'approve', 'reject',
    'payment', 'refund', 'role', 'permission'
  ];

  const sensitiveEntities = [
    'payment', 'certificate', 'user', 'role', 'area'
  ];

  return sensitiveActions.some(a => action.toLowerCase().includes(a)) ||
         sensitiveEntities.some(e => entityType.toLowerCase().includes(e));
}

/**
 * Parse country code from IP address (simplified version).
 * In production, use a GeoIP service like MaxMind.
 */
export function parseCountryFromIp(ip: string | null | undefined): string | null {
  // Placeholder - integrate with GeoIP service in production
  // For now, return null (requires external service)
  return null;
}
