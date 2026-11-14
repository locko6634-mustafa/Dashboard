import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().optional(),
  STATIC_FILES_PATH: z.string().optional(),
  CORS_ORIGIN: z.string().trim().default('*'),
  CHATBOT_API_KEY: z.string().optional(),
});

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${JSON.stringify(parsed.error.format())}`);
  }

  const data = parsed.data;

  if (data.NODE_ENV === 'production') {
    if (!data.JWT_SECRET || data.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be set and at least 32 characters long in production');
    }
  } else if (data.JWT_SECRET !== undefined && data.JWT_SECRET.length < 8) {
    throw new Error('JWT_SECRET must be at least 8 characters long when provided');
  }

  return {
    ...data,
    JWT_SECRET: data.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  };
}

let envData: ReturnType<typeof validateEnv>;
try {
  envData = validateEnv(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

export const ENV = envData;
