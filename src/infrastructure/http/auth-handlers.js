import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { authenticateUser } from '../../application/auth/authenticate-user';
import { refreshAccessToken } from '../../application/auth/refresh-access-token';
import { revokeRefreshToken } from '../../application/auth/revoke-refresh-token';
import { confirmEmail } from '../../application/auth/confirm-email';
import { registerUser } from '../../application/auth/register-user';
import { resendConfirmationEmail } from '../../application/auth/resend-confirmation-email';
import { requestPasswordReset } from '../../application/auth/request-password-reset';
import { resetPassword } from '../../application/auth/reset-password';
import { getLogger } from '../../shared/utils/logger';
import { registerSchema, loginSchema, confirmEmailSchema, resendConfirmationSchema, requestPasswordResetSchema, resetPasswordSchema, parseWithSchema } from './schemas';
import { refreshTokenSchema, revokeTokenSchema } from './schemas/auth-schemas';
import { buildLogContext } from '../../shared/http/log-context';
export function createAuthHandlers(deps) {
    return {
        register: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(registerSchema, body);
                const result = await registerUser({
                    email: validated.email,
                    password: validated.password,
                    locale: validated.locale,
                    roleKey: validated.role_key
                }, {
                    users: deps.users,
                    confirmations: deps.confirmations,
                    passwordHasher: deps.passwordHasher,
                    emailSender: deps.emailSender,
                    unitOfWork: deps.unitOfWork,
                    tokenGenerator: deps.tokenGenerator,
                    hashService: deps.hashService,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    config: deps.config
                });
                log.info('auth.register.created', { user_id: result.id, email: result.email });
                return jsonResponse(201, {
                    data: result,
                    message_key: 'auth.registration_pending_confirmation'
                }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        login: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(loginSchema, body);
                log.debug('auth.login.attempt', { email: validated.email });
                const { userId, ...token } = await authenticateUser({ email: validated.email, password: validated.password }, {
                    users: deps.users,
                    refreshTokens: deps.refreshTokens,
                    passwordHasher: deps.passwordHasher,
                    jwtService: deps.jwtService,
                    hashService: deps.hashService,
                    tokenGenerator: deps.tokenGenerator,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    config: deps.config
                });
                await deps.auditLog.log({
                    actorUserId: userId,
                    action: 'user.login',
                    entityType: 'user',
                    entityId: userId
                });
                log.info('auth.login.success', { email: validated.email });
                return jsonResponse(200, { data: token }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        confirmEmail: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(confirmEmailSchema, body);
                const result = await confirmEmail(validated.token, {
                    confirmations: deps.confirmations,
                    users: deps.users,
                    hashService: deps.hashService,
                    clock: deps.clock
                });
                log.info('auth.confirm.success', { user_id: result.userId });
                return jsonResponse(200, { message_key: 'auth.email_confirmed' }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        resendConfirmationEmail: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(resendConfirmationSchema, body);
                await resendConfirmationEmail({ email: validated.email }, {
                    users: deps.users,
                    confirmations: deps.confirmations,
                    emailSender: deps.emailSender,
                    tokenGenerator: deps.tokenGenerator,
                    hashService: deps.hashService,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    config: deps.config
                });
                log.info('auth.resend_confirmation.accepted', { email: validated.email });
                return jsonResponse(200, { message_key: 'auth.confirmation_email_resent' }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        requestPasswordReset: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(requestPasswordResetSchema, body);
                await requestPasswordReset({ email: validated.email, locale: validated.locale }, {
                    users: deps.users,
                    passwordResets: deps.passwordResets,
                    emailSender: deps.emailSender,
                    tokenGenerator: deps.tokenGenerator,
                    hashService: deps.hashService,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    config: deps.config
                });
                log.info('auth.password_reset_request.accepted', { email: validated.email });
                return jsonResponse(200, { message_key: 'auth.password_reset_requested' }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        resetPassword: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(resetPasswordSchema, body);
                await resetPassword({ token: validated.token, password: validated.password }, {
                    passwordResets: deps.passwordResets,
                    users: deps.users,
                    passwordHasher: deps.passwordHasher,
                    hashService: deps.hashService,
                    clock: deps.clock
                });
                log.info('auth.password_reset.success');
                return jsonResponse(200, { message_key: 'auth.password_reset_success' }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        refresh: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(refreshTokenSchema, body);
                const result = await refreshAccessToken({ refreshToken: validated.refresh_token }, {
                    refreshTokens: deps.refreshTokens,
                    users: deps.users,
                    jwtService: deps.jwtService,
                    hashService: deps.hashService,
                    tokenGenerator: deps.tokenGenerator,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    config: deps.config
                });
                log.info('auth.refresh.success');
                return jsonResponse(200, { data: result }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        },
        revoke: async (ctx) => {
            const logContext = buildLogContext(ctx);
            const log = getLogger(logContext);
            try {
                const body = await parseJson(ctx.request, ctx);
                if (typeof body !== 'object' || body === null) {
                    return errorResponse(400, 'request.invalid_body', undefined, logContext);
                }
                const validated = parseWithSchema(revokeTokenSchema, body);
                await revokeRefreshToken({ refreshToken: validated.refresh_token }, {
                    refreshTokens: deps.refreshTokens,
                    hashService: deps.hashService,
                    clock: deps.clock
                });
                log.info('auth.revoke.success');
                return jsonResponse(200, { message_key: 'auth.token_revoked' }, logContext);
            }
            catch (error) {
                return handleError(error, log, logContext);
            }
        }
    };
}
