import type { EmailMessage, EmailSender } from "./email-sender";
import { logger } from "../../shared/utils/logger";

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    logger.info("email.sent", {
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
