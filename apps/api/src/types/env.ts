import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  // massive.com (optional until you sign up for a paid plan)
  MASSIVE_API_KEY: z.string().default(''),
  MASSIVE_WS_URL: z.string().default('wss://socket.massive.com'),

  // FMP
  FMP_API_KEY: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Unkey — API key management
  UNKEY_ROOT_KEY: z.string().min(1),

  // Redis (Upstash or self-hosted)
  REDIS_URL: z.string().url(),

  // Optional: Supabase (for user/portal data)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()
