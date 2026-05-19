import type { AuditLogEntry } from "../../domain/audit/audit-log-repository";

export interface AlertNotifier {
  notify(entry: AuditLogEntry): Promise<void>;
}

const ALERT_RULES: Array<{ action: string }> = [
  { action: "auth.refresh_reuse_detected" },
  { action: "auth.fingerprint_mismatch" },
  { action: "payment.webhook_invalid_signature" },
  { action: "auth.login_locked" },
];

const SEVERITY_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

const alertRateLimit = new Map<string, number>();

function isRateLimited(entry: AuditLogEntry): boolean {
  const key = entry.action;
  const now = Date.now();
  const lastAlert = alertRateLimit.get(key);
  if (lastAlert && now - lastAlert < 60_000) return true;
  alertRateLimit.set(key, now);
  return false;
}

export function shouldAlert(
  entry: AuditLogEntry,
  severityThreshold: string,
): boolean {
  const entrySeverity = SEVERITY_ORDER[entry.severity ?? "info"] ?? 0;
  const threshold =
    SEVERITY_ORDER[severityThreshold] ?? SEVERITY_ORDER.critical;

  if (entrySeverity >= threshold) return true;
  if (ALERT_RULES.some((rule) => rule.action === entry.action)) return true;
  return false;
}

export class EmailAlertNotifier implements AlertNotifier {
  constructor(
    private readonly emailSender: {
      send(options: {
        to: string;
        subject: string;
        text: string;
      }): Promise<void>;
    },
    private readonly to: string,
  ) {}

  async notify(entry: AuditLogEntry): Promise<void> {
    if (isRateLimited(entry)) return;
    await this.emailSender.send({
      to: this.to,
      subject: `[ALERT] ${entry.action} - ${entry.severity}`,
      text: [
        `Action: ${entry.action}`,
        `Severity: ${entry.severity}`,
        `Entity: ${entry.entityType} (${entry.entityId ?? "N/A"})`,
        `Actor: ${entry.actorUserId ?? "anonymous"}`,
        `Time: ${entry.createdAt.toISOString()}`,
        entry.errorCode ? `Error: ${entry.errorCode}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
}

export class WebhookAlertNotifier implements AlertNotifier {
  constructor(private readonly webhookUrl: string) {}

  async notify(entry: AuditLogEntry): Promise<void> {
    if (isRateLimited(entry)) return;
    await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "audit.alert",
        action: entry.action,
        severity: entry.severity,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        actor_user_id: entry.actorUserId,
        error_code: entry.errorCode,
        created_at: entry.createdAt.toISOString(),
      }),
    });
  }
}

export class CompositeAlertNotifier implements AlertNotifier {
  constructor(private readonly notifiers: AlertNotifier[]) {}

  async notify(entry: AuditLogEntry): Promise<void> {
    await Promise.allSettled(this.notifiers.map((n) => n.notify(entry)));
  }
}

export function buildAlertNotifier(env: {
  alertEmailTo?: string;
  alertWebhookUrl?: string;
  emailSender?: {
    send(options: { to: string; subject: string; text: string }): Promise<void>;
  };
}): AlertNotifier | null {
  const notifiers: AlertNotifier[] = [];

  if (env.alertEmailTo && env.emailSender) {
    notifiers.push(new EmailAlertNotifier(env.emailSender, env.alertEmailTo));
  }
  if (env.alertWebhookUrl) {
    notifiers.push(new WebhookAlertNotifier(env.alertWebhookUrl));
  }

  if (notifiers.length === 0) return null;
  return new CompositeAlertNotifier(notifiers);
}
