// ============================================================
// Types & Interfaces for SMTP Gmail Aggregator
// ============================================================

export interface Account {
  id: number;
  email: string;
  app_password_encrypted: string;
  display_name: string | null;
  daily_limit: number;
  is_active: number; // 1 = active, 0 = disabled
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountCreateInput {
  email: string;
  app_password: string;
  display_name?: string;
  daily_limit?: number;
}

export interface AccountUpdateInput {
  email?: string;
  app_password?: string;
  display_name?: string;
  daily_limit?: number;
  is_active?: boolean;
}

export interface EmailQueueItem {
  id: number;
  to_address: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  reply_to: string | null;
  attachments: string | null;
  status: EmailStatus;
  account_id: number | null;
  strategy: StrategyType;
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  scheduled_at: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface EmailQueueCreateInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: string[];
  strategy?: StrategyType;
  priority?: number;
  scheduledAt?: string;
}

export interface EmailLog {
  id: number;
  queue_id: number | null;
  account_id: number;
  to_address: string;
  subject: string;
  status: 'sent' | 'failed';
  message_id: string | null;
  error_message: string | null;
  sent_at: string;
}

export interface DailyUsage {
  id: number;
  account_id: number;
  date: string;
  sent_count: number;
  failed_count: number;
}

export type EmailStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
export type StrategyType = 'round-robin' | 'least-used' | 'random';

export interface LoadBalancerStrategy {
  name: StrategyType;
  selectAccount(accounts: AccountWithUsage[]): Account | null;
}

export interface AccountWithUsage extends Account {
  today_sent: number;
  today_failed: number;
  remaining: number;
}

export interface SendEmailOptions {
  from: {
    name: string;
    address: string;
  };
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  accountId: number;
  accountEmail: string;
}

export interface StatsOverview {
  total_accounts: number;
  active_accounts: number;
  total_sent_today: number;
  total_failed_today: number;
  total_remaining_today: number;
  queue_pending: number;
  queue_processing: number;
  success_rate: number;
}

export interface AccountStats {
  account_id: number;
  email: string;
  display_name: string | null;
  daily_limit: number;
  sent_today: number;
  failed_today: number;
  remaining_today: number;
  is_active: boolean;
}

export interface DailyStats {
  date: string;
  total_sent: number;
  total_failed: number;
}

// Express session augmentation
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
  }
}
