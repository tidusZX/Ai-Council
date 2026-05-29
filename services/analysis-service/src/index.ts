// Load .env.local before any other import that reads process.env.
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local', quiet: true, override: true })

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { z } from 'zod'
import { loadEnv } from './env'
import { runAnalysis } from './pipeline'
import { diagnoseLead } from './diagnose-lead'

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
      'Claude vision analysis over a transcript + 4 keyframe URLs. Called by ingestion-service.',
  })
)

// Shared-secret auth on /process and /diagnose-lead
const requireApiKey = async (c: import('hono').Context, next: () => Promise<void>) => {
  if (c.req.header('x-api-key') !== env.ANALYSIS_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}
app.use('/process', requireApiKey)
app.use('/diagnose-lead', requireApiKey)

const ProcessBodySchema = z.object({
  job_id: z.uuid(),
  transcript: z.string(),
  keyframe_urls: z.array(z.url()).min(1),
  // Optional: set when triggered via /api/inspiration (Telegram bot flow).
  // Pipeline writes analysis + summary back to inspiration_log when done.
  inspiration_log_id: z.uuid().optional(),
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

const DiagnoseLeadBodySchema = z.object({
  business_name: z.string().min(1),
  business_type: z.string().optional(),
  image_urls: z.array(z.url()).min(1).max(12),
})

app.post('/diagnose-lead', async (c) => {
  const parsed = DiagnoseLeadBodySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid body', details: z.treeifyError(parsed.error) }, 400)
  }

  try {
    const diagnosis = await diagnoseLead(parsed.data)
    return c.json({ business_name: parsed.data.business_name, diagnosis })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: 'diagnosis failed', message }, 500)
  }
})

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on http://localhost:${port}`)
})
