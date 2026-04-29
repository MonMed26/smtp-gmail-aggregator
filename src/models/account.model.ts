import { getDatabase } from '../database/connection';
import { encrypt, decrypt } from '../services/encryption.service';
import { Account, AccountCreateInput, AccountUpdateInput, AccountWithUsage } from '../types';

export class AccountModel {
  static findAll(): Account[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as Account[];
  }

  static findById(id: number): Account | undefined {
    const db = getDatabase();
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
  }

  static findByEmail(email: string): Account | undefined {
    const db = getDatabase();
    return db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) as Account | undefined;
  }

  static findActive(): Account[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY last_used_at ASC').all() as Account[];
  }

  static create(input: AccountCreateInput): Account {
    const db = getDatabase();
    const encryptedPassword = encrypt(input.app_password);

    const stmt = db.prepare(`
      INSERT INTO accounts (email, app_password_encrypted, display_name, daily_limit)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.email,
      encryptedPassword,
      input.display_name || null,
      input.daily_limit || 500
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  static update(id: number, input: AccountUpdateInput): Account | undefined {
    const db = getDatabase();
    const account = this.findById(id);
    if (!account) return undefined;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.email !== undefined) {
      updates.push('email = ?');
      values.push(input.email);
    }
    if (input.app_password !== undefined) {
      updates.push('app_password_encrypted = ?');
      values.push(encrypt(input.app_password));
    }
    if (input.display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(input.display_name);
    }
    if (input.daily_limit !== undefined) {
      updates.push('daily_limit = ?');
      values.push(input.daily_limit);
    }
    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) return account;

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  }

  static delete(id: number): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static updateLastUsed(id: number): void {
    const db = getDatabase();
    db.prepare("UPDATE accounts SET last_used_at = datetime('now') WHERE id = ?").run(id);
  }

  static getDecryptedPassword(account: Account): string {
    return decrypt(account.app_password_encrypted);
  }

  static getActiveWithUsage(): AccountWithUsage[] {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT 
        a.*,
        COALESCE(du.sent_count, 0) as today_sent,
        COALESCE(du.failed_count, 0) as today_failed,
        (a.daily_limit - COALESCE(du.sent_count, 0)) as remaining
      FROM accounts a
      LEFT JOIN daily_usage du ON a.id = du.account_id AND du.date = ?
      WHERE a.is_active = 1
      ORDER BY a.last_used_at ASC
    `).all(today) as AccountWithUsage[];

    return rows.filter(r => r.remaining > 0);
  }

  static getAllWithUsage(): AccountWithUsage[] {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    return db.prepare(`
      SELECT 
        a.*,
        COALESCE(du.sent_count, 0) as today_sent,
        COALESCE(du.failed_count, 0) as today_failed,
        (a.daily_limit - COALESCE(du.sent_count, 0)) as remaining
      FROM accounts a
      LEFT JOIN daily_usage du ON a.id = du.account_id AND du.date = ?
      ORDER BY a.created_at DESC
    `).all(today) as AccountWithUsage[];
  }

  static count(): { total: number; active: number } {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as count FROM accounts').get() as any).count;
    const active = (db.prepare('SELECT COUNT(*) as count FROM accounts WHERE is_active = 1').get() as any).count;
    return { total, active };
  }
}
