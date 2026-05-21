import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const SERVICE_NAME = 'embeddings-service'
const DEFAULT_PORT = 3003

const app = new Hono()

app.get('/health', (c) =>
  c.json({ ok: true, service: SERVICE_NAME, timestamp: new Date().toISOString() })
)

app.get('/', (c) =>
  c.json({
    service: SERVICE_NAME,
    status: 'stub',
    intent: 'CLIP/SigLIP and text embeddings worker. See Embeddings Worker Plan.',
  })
)

const port = Number(process.env.PORT ?? DEFAULT_PORT)
serve({ fetch: app.fetch, port }, ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on http://localhost:${port}`)
})
