import app from './app';
import { config } from './config';
import { runMigrations } from './database/migrations';
import { closeDatabase } from './database/connection';
import { queueWorker } from './services/queue-worker.service';
import { smtpPool } from './services/smtp-pool.service';
import { smtpServer } from './services/smtp-server.service';
import { logger } from './utils/logger';

// Initialize database
runMigrations();

// Start queue worker
queueWorker.start();

// Start SMTP server (relay)
if (config.smtpServer.enabled) {
  smtpServer.start();
}

// Start HTTP server
const server = app.listen(config.port, () => {
  logger.info(`===========================================`);
  logger.info(`  SMTP Gmail Aggregator`);
  logger.info(`  Environment: ${config.nodeEnv}`);
  logger.info(`-------------------------------------------`);
  logger.info(`  HTTP Dashboard: http://localhost:${config.port}`);
  logger.info(`  REST API:       http://localhost:${config.port}/api`);
  if (config.smtpServer.enabled) {
    logger.info(`  SMTP Server:    smtp://localhost:${config.smtpServer.port}`);
    logger.info(`  SMTP Mode:      ${config.smtpServer.mode}`);
  }
  logger.info(`===========================================`);

  if (config.isDev) {
    logger.info(`  Dashboard credentials:`);
    logger.info(`    User: ${config.dashboard.user}`);
    logger.info(`    Pass: ${config.dashboard.pass}`);
    logger.info(`  API Key: ${config.api.key}`);
    if (config.smtpServer.enabled) {
      logger.info(`  SMTP Auth:`);
      logger.info(`    User: ${config.smtpServer.username}`);
      logger.info(`    Pass: ${config.smtpServer.password}`);
    }
    logger.info(`===========================================`);
  }
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`);

  queueWorker.stop();
  smtpServer.stop();
  smtpPool.closeAll();

  server.close(() => {
    closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
