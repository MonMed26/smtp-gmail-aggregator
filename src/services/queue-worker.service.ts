import { EmailQueueModel } from '../models/email-queue.model';
import { EmailService } from './email.service';
import { config } from '../config';
import { logger } from '../utils/logger';

class QueueWorkerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  start(): void {
    if (this.intervalId) {
      logger.warn('Queue worker already running');
      return;
    }

    // Reset any stale processing items on startup
    const reset = EmailQueueModel.resetStaleProcessing(5);
    if (reset > 0) {
      logger.info(`Reset ${reset} stale processing items`);
    }

    this.intervalId = setInterval(() => this.processBatch(), config.queue.pollInterval);
    logger.info(`Queue worker started (poll interval: ${config.queue.pollInterval}ms, batch size: ${config.queue.batchSize})`);

    // Process immediately on start
    this.processBatch();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Queue worker stopped');
    }
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      const items = EmailQueueModel.findPending(config.queue.batchSize);

      if (items.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.debug(`Processing ${items.length} queued emails`);

      for (const item of items) {
        try {
          await EmailService.processQueueItem(item);
        } catch (error: any) {
          logger.error(`Error processing queue item ${item.id}: ${error.message}`);
          EmailQueueModel.updateStatus(item.id, 'failed', error.message);
        }

        // Small delay between sends to avoid rate limiting
        await this.delay(500);
      }
    } catch (error: any) {
      logger.error(`Queue worker batch error: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export const queueWorker = new QueueWorkerService();
