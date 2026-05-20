import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { generateSessionTitle } from '@/lib/utils'

// Mirror the validation schema from the route
const CreateSessionSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(4000),
  title: z.string().max(200).optional(),
})

describe('Session creation schema', () => {
  it('rejects prompts shorter than 10 characters', () => {
    const result = CreateSessionSchema.safeParse({ prompt: 'short' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.prompt?.[0]).toContain('10 characters')
    }
  })

  it('rejects prompts longer than 4000 characters', () => {
    const longPrompt = 'a'.repeat(4001)
    const result = CreateSessionSchema.safeParse({ prompt: longPrompt })
    expect(result.success).toBe(false)
  })

  it('accepts a valid prompt', () => {
    const result = CreateSessionSchema.safeParse({
      prompt: 'Should I launch a SaaS product for video editors?',
    })
    expect(result.success).toBe(true)
  })

  it('accepts an optional title', () => {
    const result = CreateSessionSchema.safeParse({
      prompt: 'A valid prompt for testing purposes',
      title: 'My session',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('My session')
    }
  })

  it('auto-generates title from prompt when not provided', () => {
    const prompt = 'Should I pivot my business model from B2C to B2B?'
    const title = generateSessionTitle(prompt)
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(0)
  })

  it('truncates long prompts in the title', () => {
    const prompt = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10'
    const title = generateSessionTitle(prompt)
    // Should be 8 words with ellipsis
    expect(title).toContain('...')
    expect(title.split(' ').length).toBeLessThanOrEqual(9)
  })
})
