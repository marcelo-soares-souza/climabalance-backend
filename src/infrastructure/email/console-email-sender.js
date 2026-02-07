import { logger } from '../../shared/utils/logger';
export class ConsoleEmailSender {
    async send(message) {
        logger.info('email.sent', {
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html
        });
    }
}
