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

const apiCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
});

const staticCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: ["'self'", 'https://server.n8n-mustafa.me', 'https://randevu.n8n-mustafa.me'],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
  },
});

// Strict CSP for API, webhook, and health endpoints
app.use(['/health', '/api', '/webhook', '/randevu-api', '/randevu/api', '/randevu/webhook'], apiCsp);

export function resolveCorsConfig(corsOrigin: string, nodeEnv: string) {
  const allowedOrigins = corsOrigin
    .trim()
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isWildcardCors = allowedOrigins.length === 0 || allowedOrigins.includes('*');

  if (nodeEnv === 'production' && isWildcardCors) {
    throw new Error('CORS_ORIGIN cannot be "*" or empty in production; explicit origin allowlist is required');
  }

  return { isWildcardCors, allowedOrigins };
}

// CORS configuration (wildcard disables credentials; explicit allowlist enables credentials)
const { isWildcardCors, allowedOrigins } = resolveCorsConfig(ENV.CORS_ORIGIN, ENV.NODE_ENV);

app.use(
  cors(
    isWildcardCors
      ? {
          origin: '*',
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
          credentials: false,
        }
      : {
          origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps, curl, server-to-server)
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
              return callback(null, true);
            }

            return callback(new Error('CORS ilkesi bu kaynağa erişimi engelledi.'));
          },
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
          credentials: true,
        }
  )
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
    const applyStaticCsp: express.RequestHandler = (req, res, next) => {
      if (!res.getHeader('Content-Security-Policy')) {
        return staticCsp(req, res, next);
      }
      next();
    };
    app.use(applyStaticCsp, express.static(dir, { dotfiles: 'deny', index: ['index.html'] }));
    app.use('/randevu', applyStaticCsp, express.static(dir, { dotfiles: 'deny', index: ['index.html'] }));
    break;
  }
}

// Error handling
app.use(errorHandler);
