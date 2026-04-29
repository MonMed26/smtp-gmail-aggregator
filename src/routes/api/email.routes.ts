import { Router, Request, Response } from 'express';
import { EmailQueueModel } from '../../models/email-queue.model';
import { EmailQueueCreateInput, StrategyType } from '../../types';
import { sendRateLimiter } from '../../middleware/rate-limit.middleware';
import { logger } from '../../utils/logger';

const router = Router();

// POST /api/send - Queue a single email
router.post('/send', sendRateLimiter, (req: Request, res: Response) => {
  try {
    const { to, fromName, fromAddress, cc, bcc, subject, html, text, replyTo, strategy, priority, scheduledAt } = req.body;

    // Validation
    if (!to || !subject) {
      res.status(400).json({ success: false, error: 'to and subject are required' });
      return;
    }

    if (!html && !text) {
      res.status(400).json({ success: false, error: 'Either html or text body is required' });
      return;
    }

    // Validate strategy if provided
    const validStrategies: StrategyType[] = ['round-robin', 'least-used', 'random'];
    if (strategy && !validStrategies.includes(strategy)) {
      res.status(400).json({ success: false, error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}` });
      return;
    }

    const input: EmailQueueCreateInput = {
      to,
      fromName,
      fromAddress,
      cc,
      bcc,
      subject,
      html,
      text,
      replyTo,
      strategy,
      priority,
      scheduledAt,
    };

    const item = EmailQueueModel.enqueue(input);

    res.status(201).json({
      success: true,
      data: {
        id: item.id,
        status: item.status,
        message: 'Email queued for sending',
      },
    });
  } catch (error: any) {
    logger.error(`Queue email error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/send/bulk - Queue multiple emails
router.post('/send/bulk', sendRateLimiter, (req: Request, res: Response) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ success: false, error: 'emails array is required and must not be empty' });
      return;
    }

    if (emails.length > 100) {
      res.status(400).json({ success: false, error: 'Maximum 100 emails per bulk request' });
      return;
    }

    // Validate each email
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      if (!email.to || !email.subject) {
        res.status(400).json({ success: false, error: `Email at index ${i}: to and subject are required` });
        return;
      }
      if (!email.html && !email.text) {
        res.status(400).json({ success: false, error: `Email at index ${i}: Either html or text body is required` });
        return;
      }
    }

    const items = EmailQueueModel.enqueueBulk(emails);

    res.status(201).json({
      success: true,
      data: {
        queued: items.length,
        ids: items.map(i => i.id),
        message: `${items.length} emails queued for sending`,
      },
    });
  } catch (error: any) {
    logger.error(`Bulk queue error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/queue - List queue items
router.get('/queue', (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '');
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 20;

    const result = EmailQueueModel.findAll({
      status: status || undefined as any,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result.items,
      pagination: {
        total: result.total,
        page,
        limit,
        pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/queue/:id - Get queue item
router.get('/queue/:id', (req: Request, res: Response) => {
  try {
    const item = EmailQueueModel.findById(parseInt(String(req.params.id)));
    if (!item) {
      res.status(404).json({ success: false, error: 'Queue item not found' });
      return;
    }
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/queue/:id - Cancel a queued email
router.delete('/queue/:id', (req: Request, res: Response) => {
  try {
    const cancelled = EmailQueueModel.cancel(parseInt(String(req.params.id)));
    if (!cancelled) {
      res.status(404).json({ success: false, error: 'Queue item not found or cannot be cancelled' });
      return;
    }
    res.json({ success: true, message: 'Email cancelled' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/queue/:id/retry - Retry a failed email
router.post('/queue/:id/retry', (req: Request, res: Response) => {
  try {
    const retried = EmailQueueModel.retry(parseInt(String(req.params.id)));
    if (!retried) {
      res.status(404).json({ success: false, error: 'Queue item not found or not in failed status' });
      return;
    }
    res.json({ success: true, message: 'Email queued for retry' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
