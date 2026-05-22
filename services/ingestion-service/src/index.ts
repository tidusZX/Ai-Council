// Load .env.local before anything reads process.env. Production deployments
// inject env vars via the platform (Zo / Docker) and the file is absent —
// dotenv silently no-ops in that case.
// `override: true` so service-local values win over shell-exported vars
// (e.g. a globally-exported empty ANTHROPIC_API_KEY would otherwise persist).
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local', quiet: true, override: true })

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { z } from 'zod'
import { loadEnv } from './env'
import { createJob, reapStuckJobs } from './db'
import { runPipeline, inferPlatform } from './pipeline'

const SERVICE_NAME = 'ingestion-service'

const env = loadEnv()

const app = new Hono()

app.get('/health', (c) =>
  c.json({ ok: true, service: SERVICE_NAME, timestamp: new Date().toISOString() })
)

app.get('/', (c) =>
  c.json({
    service: SERVICE_NAME,
    status: 'live',
    intent: 'Video ingestion via yt-dlp + ffmpeg. Posts to analysis-service when done.',
  })
)

// Require shared-secret header on every mutating route.
app.use('/jobs/*', async (c, next) => {
  if (c.req.header('x-api-key') !== env.INGESTION_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})
app.use('/jobs', async (c, next) => {
  if (c.req.header('x-api-key') !== env.INGESTION_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})

const JobsBodySchema = z.object({
  url: z.url(),
  owner_id: z.uuid(),
})

app.post('/jobs', async (c) => {
  const parsed = JobsBodySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid body', details: z.treeifyError(parsed.error) }, 400)
  }

  const { url, owner_id } = parsed.data
  const platform = inferPlatform(url)

  let jobId: string
  try {
    jobId = await createJob({ owner_id, source_url: url, source_platform: platform })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: 'failed to create job', message }, 500)
  }

  // Fire and forget — pipeline updates the row as it progresses. The
  // dashboard subscribes to row changes via Supabase realtime.
  void runPipeline({ job_id: jobId, url, owner_id })

  return c.json({ job_id: jobId, status: 'queued' }, 202)
})

serve({ fetch: app.fetch, port: env.PORT }, async ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on http://localhost:${port}`)
  const reaped = await reapStuckJobs()
  if (reaped > 0) {
    // eslint-disable-next-line no-console
    console.log(`[${SERVICE_NAME}] reaped ${reaped} stuck job(s) on boot`)
  }
})
