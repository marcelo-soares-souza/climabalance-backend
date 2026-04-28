import type { HttpContext } from './router';

export type AuthContext = NonNullable<HttpContext['auth']>;

export function requireAuth(ctx: HttpContext): AuthContext {
  if (!ctx.auth) {
    throw new Error('auth.required');
  }

  return ctx.auth;
}
