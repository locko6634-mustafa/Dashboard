import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ENV } from './config/env.config.js';
import webhookRoutes from './routes/webhook.routes.js';
import v1Routes from './routes/v1.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Security & Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'randevu-paneli-backend', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'randevu-paneli-backend', timestamp: new Date().toISOString() });
});

// Primary Routes
app.use('/webhook', webhookRoutes);
app.use('/api/v1', v1Routes);
app.use('/api', v1Routes);

// Prefixed aliases for Traefik subpath routing
app.use('/randevu-api/webhook', webhookRoutes);
app.use('/randevu-api/api/v1', v1Routes);
app.use('/randevu-api/api', v1Routes);
app.use('/randevu-api', v1Routes);
app.use('/randevu/webhook', webhookRoutes);
app.use('/randevu/api/v1', v1Routes);
app.use('/randevu/api', v1Routes);

// Static frontend file serving if configured or located at root
const frontendCandidates = [
  ENV.STATIC_FILES_PATH,
  path.resolve(__dirname, '../../'), // Workspace root when running from backend/dist/src
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../public'),
  '/app/public',
  '/app',
].filter(Boolean) as string[];

for (const dir of frontendCandidates) {
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
    app.use(express.static(dir));
    app.use('/randevu', express.static(dir));
    break;
  }
}

// Error handling
app.use(errorHandler);
