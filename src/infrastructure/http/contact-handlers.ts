import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailSender } from '../email/email-sender';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { parseWithSchema } from './schemas';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';
import { buildContactNotification } from '../email/templates';
import { z } from 'zod';

const contactSchema = z.object({
  message: z.string().trim().min(1, { message: 'required' }).max(5000, { message: 'too_long' }),
});

export type ContactHandlersDeps = {
  users: UserRepository;
  emailSender: EmailSender;
  auditLog: Pick<AuditLogRepository, 'log'>;
};

export function createContactHandlers(deps: ContactHandlersDeps) {
  return {
    send: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(contactSchema, body);

        if (!ctx.auth?.userId) {
          return errorResponse(401, 'auth.required', undefined, logContext);
        }

        const user = await deps.users.findById(ctx.auth.userId);
        if (!user) {
          return errorResponse(404, 'user_not_found', undefined, logContext);
        }

        const profile = await deps.users.getProfile(ctx.auth.userId);
        const displayName = profile?.displayName || user.email;

        const adminUserIds = await deps.users.findUserIdsByRole('administrator');
        const adminEmails: string[] = [];

        for (const adminId of adminUserIds) {
          const admin = await deps.users.findById(adminId);
          if (admin && admin.status === 'active') {
            adminEmails.push(admin.email);
          }
        }

        if (adminEmails.length === 0) {
          log.warn('contact.no_admins_found');
          return errorResponse(500, 'contact.no_admins', undefined, logContext);
        }

        for (const adminEmail of adminEmails) {
          const emailMessage = buildContactNotification(
            user.locale,
            adminEmail,
            displayName,
            user.email,
            validated.message,
          );
          await deps.emailSender.send(emailMessage);
        }

        log.info('contact.message_sent', { user_id: ctx.auth.userId, admin_count: adminEmails.length });

        await deps.auditLog.log({
          actorUserId: ctx.auth.userId,
          action: 'contact.submitted',
          entityType: 'contact',
          entityId: ctx.auth.userId,
          ctx,
          success: true,
          httpStatus: 200,
          severity: 'info',
          category: ['user_management'],
        });

        return jsonResponse(200, { message_key: 'contact.message_sent' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
