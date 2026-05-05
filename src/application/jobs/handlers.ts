import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { UserRepository } from '../../domain/user/user-repository';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';

export type JobHandlerDeps = {
  users: UserRepository;
  emailSender: EmailSender;
  frontendUrl: string;
  areas?: AreaRepository;
};

export async function handleUserRegistered(
  payload: { email: string; roleKey: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send({
        to: email,
        subject: 'New user registered',
        text: `A new user has registered on the platform.\n\nEmail: ${payload.email}\nType: ${payload.roleKey}\n\nAccess the admin panel for details.`,
      })
    )
  );
}

export async function handleAreaCreated(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send({
        to: email,
        subject: 'New area registered',
        text: `A new area has been registered on the platform.\n\nArea: ${payload.areaName}\nProducer: ${payload.producerEmail}\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
      })
    )
  );
}

export async function handleAuditRequested(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  const admins = await findAdminEmails(deps.users);
  if (admins.length === 0) return;
  await Promise.all(
    admins.map((email) =>
      deps.emailSender.send({
        to: email,
        subject: 'Area pending audit',
        text: `The area "${payload.areaName}" has been submitted for audit.\n\nProducer: ${payload.producerEmail}\n\nAccess: ${deps.frontendUrl}/audit/area/${payload.areaId}`,
      })
    )
  );
}

export async function handleAreaApproved(
  payload: { areaId: string; areaName: string; producerEmail: string },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: 'Area approved',
    text: `Your area "${payload.areaName}" has been approved!\n\nIt is now visible to supporters on the map.\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
}

export async function handleAreaRejected(
  payload: { areaId: string; areaName: string; producerEmail: string; reason: string },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: 'Area rejected',
    text: `Your area "${payload.areaName}" has been rejected.\n\nReason: ${payload.reason}\n\nPlease review the feedback and submit a new version.\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
}

export async function handleStripeOnboardingFailed(
  payload: { email: string; producerName?: string; reason?: string },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.email,
    subject: 'Stripe onboarding requires attention',
    text: `Your Stripe account could not be fully set up.\n\n${payload.reason ? `Reason: ${payload.reason}\n\n` : ''}Please log in and check your Stripe onboarding status to complete the required steps.\n\nAccess: ${deps.frontendUrl}/how-to-use/stripe-setup`,
  });
}

export async function handleContributionRefunded(
  payload: { areaId: string; areaName: string; producerEmail: string; amount: number; currency: string },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: 'Contribution refunded',
    text: `A contribution to your area "${payload.areaName}" has been refunded.\n\nRefunded amount: ${payload.amount.toFixed(2)} ${payload.currency}\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
}

export async function handleCompensationMilestone(
  payload: { areaId: string; areaName: string; producerEmail: string; percentage: number },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: `Your area reached ${payload.percentage}% capacity!`,
    text: `Great news! Your area "${payload.areaName}" has reached ${payload.percentage}% of its total carbon offset capacity.\n\nKeep up the great work!\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
}

export async function handleContributionReceived(
  payload: { areaId: string; areaName: string; producerEmail: string; amount: number; currency: string; treesCount: number },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: 'Contribution received',
    text: `Your area "${payload.areaName}" has received a contribution!\n\nAmount: ${payload.amount.toFixed(2)} ${payload.currency}\nTrees: ${payload.treesCount}\n\nAccess: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
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
