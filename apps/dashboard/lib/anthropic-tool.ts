/**
 * Thin wrapper around the official @anthropic-ai/sdk that gives us structured
 * output via tool_use. Replaces @ai-sdk/anthropic + generateObject which hits
 * a malformed endpoint in v3.0.78 of the SDK against the current Anthropic API.
 *
 * Pattern:
 *   const result = await callAnthropicTool({
 *     system, userContent, toolName, schema: zSchema, toolDescription?
 *   })
 *
 * Where `schema` is a zod schema. We convert it to JSON Schema via
 * zod's native `toJSONSchema` (zod v4), strip the $schema field (Anthropic
 * doesn't like it), and pass it as the tool's input_schema. Tool choice is
 * forced so Claude has to call the tool — the tool input IS the response.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

let cached: Anthropic | null = null

function client(): Anthropic {
  if (cached) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  cached = new Anthropic({ apiKey })
  return cached
}

export function getModelName(): string {
  return process.env.ANALYSIS_MODEL || 'claude-sonnet-4-5'
}

interface CallOptions<T extends z.ZodType> {
  system: string
  userContent: string
  toolName: string
  toolDescription?: string
  schema: T
  maxTokens?: number
  model?: string
}

/**
 * Non-streaming text completion. Used by /api/council/followup which
 * runs multiple member calls in parallel and persists each on completion.
 * Streaming is overkill for follow-ups — the user sees the round as a
 * batch once it's done.
 */
export async function callAnthropicText(opts: {
  system: string
  userContent: string
  maxTokens?: number
  model?: string
}): Promise<string> {
  const res = await client().messages.create({
    model: opts.model ?? getModelName(),
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.userContent }],
  })
  const textBlock = res.content.find((c) => c.type === 'text') as
    | Anthropic.Messages.TextBlock
    | undefined
  if (!textBlock) {
    throw new Error(
      `Anthropic returned no text block. stop_reason=${res.stop_reason}`
    )
  }
  return textBlock.text
}

export async function callAnthropicTool<T extends z.ZodType>({
  system,
  userContent,
  toolName,
  toolDescription = 'Submit structured output for this request.',
  schema,
  maxTokens = 8192,
  model,
}: CallOptions<T>): Promise<z.infer<T>> {
  const inputSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<
    string,
    unknown
  >
  // Anthropic doesn't accept the meta $schema key on the tool input_schema.
  delete inputSchema.$schema

  const res = await client().messages.create({
    model: model ?? getModelName(),
    max_tokens: maxTokens,
    system,
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: inputSchema as Anthropic.Messages.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = res.content.find((c) => c.type === 'tool_use') as
    | Anthropic.Messages.ToolUseBlock
    | undefined

  if (!block) {
    throw new Error(
      `Anthropic returned no tool_use block for tool=${toolName}. stop_reason=${res.stop_reason}`
    )
  }

  const parsed = schema.safeParse(block.input)
  if (!parsed.success) {
    throw new Error(
      `Tool ${toolName} returned shape that failed zod validation: ${JSON.stringify(parsed.error.issues).slice(0, 500)}`
    )
  }
  return parsed.data
}
