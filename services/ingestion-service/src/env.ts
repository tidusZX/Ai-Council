import { z } from 'zod'

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INGESTION_TMP_DIR: z.string().default('/tmp/shaq-os/ingestion'),
  ANALYSIS_SERVICE_URL: z.url().default('http://localhost:3002'),
  INGESTION_API_KEY: z.string().min(16, 'INGESTION_API_KEY must be at least 16 chars'),
  ANALYSIS_API_KEY: z.string().min(16, 'ANALYSIS_API_KEY must be at least 16 chars'),
  OPENAI_API_KEY: z.string().min(1),
  KEYFRAME_BUCKET: z.string().default('video-keyframes'),
  PORT: z.coerce.number().default(3001),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export function loadEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[ingestion-service] invalid env:', z.treeifyError(parsed.error))
    throw new Error('Invalid env — see logs')
  }
  cached = parsed.data
  return cached
}
