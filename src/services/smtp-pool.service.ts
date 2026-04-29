import nodemailer, { Transporter } from 'nodemailer';
import { Account, SendEmailOptions, SendResult } from '../types';
import { AccountModel } from '../models/account.model';
import { config } from '../config';
import { logger } from '../utils/logger';

class SmtpPoolService {
  private transporters: Map<number, Transporter> = new Map();

  getTransporter(account: Account): Transporter {
    if (this.transporters.has(account.id)) {
      return this.transporters.get(account.id)!;
    }

    const password = AccountModel.getDecryptedPassword(account);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: account.email,
        pass: password,
      },
      pool: true,
      maxConnections: config.smtp.poolSize,
      maxMessages: 100,
      socketTimeout: config.smtp.timeout,
      greetingTimeout: config.smtp.timeout,
    });

    this.transporters.set(account.id, transporter);
    logger.debug(`SMTP transporter created for ${account.email}`);

    return transporter;
  }

  async sendEmail(account: Account, options: SendEmailOptions): Promise<SendResult> {
    const transporter = this.getTransporter(account);

    try {
      const info = await transporter.sendMail({
        from: `"${options.from.name}" <${options.from.address}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });

      logger.info(`Email sent via ${account.email}: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        accountId: account.id,
        accountEmail: account.email,
      };
    } catch (error: any) {
      logger.error(`Email send failed via ${account.email}: ${error.message}`);

      // If auth error, remove transporter so it gets recreated
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        this.removeTransporter(account.id);
      }

      return {
        success: false,
        error: error.message,
        accountId: account.id,
        accountEmail: account.email,
      };
    }
  }

  async verifyAccount(account: Account): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = this.getTransporter(account);
      await transporter.verify();
      return { success: true };
    } catch (error: any) {
      this.removeTransporter(account.id);
      return { success: false, error: error.message };
    }
  }

  removeTransporter(accountId: number): void {
    const transporter = this.transporters.get(accountId);
    if (transporter) {
      transporter.close();
      this.transporters.delete(accountId);
      logger.debug(`SMTP transporter removed for account ${accountId}`);
    }
  }

  closeAll(): void {
    for (const [id, transporter] of this.transporters) {
      transporter.close();
    }
    this.transporters.clear();
    logger.info('All SMTP transporters closed');
  }
}

export const smtpPool = new SmtpPoolService();
