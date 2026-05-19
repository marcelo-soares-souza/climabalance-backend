import type { RefreshTokenRepository } from "../../domain/user/refresh-token-repository";
import type { UserRepository } from "../../domain/user/user-repository";
import type { JwtService } from "../../domain/services/jwt-service";
import type { HashService } from "../../domain/services/hash-service";
import type { TokenGenerator } from "../../domain/services/token-generator";
import type { IdGenerator } from "../../domain/services/id-generator";
import type { Clock } from "../../domain/services/clock";
import type { Config } from "../../domain/services/config";
import type { AuditLogRepository } from "../../domain/audit/audit-log-repository";
import { InvalidTokenError, TokenExpiredError } from "../../domain/errors";

export type RefreshAccessTokenInput = {
  refreshToken: string;
  fingerprint?: string;
  userAgent?: string;
};

export type RefreshAccessTokenResult = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
};

export async function refreshAccessToken(
  input: RefreshAccessTokenInput,
  deps: {
    refreshTokens: RefreshTokenRepository;
    users: UserRepository;
    jwtService: JwtService;
    hashService: HashService;
    tokenGenerator: TokenGenerator;
    idGenerator: IdGenerator;
    clock: Clock;
    config: Config;
    auditLog?: Pick<AuditLogRepository, "log">;
  },
): Promise<RefreshAccessTokenResult> {
  const tokenHash = await deps.hashService.sha256(input.refreshToken);
  const stored = await deps.refreshTokens.findByTokenHash(tokenHash);

  if (!stored) {
    throw new InvalidTokenError("refresh token not found");
  }

  // Reuse detection: if already revoked, revoke ALL tokens for this user
  if (stored.revokedAt) {
    const now = deps.clock.now();
    await deps.refreshTokens.revokeAllByUserId(stored.userId, now);
    if (deps.auditLog) {
      await deps.auditLog.log({
        actorUserId: stored.userId,
        action: "auth.refresh_reuse_detected",
        entityType: "refresh_token",
        entityId: stored.id,
        ctx: {} as any,
        success: false,
        httpStatus: 401,
        severity: "critical",
        category: ["security"],
      });
    }
    throw new InvalidTokenError("refresh token reuse detected");
  }

  const now = deps.clock.now();
  if (stored.expiresAt < now) {
    throw new TokenExpiredError(stored.expiresAt);
  }

  // Fingerprint verification
  if (stored.fingerprintHash && input.fingerprint) {
    const inputFingerprintHash = await deps.hashService.sha256(
      input.fingerprint,
    );
    if (stored.fingerprintHash !== inputFingerprintHash) {
      await deps.refreshTokens.revokeAllByUserId(stored.userId, now);
      if (deps.auditLog) {
        await deps.auditLog.log({
          actorUserId: stored.userId,
          action: "auth.fingerprint_mismatch",
          entityType: "refresh_token",
          entityId: stored.id,
          ctx: {} as any,
          success: false,
          httpStatus: 401,
          severity: "critical",
          category: ["security"],
        });
      }
      throw new InvalidTokenError("fingerprint mismatch");
    }
  }

  // Revoke old token (rotation)
  await deps.refreshTokens.revoke(stored.id, now);

  // Get user roles for new access token
  const roles = await deps.users.getRoles(stored.userId);

  // Issue new access token with jti
  const nowSec = Math.floor(now.getTime() / 1000);
  const jti = deps.idGenerator.generate();
  const accessPayload = {
    sub: stored.userId,
    roles,
    iss: deps.config.jwtIssuer,
    aud: deps.config.jwtAudience,
    iat: nowSec,
    exp: nowSec + deps.config.jwtTtlSeconds,
    jti,
  };
  const accessToken = await deps.jwtService.sign(
    accessPayload,
    deps.config.jwtSecret,
  );

  // Issue new refresh token
  const newRawToken = deps.tokenGenerator.generate();
  const newTokenHash = await deps.hashService.sha256(newRawToken);
  const refreshTtlSeconds = deps.config.refreshTokenTtlDays * 86400;
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);

  await deps.refreshTokens.create({
    id: deps.idGenerator.generate(),
    userId: stored.userId,
    tokenHash: newTokenHash,
    expiresAt: refreshExpiresAt,
    createdAt: now,
    updatedAt: now,
    fingerprintHash: stored.fingerprintHash,
    userAgent: input.userAgent || stored.userAgent,
  });

  return {
    accessToken,
    refreshToken: newRawToken,
    tokenType: "Bearer",
    expiresIn: deps.config.jwtTtlSeconds,
    refreshExpiresIn: refreshTtlSeconds,
  };
}
