import { z } from 'zod';

const runtimeEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_PREVIEW: z.string().url().optional(),
  DATABASE_URL_DEV: z.string().url().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).optional().default('products'),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_MODE: z.enum(['test', 'live']).optional(),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  STRIPE_PAYMENTS_ENABLED: z.enum(['true', 'false']).optional(),

  APP_ORIGIN: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  SHOP_BASE_URL: z.string().url().optional(),
  MONO_MERCHANT_TOKEN: z.string().min(1).optional(),
  MONO_WEBHOOK_MODE: z
    .enum(['apply', 'store', 'drop'])
    .optional()
    .default('apply'),
  MONO_REFUND_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  MONO_INVOICE_VALIDITY_SECONDS: z.string().optional().default('86400'),
  MONO_TIME_SKEW_TOLERANCE_SEC: z.string().optional().default('300'),
  MONO_PUBLIC_KEY: z.string().min(1).optional(),
  MONO_API_BASE: z.string().url().optional(),
  MONO_INVOICE_TIMEOUT_MS: z.string().optional(),
  SHOP_STATUS_TOKEN_SECRET: z.string().min(32).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_ENABLE_ADMIN: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

let _serverEnv: ServerEnv | null = null;
let _clientEnv: ClientEnv | null = null;
let _runtimeEnv: RuntimeEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  _serverEnv = serverEnvSchema.parse(process.env);
  return _serverEnv;
}

export function getClientEnv(): ClientEnv {
  if (_clientEnv) return _clientEnv;
  _clientEnv = clientEnvSchema.parse(process.env);
  return _clientEnv;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (_runtimeEnv) return _runtimeEnv;
  _runtimeEnv = runtimeEnvSchema.parse(process.env);
  return _runtimeEnv;
}

export function resetEnvCache() {
  _serverEnv = null;
  _clientEnv = null;
  _runtimeEnv = null;
}
