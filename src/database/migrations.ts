import { getDatabase } from './connection';
import { logger } from '../utils/logger';

export function runMigrations(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      app_password_encrypted TEXT NOT NULL,
      display_name TEXT,
      daily_limit INTEGER DEFAULT 500,
      is_active INTEGER DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_address TEXT NOT NULL,
      cc TEXT,
      bcc TEXT,
      subject TEXT NOT NULL,
      body_html TEXT,
      body_text TEXT,
      reply_to TEXT,
      attachments TEXT,
      status TEXT DEFAULT 'pending',
      account_id INTEGER,
      strategy TEXT DEFAULT 'round-robin',
      priority INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      error_message TEXT,
      scheduled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER,
      account_id INTEGER NOT NULL,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      message_id TEXT,
      error_message TEXT,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (queue_id) REFERENCES email_queue(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      UNIQUE(account_id, date),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
    CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_email_logs_account ON email_logs(account_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
    CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(account_id, date);
  `);

  logger.info('Database migrations completed');
}
