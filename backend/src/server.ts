import { app } from './app.js';
import { ENV } from './config/env.config.js';
import { prisma } from './config/prisma.js';
import { CronService } from './services/cron.service.js';

const PORT = ENV.PORT;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Randevu Paneli Backend Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${ENV.NODE_ENV}`);
  console.log(`🔌 Webhook compatibility: /webhook/*`);
  console.log(`🔌 REST API v1: /api/v1/*`);
  console.log(`===============================================`);

  // Start appointment sweep cron (15 minutes)
  CronService.start(15);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  CronService.stop();
  server.close(async () => {
    console.log('HTTP server closed.');
    await prisma.$disconnect();
    console.log('Prisma disconnected. Exiting.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
