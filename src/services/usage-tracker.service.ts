import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';

export class UsageTrackerService {
  static incrementSent(accountId: number): void {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO daily_usage (account_id, date, sent_count, failed_count)
      VALUES (?, ?, 1, 0)
      ON CONFLICT(account_id, date) 
      DO UPDATE SET sent_count = sent_count + 1
    `).run(accountId, today);
  }

  static incrementFailed(accountId: number): void {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO daily_usage (account_id, date, sent_count, failed_count)
      VALUES (?, ?, 0, 1)
      ON CONFLICT(account_id, date) 
      DO UPDATE SET failed_count = failed_count + 1
    `).run(accountId, today);
  }

  static getUsageToday(accountId: number): { sent: number; failed: number } {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const row = db.prepare(`
      SELECT sent_count as sent, failed_count as failed 
      FROM daily_usage 
      WHERE account_id = ? AND date = ?
    `).get(accountId, today) as { sent: number; failed: number } | undefined;

    return row || { sent: 0, failed: 0 };
  }

  static getRemainingToday(accountId: number, dailyLimit: number): number {
    const usage = this.getUsageToday(accountId);
    return Math.max(0, dailyLimit - usage.sent);
  }

  static getTotalSentToday(): number {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const row = db.prepare(`
      SELECT COALESCE(SUM(sent_count), 0) as total 
      FROM daily_usage 
      WHERE date = ?
    `).get(today) as { total: number };

    return row.total;
  }

  static getTotalRemainingToday(): number {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const row = db.prepare(`
      SELECT COALESCE(SUM(a.daily_limit - COALESCE(du.sent_count, 0)), 0) as total
      FROM accounts a
      LEFT JOIN daily_usage du ON a.id = du.account_id AND du.date = ?
      WHERE a.is_active = 1
    `).get(today) as { total: number };

    return row.total;
  }
}
