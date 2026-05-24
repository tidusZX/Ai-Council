/**
 * Schema-mirror tests for POST /api/audience-signal/run.
 *
 * We re-declare the Body schema here rather than importing from the route
 * file because the route is a Next.js handler with side-effecting imports
 * (Supabase client construction). This matches the pattern in
 * tests/api/sessions.test.ts.
 *
 * If you change the route's Body shape, mirror it here too.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const Body = z.object({
  topic: z.string().min(3).max(600),
  icpOverride: z.string().max(800).optional(),
  sessionId: z.string().uuid().optional(),
})

describe('audience-signal/run Body schema', () => {
  it('accepts a minimal valid body', () => {
    const r = Body.safeParse({ topic: 'Mid-sized SG F&B brands' })
    expect(r.success).toBe(true)
  })

  it('rejects too-short topic', () => {
    const r = Body.safeParse({ topic: 'ab' })
    expect(r.success).toBe(false)
  })

  it('rejects 601-char topic', () => {
    const r = Body.safeParse({ topic: 'a'.repeat(601) })
    expect(r.success).toBe(false)
  })

  it('accepts optional icpOverride + sessionId', () => {
    const r = Body.safeParse({
      topic: 'F&B brands',
      icpOverride: 'narrow to multi-outlet only',
      sessionId: '00000000-0000-4000-8000-000000000000',
    })
    expect(r.success).toBe(true)
  })

  it('rejects malformed sessionId', () => {
    const r = Body.safeParse({
      topic: 'F&B brands',
      sessionId: 'not-a-uuid',
    })
    expect(r.success).toBe(false)
  })
})

// Spot-check the response schema's most error-prone fields. The actual
// schema in the route has 6 sub-schemas; if a field max is too tight we
// get the same "too_big" zod error the user hit during smoke test.
const ResultSubset = z.object({
  summary: z.string().min(10).max(800),
  topPicks: z.array(z.string().min(1).max(60)).length(3),
})

describe('audience-signal Result schema (subset)', () => {
  it('requires exactly 3 topPicks', () => {
    expect(
      ResultSubset.safeParse({
        summary: 'A sufficiently long summary string',
        topPicks: ['a', 'b'],
      }).success
    ).toBe(false)
    expect(
      ResultSubset.safeParse({
        summary: 'A sufficiently long summary string',
        topPicks: ['a', 'b', 'c', 'd'],
      }).success
    ).toBe(false)
    expect(
      ResultSubset.safeParse({
        summary: 'A sufficiently long summary string',
        topPicks: ['a', 'b', 'c'],
      }).success
    ).toBe(true)
  })

  it('summary max is 800 (generous enough for Market Researcher output)', () => {
    expect(
      ResultSubset.safeParse({
        summary: 'x'.repeat(800),
        topPicks: ['a', 'b', 'c'],
      }).success
    ).toBe(true)
    expect(
      ResultSubset.safeParse({
        summary: 'x'.repeat(801),
        topPicks: ['a', 'b', 'c'],
      }).success
    ).toBe(false)
  })
})
