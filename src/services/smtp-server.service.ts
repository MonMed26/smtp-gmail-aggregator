import { SMTPServer, SMTPServerAuthentication, SMTPServerAuthenticationResponse, SMTPServerSession, SMTPServerDataStream } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import { config } from '../config';
import { EmailQueueModel } from '../models/email-queue.model';
import { EmailService } from './email.service';
import { LoadBalancerService } from './load-balancer.service';
import { AccountModel } from '../models/account.model';
import { smtpPool } from './smtp-pool.service';
import { UsageTrackerService } from './usage-tracker.service';
import { EmailLogModel } from '../models/email-log.model';
import { logger } from '../utils/logger';

class SmtpServerService {
  private server: SMTPServer | null = null;

  start(): void {
    const port = config.smtpServer.port;
    const username = config.smtpServer.username;
    const password = config.smtpServer.password;

    this.server = new SMTPServer({
      // Server options
      name: 'SMTP Gmail Aggregator',
      banner: 'SMTP Gmail Aggregator ready',
      size: 25 * 1024 * 1024, // 25MB max message size
      authOptional: false,
      disabledCommands: ['STARTTLS'], // Disable TLS for local dev (enable in production with certs)

      // Authentication handler
      onAuth: (auth: SMTPServerAuthentication, session: SMTPServerSession, callback: (err: Error | null | undefined, response?: SMTPServerAuthenticationResponse) => void) => {
        if (auth.username === username && auth.password === password) {
          logger.debug(`SMTP Auth success from ${session.remoteAddress}`);
          callback(null, { user: auth.username });
        } else {
          logger.warn(`SMTP Auth failed from ${session.remoteAddress}: invalid credentials`);
          callback(new Error('Invalid username or password'));
        }
      },

      // Data handler - receives the email
      onData: (stream: SMTPServerDataStream, session: SMTPServerSession, callback: (err?: Error | null) => void) => {
        this.handleIncomingEmail(stream, session)
          .then(() => callback())
          .catch((err) => {
            logger.error(`SMTP data handler error: ${err.message}`);
            callback(err);
          });
      },

      // Connection handler
      onConnect: (session: SMTPServerSession, callback: (err?: Error | null) => void) => {
        logger.debug(`SMTP connection from ${session.remoteAddress}`);
        callback();
      },

      onClose: (session: SMTPServerSession) => {
        logger.debug(`SMTP connection closed from ${session.remoteAddress}`);
      },
    });

    this.server.on('error', (err: Error) => {
      logger.error(`SMTP Server error: ${err.message}`);
    });

    this.server.listen(port, () => {
      logger.info(`SMTP Server listening on port ${port}`);
      logger.info(`  Connect with: smtp://localhost:${port}`);
      logger.info(`  Auth: ${username} / ${password}`);
    });
  }

  private async handleIncomingEmail(stream: SMTPServerDataStream, session: SMTPServerSession): Promise<void> {
    // Parse the incoming email
    const parsed: ParsedMail = await simpleParser(stream);

    const toAddresses = this.extractAddresses(parsed.to);
    const ccAddresses = this.extractAddresses(parsed.cc);
    const bccAddresses = this.extractAddresses(parsed.bcc);

    if (toAddresses.length === 0) {
      throw new Error('No recipients specified');
    }

    const subject = parsed.subject || '(no subject)';
    const html = parsed.html ? String(parsed.html) : undefined;
    const text = parsed.text || undefined;
    const replyTo = parsed.replyTo ? this.extractAddresses(parsed.replyTo).join(', ') : undefined;

    logger.info(`SMTP received email: to=${toAddresses.join(', ')}, subject="${subject}"`);

    // Determine sending mode based on config
    if (config.smtpServer.mode === 'direct') {
      // Direct mode: send immediately without queue
      await this.sendDirect(toAddresses, ccAddresses, bccAddresses, subject, html, text, replyTo);
    } else {
      // Queue mode: add to queue for background processing
      for (const to of toAddresses) {
        EmailQueueModel.enqueue({
          to,
          cc: ccAddresses.length > 0 ? ccAddresses.join(', ') : undefined,
          bcc: bccAddresses.length > 0 ? bccAddresses.join(', ') : undefined,
          subject,
          html,
          text,
          replyTo,
          strategy: config.defaultStrategy,
        });
      }
      logger.info(`SMTP queued ${toAddresses.length} email(s) for sending`);
    }
  }

  private async sendDirect(
    toAddresses: string[],
    ccAddresses: string[],
    bccAddresses: string[],
    subject: string,
    html: string | undefined,
    text: string | undefined,
    replyTo: string | undefined
  ): Promise<void> {
    // Select account using load balancer
    const account = LoadBalancerService.selectAccount(config.defaultStrategy);

    if (!account) {
      throw new Error('No available accounts with remaining quota');
    }

    const result = await smtpPool.sendEmail(account, {
      from: {
        name: account.display_name || account.email.split('@')[0],
        address: account.email,
      },
      to: toAddresses.join(', '),
      cc: ccAddresses.length > 0 ? ccAddresses.join(', ') : undefined,
      bcc: bccAddresses.length > 0 ? bccAddresses.join(', ') : undefined,
      subject,
      html,
      text,
      replyTo,
    });

    if (result.success) {
      UsageTrackerService.incrementSent(account.id);
      AccountModel.updateLastUsed(account.id);
      EmailLogModel.create({
        account_id: account.id,
        to_address: toAddresses.join(', '),
        subject,
        status: 'sent',
        message_id: result.messageId,
      });
      logger.info(`SMTP direct send success via ${account.email}: ${result.messageId}`);
    } else {
      UsageTrackerService.incrementFailed(account.id);
      EmailLogModel.create({
        account_id: account.id,
        to_address: toAddresses.join(', '),
        subject,
        status: 'failed',
        error_message: result.error,
      });
      throw new Error(`Send failed: ${result.error}`);
    }
  }

  private extractAddresses(field: any): string[] {
    if (!field) return [];

    if (Array.isArray(field)) {
      return field.flatMap(item => {
        if (typeof item === 'string') return [item];
        if (item && item.value) {
          return item.value.map((v: any) => v.address).filter(Boolean);
        }
        return [];
      });
    }

    if (typeof field === 'string') return [field];

    if (field && field.value) {
      return field.value.map((v: any) => v.address).filter(Boolean);
    }

    if (field && field.text) return [field.text];

    return [];
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        logger.info('SMTP Server stopped');
      });
      this.server = null;
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}

export const smtpServer = new SmtpServerService();
