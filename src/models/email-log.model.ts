import { getDatabase } from '../database/connection';
import { EmailLog, DailyStats } from '../types';

export class EmailLogModel {
  static create(data: {
    queue_id?: number;
    account_id: number;
    to_address: string;
    subject: string;
    status: 'sent' | 'failed';
    message_id?: string;
    error_message?: string;
  }): EmailLog {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO email_logs (queue_id, account_id, to_address, subject, status, message_id, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.queue_id || null,
      data.account_id,
      data.to_address,
      data.subject,
      data.status,
      data.message_id || null,
      data.error_message || null
    );

    return db.prepare('SELECT * FROM email_logs WHERE id = ?').get(result.lastInsertRowid) as EmailLog;
  }

  static findAll(options: {
    page?: number;
    limit?: number;
    status?: 'sent' | 'failed';
    accountId?: number;
    search?: string;
  } = {}): { items: (EmailLog & { account_email?: string })[]; total: number } {
    const db = getDatabase();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.status) {
      conditions.push('el.status = ?');
      params.push(options.status);
    }
    if (options.accountId) {
      conditions.push('el.account_id = ?');
      params.push(options.accountId);
    }
    if (options.search) {
      conditions.push('(el.to_address LIKE ? OR el.subject LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (db.prepare(`
      SELECT COUNT(*) as count FROM email_logs el ${whereClause}
    `).get(...params) as any).count;

    const items = db.prepare(`
      SELECT el.*, a.email as account_email
      FROM email_logs el
      LEFT JOIN accounts a ON el.account_id = a.id
      ${whereClause}
      ORDER BY el.sent_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as (EmailLog & { account_email?: string })[];

    return { items, total };
  }

  static getTodayStats(): { sent: number; failed: number } {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const row = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) as sent,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
      FROM email_logs 
      WHERE date(sent_at) = ?
    `).get(today) as { sent: number; failed: number };

    return row;
  }

  static getDailyStats(days: number = 30): DailyStats[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT 
        date(sent_at) as date,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as total_sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed
      FROM email_logs 
      WHERE sent_at >= datetime('now', ? || ' days')
      GROUP BY date(sent_at)
      ORDER BY date DESC
    `).all(`-${days}`) as DailyStats[];
  }

  static getAccountStats(accountId: number): { sent: number; failed: number } {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const row = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) as sent,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
      FROM email_logs 
      WHERE account_id = ? AND date(sent_at) = ?
    `).get(accountId, today) as { sent: number; failed: number };

    return row;
  }
}
