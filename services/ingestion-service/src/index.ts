import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const SERVICE_NAME = 'ingestion-service'
const DEFAULT_PORT = 3001

const app = new Hono()

app.get('/health', (c) =>
  c.json({ ok: true, service: SERVICE_NAME, timestamp: new Date().toISOString() })
)

app.get('/', (c) =>
  c.json({
    service: SERVICE_NAME,
    status: 'stub',
    intent: 'Video ingestion via yt-dlp + ffmpeg. See Video Pipeline Plan.',
  })
)

const port = Number(process.env.PORT ?? DEFAULT_PORT)
serve({ fetch: app.fetch, port }, ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on http://localhost:${port}`)
})
