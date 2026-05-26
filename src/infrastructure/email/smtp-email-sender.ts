import nodemailer from "nodemailer";
import type { EmailMessage, EmailSender } from "./email-sender";
import { logger } from "../../shared/utils/logger";

export type SMTPConfig = {
  host: string;
  port: number;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  domain?: string;
};

export class SMTPEmailSender implements EmailSender {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(config: SMTPConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
        method: "PLAIN",
      },
      name: config.domain || config.host,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const subject = `[ClimaBalance] ${message.subject}`;
    logger.info("email.sending", {
      to: message.to,
      subject,
    });

    try {
      const result = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text: message.text,
        html: message.html,
      });

      logger.info("email.sent", {
        to: message.to,
        subject,
        messageId: result.messageId,
      });
    } catch (error) {
      logger.error("email.failed", {
        to: message.to,
        subject,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
