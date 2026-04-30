import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { UserRepository } from '../../domain/user/user-repository';

export type JobHandlerDeps = {
  users: UserRepository;
  emailSender: EmailSender;
  frontendUrl: string;
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
        subject: 'Novo usuário registrado',
        text: `Um novo usuário se registrou na plataforma.\n\nE-mail: ${payload.email}\nTipo: ${payload.roleKey}\n\nAcesse o painel administrativo para mais detalhes.`,
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
        subject: 'Nova área cadastrada',
        text: `Uma nova área foi cadastrada na plataforma.\n\nÁrea: ${payload.areaName}\nProdutor: ${payload.producerEmail}\n\nAcesse: ${deps.frontendUrl}/areas/${payload.areaId}`,
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
        subject: 'Área aguarda auditoria',
        text: `A área "${payload.areaName}" foi submetida para auditoria.\n\nProdutor: ${payload.producerEmail}\n\nAcesse: ${deps.frontendUrl}/audit/area/${payload.areaId}`,
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
    subject: 'Área aprovada',
    text: `Sua área "${payload.areaName}" foi aprovada na plataforma!\n\nAgora ela está visível para apoiadores no mapa.\n\nAcesse: ${deps.frontendUrl}/areas/${payload.areaId}`,
  });
}

export async function handleContributionReceived(
  payload: { areaId: string; areaName: string; producerEmail: string; amount: number; currency: string; treesCount: number },
  deps: JobHandlerDeps
): Promise<void> {
  await deps.emailSender.send({
    to: payload.producerEmail,
    subject: 'Contribuição recebida',
    text: `Sua área "${payload.areaName}" recebeu uma contribuição!\n\nValor: ${payload.amount.toFixed(2)} ${payload.currency}\nÁrvores: ${payload.treesCount}\n\nAcesse: ${deps.frontendUrl}/areas/${payload.areaId}`,
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
