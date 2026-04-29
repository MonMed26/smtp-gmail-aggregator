import { AccountModel } from '../models/account.model';
import { EmailQueueModel } from '../models/email-queue.model';
import { EmailLogModel } from '../models/email-log.model';
import { LoadBalancerService } from './load-balancer.service';
import { UsageTrackerService } from './usage-tracker.service';
import { smtpPool } from './smtp-pool.service';
import { EmailQueueItem, SendResult, StrategyType } from '../types';
import { logger } from '../utils/logger';

export class EmailService {
  static async processQueueItem(item: EmailQueueItem): Promise<SendResult> {
    // Select account using the specified strategy
    const account = LoadBalancerService.selectAccount(item.strategy as StrategyType);

    if (!account) {
      const error = 'No available accounts with remaining quota';
      EmailQueueModel.updateStatus(item.id, 'failed', error);
      logger.error(`Queue item ${item.id}: ${error}`);
      return {
        success: false,
        error,
        accountId: 0,
        accountEmail: 'none',
      };
    }

    // Mark as processing
    EmailQueueModel.updateStatus(item.id, 'processing', undefined, account.id);

    // Use custom from if provided, otherwise fall back to account info
    const fromName = item.from_name || account.display_name || account.email.split('@')[0];
    const fromAddress = item.from_address || account.email;

    // Send the email
    const result = await smtpPool.sendEmail(account, {
      from: {
        name: fromName,
        address: fromAddress,
      },
      to: item.to_address,
      cc: item.cc || undefined,
      bcc: item.bcc || undefined,
      subject: item.subject,
      html: item.body_html || undefined,
      text: item.body_text || undefined,
      replyTo: item.reply_to || undefined,
    });

    if (result.success) {
      // Success
      EmailQueueModel.updateStatus(item.id, 'sent', undefined, account.id);
      UsageTrackerService.incrementSent(account.id);
      AccountModel.updateLastUsed(account.id);

      EmailLogModel.create({
        queue_id: item.id,
        account_id: account.id,
        to_address: item.to_address,
        subject: item.subject,
        status: 'sent',
        message_id: result.messageId,
      });

      logger.info(`Email sent: queue_id=${item.id}, to=${item.to_address}, via=${account.email}`);
    } else {
      // Failed
      UsageTrackerService.incrementFailed(account.id);

      EmailLogModel.create({
        queue_id: item.id,
        account_id: account.id,
        to_address: item.to_address,
        subject: item.subject,
        status: 'failed',
        error_message: result.error,
      });

      // Check if we should retry
      if (item.attempts < item.max_attempts - 1) {
        // Will retry - set back to pending
        EmailQueueModel.updateStatus(item.id, 'pending', result.error, account.id);
        logger.warn(`Email failed (will retry): queue_id=${item.id}, attempt=${item.attempts + 1}/${item.max_attempts}`);
      } else {
        // Max attempts reached
        EmailQueueModel.updateStatus(item.id, 'failed', result.error, account.id);
        logger.error(`Email permanently failed: queue_id=${item.id}, to=${item.to_address}, error=${result.error}`);
      }
    }

    return result;
  }
}
