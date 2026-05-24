import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const ALL_ROLES = [
  'strategist',
  'creative_director',
  'technical_producer',
  'marketing_lead',
  'critic',
  'chairperson',
] as const

const Body = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(5).max(4000),
  addressedTo: z.array(z.enum(ALL_ROLES)).optional(),
  inReplyTo: z.string().uuid().optional(),
})

describe('council/followup Body schema', () => {
  const validUuid = '00000000-0000-4000-8000-000000000000'

  it('requires sessionId + question', () => {
    expect(Body.safeParse({ sessionId: validUuid }).success).toBe(false)
    expect(Body.safeParse({ question: 'a follow up' }).success).toBe(false)
  })

  it('rejects too-short question (<5 chars)', () => {
    expect(
      Body.safeParse({ sessionId: validUuid, question: 'hi' }).success
    ).toBe(false)
  })

  it('rejects question > 4000 chars', () => {
    expect(
      Body.safeParse({
        sessionId: validUuid,
        question: 'a'.repeat(4001),
      }).success
    ).toBe(false)
  })

  it('accepts a valid full body w/ optional fields', () => {
    const r = Body.safeParse({
      sessionId: validUuid,
      question: 'Critic, sharpen your concern',
      addressedTo: ['critic', 'chairperson'],
      inReplyTo: validUuid,
    })
    expect(r.success).toBe(true)
  })

  it('rejects invalid role in addressedTo', () => {
    const r = Body.safeParse({
      sessionId: validUuid,
      question: 'a question',
      addressedTo: ['critic', 'pranayama-instructor'],
    })
    expect(r.success).toBe(false)
  })

  it('accepts empty addressedTo (route treats as "all roles")', () => {
    const r = Body.safeParse({
      sessionId: validUuid,
      question: 'a question',
      addressedTo: [],
    })
    expect(r.success).toBe(true)
  })

  it('rejects malformed sessionId', () => {
    expect(
      Body.safeParse({
        sessionId: 'not-a-uuid',
        question: 'a question',
      }).success
    ).toBe(false)
  })
})
