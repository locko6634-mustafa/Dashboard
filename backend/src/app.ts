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

// Trust reverse proxy (Traefik / Nginx) for accurate client IP in rate limiters
app.set('trust proxy', 1);

// Security & HTTP Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'sameorigin' },
  })
);

// CORS configuration (supports wildcard or comma-separated domain whitelist)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const allowed = ENV.CORS_ORIGIN;
      if (!allowed || allowed === '*') {
        return callback(null, true);
      }

      const allowedOrigins = allowed.split(',').map((o) => o.trim());
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS ilkesi bu kaynağa erişimi engelledi.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Security shield for static file requests:
// Block access to dotfiles, backend files, source files, env files, config files, git, and scripts.
const BLOCKED_STATIC_PATTERNS = [
  /^\/\.git(\/|$)/i,
  /^\/\.github(\/|$)/i,
  /^\/\.agents(\/|$)/i,
  /^\/backend(\/|$)/i,
  /^\/node_modules(\/|$)/i,
  /^\/prisma(\/|$)/i,
  /^\/src(\/|$)/i,
  /^\/dist(\/|$)/i,
  /\.env(\..+)?$/i,
  /\.(ya?ml|json|md|ts|sh|ps1|sql|lock|map)$/i,
  /dockerfile/i,
  /docker-compose/i,
];

const staticSecurityShield = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const reqPath = decodeURI(req.path);
    const isBlocked = BLOCKED_STATIC_PATTERNS.some((pattern) => pattern.test(reqPath));
    if (isBlocked) {
      res.status(404).send('Not Found');
      return;
    }
  } catch {
    res.status(400).send('Bad Request');
    return;
  }
  next();
};

app.use(staticSecurityShield);

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
    app.use(express.static(dir, { dotfiles: 'deny', index: ['index.html'] }));
    app.use('/randevu', express.static(dir, { dotfiles: 'deny', index: ['index.html'] }));
    break;
  }
}

// Error handling
app.use(errorHandler);
