import { z } from "zod"

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default("products"),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_MODE: z.enum(["test", "live"]).optional(),
  PAYMENTS_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
})

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_ENABLE_ADMIN: z.enum(["true", "false"]).optional().default("false"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_PAYMENTS_ENABLED: z.enum(["true", "false"]).optional().default("false"),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type ClientEnv = z.infer<typeof clientEnvSchema>
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>

let _serverEnv: ServerEnv | null = null
let _clientEnv: ClientEnv | null = null
let _runtimeEnv: RuntimeEnv | null = null

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv
  _serverEnv = serverEnvSchema.parse(process.env)
  return _serverEnv
}

export function getClientEnv(): ClientEnv {
  if (_clientEnv) return _clientEnv
  _clientEnv = clientEnvSchema.parse(process.env)
  return _clientEnv
}

export function getRuntimeEnv(): RuntimeEnv {
  if (_runtimeEnv) return _runtimeEnv
  _runtimeEnv = runtimeEnvSchema.parse(process.env)
  return _runtimeEnv
}

export function resetEnvCache() {
  _serverEnv = null
  _clientEnv = null
  _runtimeEnv = null
}
