import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are evaluating a Singapore-based business as a potential client for Shaq, a commercial photographer specializing in food, product, lifestyle, and cinematic work. Shaq targets $2k/month retainer engagements with mid-sized F&B and product brands.

You're given the business name, business type, and 6–12 images from their current Instagram or website. Your job is to produce a structured visual-brand diagnosis using the submit_diagnosis tool.

The goal is NOT "are these photos pretty." The goal is: **would replacing these photos plausibly drive enough business that $2k/mo is a no-brainer for them?**

Be specific. Avoid platitudes. Cite specific images and specific weaknesses. Look for:
- Inconsistent lighting, color grading, or styling across the feed
- Phone-shot images masquerading as branded content
- Weak compositions, distracting backgrounds, poor angles
- Stock photography mixed with real shoots
- Missing categories (no hero shots, no behind-the-scenes, no menu items)
- Cluttered branding, illegible text overlays
- Outdated aesthetic that signals "we don't invest in our brand"

Score each dimension 0–100 where:
- 0–30 = severely weak, large gap, high opportunity for Shaq
- 30–60 = mixed, some good some bad, moderate opportunity
- 60–85 = solid, hard to displace existing photographer
- 85–100 = excellent, not a fit (don't bother pursuing)

The opportunity_score should be HIGH when the brand has clear gaps Shaq can fill profitably, LOW when the brand is either already excellent or so small they can't afford $2k/mo.`

const DIAGNOSIS_TOOL: Anthropic.Tool = {
  name: 'submit_diagnosis',
  description: 'Submit the structured visual-brand diagnosis of the lead.',
  input_schema: {
    type: 'object',
    properties: {
      brand_consistency: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          notes: { type: 'string', description: '1-2 sentences citing specific inconsistencies or strengths.' },
        },
        required: ['score', 'notes'],
      },
      image_quality: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          notes: { type: 'string', description: '1-2 sentences on lighting, focus, resolution, technical quality.' },
        },
        required: ['score', 'notes'],
      },
      styling_composition: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          notes: { type: 'string', description: '1-2 sentences on framing, props, backgrounds, art direction.' },
        },
        required: ['score', 'notes'],
      },
      visual_hierarchy: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          notes: { type: 'string', description: '1-2 sentences on feed flow, focal points, what catches the eye first.' },
        },
        required: ['score', 'notes'],
      },
      opportunity_for_shaq: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          notes: { type: 'string', description: '2-3 sentences: where exactly Shaq could add value, what specific weaknesses he\'d fix first, why this is worth $2k/mo to them.' },
        },
        required: ['score', 'notes'],
      },
      overall_opportunity_score: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Single 0-100 score the lead pipeline sorts by. Weighted toward opportunity_for_shaq.',
      },
      top_gaps: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 specific gaps in their visual brand that Shaq could fix. Concrete, actionable.',
      },
      red_flags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Signals this lead is NOT a fit — already has a great photographer, too small to afford retainer, brand voice misaligned, etc. Empty array if none.',
      },
      outreach_angle: {
        type: 'string',
        description: 'One-sentence angle Shaq could lead with in a DM/email — references a specific observation from their feed.',
      },
    },
    required: [
      'brand_consistency',
      'image_quality',
      'styling_composition',
      'visual_hierarchy',
      'opportunity_for_shaq',
      'overall_opportunity_score',
      'top_gaps',
      'outreach_angle',
    ],
  },
}

let _client: Anthropic | null = null
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function fetchAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`image fetch ${url} returned ${res.status}`)
  }
  const mediaType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return { data: buf.toString('base64'), mediaType }
}

export async function diagnoseLead(args: {
  business_name: string
  business_type?: string
  image_urls: string[]
}): Promise<Record<string, unknown>> {
  if (args.image_urls.length === 0) {
    throw new Error('image_urls must not be empty')
  }
  const sampled = args.image_urls.slice(0, 12)
  const imageBlocks: Anthropic.ImageBlockParam[] = await Promise.all(
    sampled.map(async (url) => {
      const { data, mediaType } = await fetchAsBase64(url)
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (mediaType.includes('png')
            ? 'image/png'
            : mediaType.includes('webp')
              ? 'image/webp'
              : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
          data,
        },
      }
    })
  )

  const model = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-5'

  const response = await client().messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [DIAGNOSIS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_diagnosis' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Business: ${args.business_name}\nType: ${args.business_type || '(not specified — infer from images)'}\n\n${sampled.length} images from their current Instagram/website follow.`,
          },
          ...imageBlocks,
        ],
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(
      `Claude did not return a tool_use block. Stop reason: ${response.stop_reason}. Content types: ${response.content.map((c) => c.type).join(',')}`
    )
  }
  return toolUse.input as Record<string, unknown>
}
