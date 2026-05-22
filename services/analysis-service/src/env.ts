import { z } from 'zod'

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANALYSIS_API_KEY: z.string().min(16, 'ANALYSIS_API_KEY must be at least 16 chars'),
  ANALYSIS_MODEL: z.string().default('claude-sonnet-4-5'),
  PORT: z.coerce.number().default(3002),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export function loadEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[analysis-service] invalid env:', z.treeifyError(parsed.error))
    throw new Error('Invalid env — see logs')
  }
  cached = parsed.data
  return cached
}
