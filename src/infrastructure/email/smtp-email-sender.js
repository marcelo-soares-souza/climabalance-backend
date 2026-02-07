import nodemailer from 'nodemailer';
import { logger } from '../../shared/utils/logger';
export class SMTPEmailSender {
    transporter;
    from;
    constructor(config) {
        this.from = config.from;
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass
            }
        });
    }
    async send(message) {
        logger.info('email.sending', {
            to: message.to,
            subject: message.subject
        });
        try {
            const result = await this.transporter.sendMail({
                from: this.from,
                to: message.to,
                subject: message.subject,
                text: message.text,
                html: message.html
            });
            logger.info('email.sent', {
                to: message.to,
                subject: message.subject,
                messageId: result.messageId
            });
        }
        catch (error) {
            logger.error('email.failed', {
                to: message.to,
                subject: message.subject,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}
