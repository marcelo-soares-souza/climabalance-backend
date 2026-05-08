import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { UserRepository } from '../../domain/user/user-repository';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import {
  buildNewUserNotification,
  buildAreaCreatedNotification,
  buildAreaAuditRequested,
  buildAreaApproved,
  buildAreaRejected,
  buildStripeOnboardingFailed,
  buildContributionRefunded,
  buildAreaMilestone,
  buildContributionReceived,
} from '../../infrastructure/email/templates';

export type JobHandlerDeps = {
  users: UserRepository;
  emailSender: EmailSender;
  frontendUrl: string;
  areas?: AreaRepository;
};

async function resolveUserLocale(email: string, users: UserRepository): Promise<string> {
  const user = await users.findByEmail(email);
  return user?.locale ?? 'pt-BR';
}

async function resolveAreaUrl(areaId: string, frontendUrl: string, areas?: AreaRepository): Promise<string> {
  if (!areas) return `${frontendUrl}/areas/${areaId}`;
  const area = await areas.findById(areaId);
  return `${frontendUrl}/areas/${area?.slug ?? areaId}`;
}

export async function handleUserRegistered(
  payload: { email: string; roleKey: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send(buildNewUserNotification('pt-BR', email, payload.email, payload.roleKey))
    )
  );
}

export async function handleAreaCreated(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  const area = deps.areas ? await deps.areas.findById(payload.areaId) : null;
  const url = `${deps.frontendUrl}/areas/${area?.slug ?? payload.areaId}`;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send(buildAreaCreatedNotification('pt-BR', email, payload.areaName, payload.producerEmail, url))
    )
  );
}

export async function handleAuditRequested(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  const url = `${deps.frontendUrl}/audit/area/${payload.areaId}`;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send(buildAreaAuditRequested('pt-BR', email, payload.areaName, payload.producerEmail, url))
    )
  );
}

export async function handleAreaApproved(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.producerEmail, deps.users);
  const url = await resolveAreaUrl(payload.areaId, deps.frontendUrl, deps.areas);
  await deps.emailSender.send(buildAreaApproved(locale, payload.producerEmail, payload.areaName, url));
}

export async function handleAreaRejected(
  payload: { areaId: string; areaName: string; producerEmail: string; reason: string },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.producerEmail, deps.users);
  const url = await resolveAreaUrl(payload.areaId, deps.frontendUrl, deps.areas);
  await deps.emailSender.send(buildAreaRejected(locale, payload.producerEmail, payload.areaName, payload.reason, url));
}

export async function handleStripeOnboardingFailed(
  payload: { email: string; producerName?: string; reason?: string },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.email, deps.users);
  await deps.emailSender.send(buildStripeOnboardingFailed(locale, payload.email, payload.reason, `${deps.frontendUrl}/how-to-use/stripe-setup`));
}

export async function handleContributionRefunded(
  payload: { areaId: string; areaName: string; producerEmail: string; amount: number; currency: string },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.producerEmail, deps.users);
  const url = await resolveAreaUrl(payload.areaId, deps.frontendUrl, deps.areas);
  await deps.emailSender.send(buildContributionRefunded(locale, payload.producerEmail, payload.areaName, payload.amount, payload.currency, url));
}

export async function handleCompensationMilestone(
  payload: { areaId: string; areaName: string; producerEmail: string; percentage: number },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.producerEmail, deps.users);
  const url = await resolveAreaUrl(payload.areaId, deps.frontendUrl, deps.areas);
  await deps.emailSender.send(buildAreaMilestone(locale, payload.producerEmail, payload.areaName, payload.percentage, url));
}

export async function handleContributionReceived(
  payload: { areaId: string; areaName: string; producerEmail: string; amount: number; currency: string; treesCount: number },
  deps: JobHandlerDeps
): Promise<void> {
  const locale = await resolveUserLocale(payload.producerEmail, deps.users);
  const url = await resolveAreaUrl(payload.areaId, deps.frontendUrl, deps.areas);
  await deps.emailSender.send(buildContributionReceived(locale, payload.producerEmail, payload.areaName, payload.amount, payload.currency, payload.treesCount, url));
}

async function findAdminEmails(users: UserRepository): Promise<string[]> {
  const all = await users.list({});
  const adminIds = await Promise.all(
    all.map(async (u) => {
      const roles = await users.getRoles(u.id);
      return roles.includes('administrator') ? u.email : null;
    })
  );
  return adminIds.filter((e): e is string => e !== null);
}
