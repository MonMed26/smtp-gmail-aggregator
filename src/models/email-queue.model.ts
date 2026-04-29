import { getDatabase } from '../database/connection';
import { EmailQueueItem, EmailQueueCreateInput, EmailStatus } from '../types';
import { config } from '../config';

export class EmailQueueModel {
  static enqueue(input: EmailQueueCreateInput): EmailQueueItem {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO email_queue (from_name, from_address, to_address, cc, bcc, subject, body_html, body_text, reply_to, attachments, strategy, priority, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.fromName || null,
      input.fromAddress || null,
      input.to,
      input.cc || null,
      input.bcc || null,
      input.subject,
      input.html || null,
      input.text || null,
      input.replyTo || null,
      input.attachments ? JSON.stringify(input.attachments) : null,
      input.strategy || config.defaultStrategy,
      input.priority || 0,
      input.scheduledAt || null
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  static enqueueBulk(items: EmailQueueCreateInput[]): EmailQueueItem[] {
    const db = getDatabase();
    const results: EmailQueueItem[] = [];

    const insertMany = db.transaction((items: EmailQueueCreateInput[]) => {
      for (const input of items) {
        const item = this.enqueue(input);
        results.push(item);
      }
    });

    insertMany(items);
    return results;
  }

  static findById(id: number): EmailQueueItem | undefined {
    const db = getDatabase();
    return db.prepare('SELECT * FROM email_queue WHERE id = ?').get(id) as EmailQueueItem | undefined;
  }

  static findPending(limit: number = 10): EmailQueueItem[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM email_queue 
      WHERE status = 'pending' 
        AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
      ORDER BY priority DESC, created_at ASC 
      LIMIT ?
    `).all(limit) as EmailQueueItem[];
  }

  static updateStatus(id: number, status: EmailStatus, errorMessage?: string, accountId?: number): void {
    const db = getDatabase();

    if (status === 'processing') {
      db.prepare(`
        UPDATE email_queue 
        SET status = ?, account_id = ?, attempts = attempts + 1
        WHERE id = ?
      `).run(status, accountId || null, id);
    } else if (status === 'sent' || status === 'failed') {
      db.prepare(`
        UPDATE email_queue 
        SET status = ?, error_message = ?, processed_at = datetime('now'), account_id = COALESCE(?, account_id)
        WHERE id = ?
      `).run(status, errorMessage || null, accountId || null, id);
    } else {
      db.prepare(`
        UPDATE email_queue SET status = ?, error_message = ? WHERE id = ?
      `).run(status, errorMessage || null, id);
    }
  }

  static cancel(id: number): boolean {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE email_queue SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'failed')
    `).run(id);
    return result.changes > 0;
  }

  static retry(id: number): boolean {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE email_queue SET status = 'pending', error_message = NULL, attempts = 0 WHERE id = ? AND status = 'failed'
    `).run(id);
    return result.changes > 0;
  }

  static findAll(options: {
    status?: EmailStatus;
    page?: number;
    limit?: number;
  } = {}): { items: EmailQueueItem[]; total: number } {
    const db = getDatabase();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params: any[] = [];

    if (options.status) {
      whereClause = 'WHERE status = ?';
      params.push(options.status);
    }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM email_queue ${whereClause}`).get(...params) as any).count;

    const items = db.prepare(`
      SELECT * FROM email_queue ${whereClause}
      ORDER BY 
        CASE status 
          WHEN 'processing' THEN 0 
          WHEN 'pending' THEN 1 
          WHEN 'failed' THEN 2 
          WHEN 'sent' THEN 3 
          WHEN 'cancelled' THEN 4 
        END,
        priority DESC, created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as EmailQueueItem[];

    return { items, total };
  }

  static getStatusCounts(): Record<string, number> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM email_queue GROUP BY status
    `).all() as { status: string; count: number }[];

    const counts: Record<string, number> = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  static resetStaleProcessing(timeoutMinutes: number = 5): number {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE email_queue 
      SET status = 'pending', error_message = 'Reset: processing timeout'
      WHERE status = 'processing' 
        AND created_at < datetime('now', ? || ' minutes')
    `).run(`-${timeoutMinutes}`);
    return result.changes;
  }
}
