import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a world-class viral content analyst. You study TikTok, Instagram Reels, and YouTube Shorts to understand what makes them spread.

You're given a video's full transcript plus 4 keyframes sampled evenly across its duration. Your job is to produce a structured analysis of why the video works (or doesn't), using the submit_analysis tool.

Be specific. Avoid generic content-marketing platitudes. Cite specific moments, words, and visual choices. The goal is for a creator to read your analysis and immediately understand what to replicate (or deliberately avoid) in their own content.

Focus on:
- The hook: specifically what makes a viewer NOT scroll past in the first 1-3 seconds
- Pacing: where energy peaks and dips, density of cuts
- Visual storytelling: how the 4 keyframes show progression
- Hypothesized virality drivers — these should be falsifiable hypotheses, not platitudes

For shot_list, work from the 4 keyframes provided plus what the transcript implies about transitions. Estimate shot count based on apparent pace.`

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'submit_analysis',
  description: 'Submit the structured analysis of the video. Required output format.',
  input_schema: {
    type: 'object',
    properties: {
      hook: {
        type: 'string',
        description:
          'Specific description of the first 3 seconds — what is shown, said, or implied — and why it grabs attention. 1-2 sentences.',
      },
      structure: {
        type: 'string',
        description:
          'Act breakdown / narrative arc. E.g. "Setup (0-3s) → tension (3-8s) → payoff (8-15s)". 2-3 sentences.',
      },
      pacing: {
        type: 'string',
        description:
          'Cuts per second range, energy curve over time. Where pace peaks, where it slows for emphasis. 2-3 sentences.',
      },
      shot_list: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            shot_n: { type: 'integer' },
            description: { type: 'string' },
            est_duration_s: { type: 'number' },
          },
          required: ['shot_n', 'description'],
        },
        description:
          'Estimated shot-by-shot breakdown based on keyframes + transcript implications.',
      },
      captions_used: {
        type: 'string',
        description:
          'What the on-screen text or overlay captions say (if visible in keyframes), and when. Empty string if no captions.',
      },
      music_and_audio: {
        type: 'string',
        description:
          'Notes about music, sound effects, or audio choices if discernible from the transcript or implied by content. Empty string if not enough info.',
      },
      hypothesized_why_it_works: {
        type: 'array',
        items: { type: 'string' },
        description:
          '3-5 specific, falsifiable hypotheses about why this video might spread. Avoid generic platitudes like "great hook" — say what the hook does psychologically.',
      },
      risks_if_replicated: {
        type: 'array',
        items: { type: 'string' },
        description:
          '2-3 specific risks a creator should consider if trying to replicate this approach.',
      },
    },
    required: [
      'hook',
      'structure',
      'pacing',
      'shot_list',
      'hypothesized_why_it_works',
    ],
  },
}

let _client: Anthropic | null = null
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

/**
 * Fetch a public image URL and return its bytes as a base64 string + media type.
 */
async function fetchAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`keyframe fetch ${url} returned ${res.status}`)
  }
  const mediaType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return { data: buf.toString('base64'), mediaType }
}

/**
 * Run the Claude vision pass over (transcript + 4 sampled keyframe URLs)
 * and return the structured analysis JSON.
 */
export async function analyzeVideo(args: {
  transcript: string
  keyframeUrls: string[]
}): Promise<Record<string, unknown>> {
  const sampled = sampleEvenly(args.keyframeUrls, 4)
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
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_analysis' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Transcript:\n\n${args.transcript || '(no transcript available)'}\n\nFrames sampled across the video duration follow.`,
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

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = (arr.length - 1) / (n - 1)
  const indices = Array.from({ length: n }, (_, i) => Math.round(i * step))
  return indices.map((i) => arr[i]!)
}
