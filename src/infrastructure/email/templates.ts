import { t } from '../../shared/translations/loader';
import type { EmailMessage } from './email-sender';

export function buildConfirmationEmail(locale: string, to: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.confirm.subject', locale),
    text: t('email.confirm.body', locale, { url }),
  };
}

export function buildPasswordResetEmail(locale: string, to: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.passwordReset.subject', locale),
    text: t('email.passwordReset.body', locale, { url }),
  };
}

export function buildNewUserNotification(locale: string, to: string, email: string, roleKey: string): EmailMessage {
  return {
    to,
    subject: t('email.newUserRegistered.subject', locale),
    text: t('email.newUserRegistered.body', locale, { email, roleKey }),
  };
}

export function buildAreaCreatedNotification(locale: string, to: string, areaName: string, producerEmail: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.areaCreated.subject', locale),
    text: t('email.areaCreated.body', locale, { areaName, producerEmail, url }),
  };
}

export function buildAreaAuditRequested(locale: string, to: string, areaName: string, producerEmail: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.areaAuditRequested.subject', locale),
    text: t('email.areaAuditRequested.body', locale, { areaName, producerEmail, url }),
  };
}

export function buildAreaApproved(locale: string, to: string, areaName: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.areaApproved.subject', locale),
    text: t('email.areaApproved.body', locale, { areaName, url }),
  };
}

export function buildAreaRejected(locale: string, to: string, areaName: string, reason: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.areaRejected.subject', locale),
    text: t('email.areaRejected.body', locale, { areaName, reason, url }),
  };
}

export function buildStripeOnboardingFailed(locale: string, to: string, reason: string | undefined, url: string): EmailMessage {
  const reasonParagraph = reason ? `Motivo: ${reason}\n\n` : '';
  return {
    to,
    subject: t('email.stripeOnboardingFailed.subject', locale),
    text: t('email.stripeOnboardingFailed.body', locale, { reasonParagraph, url }),
  };
}

export function buildContributionRefunded(locale: string, to: string, areaName: string, amount: number, currency: string, url: string): EmailMessage {
  return {
    to,
    subject: t('email.contributionRefunded.subject', locale),
    text: t('email.contributionRefunded.body', locale, {
      areaName,
      amount: amount.toFixed(2),
      currency,
      url,
    }),
  };
}

export function buildAreaMilestone(locale: string, to: string, areaName: string, percentage: number, url: string): EmailMessage {
  return {
    to,
    subject: t('email.areaMilestone.subject', locale, { percentage: String(percentage) }),
    text: t('email.areaMilestone.body', locale, {
      areaName,
      percentage: String(percentage),
      url,
    }),
  };
}

export function buildContributionReceived(locale: string, to: string, areaName: string, amount: number, currency: string, treesCount: number, url: string): EmailMessage {
  return {
    to,
    subject: t('email.contributionReceived.subject', locale),
    text: t('email.contributionReceived.body', locale, {
      areaName,
      amount: amount.toFixed(2),
      currency,
      treesCount: String(treesCount),
      url,
    }),
  };
}
