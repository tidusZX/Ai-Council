// Load .env.local before any other import that reads process.env.
// `override: true` because the user's shell may have an empty
// ANTHROPIC_API_KEY exported from .zshrc that would otherwise win.
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local', quiet: true, override: true })

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { z } from 'zod'
import { loadEnv } from './env'
import { runAnalysis } from './pipeline'

const SERVICE_NAME = 'analysis-service'

const env = loadEnv()

const app = new Hono()

app.get('/health', (c) =>
  c.json({ ok: true, service: SERVICE_NAME, timestamp: new Date().toISOString() })
)

app.get('/', (c) =>
  c.json({
    service: SERVICE_NAME,
    status: 'live',
    intent:
      'Whisper transcription + Claude vision analysis. Called by ingestion-service.',
  })
)

const ProcessBodySchema = z.object({
  job_id: z.uuid(),
  video_path: z.string().min(1),
  keyframe_paths: z.array(z.string()).min(1),
})

app.post('/process', async (c) => {
  const parsed = ProcessBodySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid body', details: z.treeifyError(parsed.error) }, 400)
  }

  try {
    await runAnalysis(parsed.data)
    return c.json({ job_id: parsed.data.job_id, status: 'complete' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: 'analysis failed', message }, 500)
  }
})

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on http://localhost:${port}`)
})
