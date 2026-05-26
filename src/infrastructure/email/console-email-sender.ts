import type { EmailMessage, EmailSender } from "./email-sender";
import { logger } from "../../shared/utils/logger";

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const subject = `[ClimaBalance] ${message.subject}`;
    logger.info("email.sent", {
      to: message.to,
      subject,
      text: message.text,
      html: message.html,
    });
  }
}
