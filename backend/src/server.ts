import { app } from './app.js';
import { ENV } from './config/env.config.js';
import { prisma } from './config/prisma.js';
import { CronService } from './services/cron.service.js';
import { AdminService } from './services/admin.service.js';

const PORT = ENV.PORT;

const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`===============================================`);
  console.log(`🚀 Randevu Paneli Backend Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${ENV.NODE_ENV}`);
  console.log(`🔌 Webhook compatibility: /webhook/*`);
  console.log(`🔌 REST API v1: /api/v1/*`);
  console.log(`===============================================`);

  // Auto-migrate schema
  try {
    await AdminService.ensureSchema();
  } catch (err) {
    console.error('Failed to ensure database schema on startup:', err);
  }

  // Start appointment sweep cron (15 minutes)
  CronService.start(15);
});

// Graceful shutdown
let isShuttingDown = false;
async function gracefulShutdown(signal: string, initialExitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);
  CronService.stop();

  const forceTimer = setTimeout(() => {
    console.error('Force shutdown after timeout.');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async () => {
    console.log('HTTP server closed.');
    let exitCode = initialExitCode;
    try {
      await prisma.$disconnect();
      console.log('Prisma disconnected. Exiting.');
    } catch (err) {
      exitCode = 1;
      console.error('Error during Prisma disconnect:', err);
    } finally {
      clearTimeout(forceTimer);
      process.exit(exitCode);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
  void gracefulShutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  void gracefulShutdown('uncaughtException', 1);
});
