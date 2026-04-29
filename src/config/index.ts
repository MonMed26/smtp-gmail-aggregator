import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

function getOrGenerate(envKey: string, generator: () => string): string {
  const value = process.env[envKey];
  if (value && value.trim().length > 0) return value.trim();
  const generated = generator();
  console.warn(`[Config] ${envKey} not set in .env, using auto-generated value. Set it in .env for persistence.`);
  return generated;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  db: {
    path: process.env.DB_PATH || path.join(process.cwd(), 'data', 'aggregator.db'),
  },

  encryption: {
    key: getOrGenerate('ENCRYPTION_KEY', () => crypto.randomBytes(32).toString('hex')),
  },

  api: {
    key: getOrGenerate('API_KEY', () => crypto.randomBytes(32).toString('hex')),
  },

  dashboard: {
    user: process.env.DASHBOARD_USER || 'admin',
    pass: getOrGenerate('DASHBOARD_PASS', () => crypto.randomBytes(16).toString('hex')),
  },

  session: {
    secret: getOrGenerate('SESSION_SECRET', () => crypto.randomBytes(32).toString('hex')),
  },

  queue: {
    pollInterval: parseInt(process.env.QUEUE_POLL_INTERVAL || '5000', 10),
    batchSize: parseInt(process.env.QUEUE_BATCH_SIZE || '10', 10),
  },

  defaultStrategy: (process.env.DEFAULT_STRATEGY || 'round-robin') as 'round-robin' | 'least-used' | 'random',

  smtp: {
    timeout: parseInt(process.env.SMTP_TIMEOUT || '10000', 10),
    poolSize: parseInt(process.env.SMTP_POOL_SIZE || '5', 10),
  },

  smtpServer: {
    enabled: (process.env.SMTP_SERVER_ENABLED || 'true') === 'true',
    port: parseInt(process.env.SMTP_SERVER_PORT || '587', 10),
    username: process.env.SMTP_SERVER_USER || 'aggregator',
    password: getOrGenerate('SMTP_SERVER_PASS', () => crypto.randomBytes(16).toString('hex')),
    mode: (process.env.SMTP_SERVER_MODE || 'direct') as 'direct' | 'queue',
  },
};
