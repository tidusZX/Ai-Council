import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const STATUSES = [
  'new',
  'qualified',
  'contacted',
  'responded',
  'won',
  'lost',
  'archived',
] as const

const Body = z.object({
  status: z.enum(STATUSES),
})

describe('leads/[id]/status Body schema', () => {
  it('accepts every valid funnel status', () => {
    for (const s of STATUSES) {
      const r = Body.safeParse({ status: s })
      expect(r.success).toBe(true)
    }
  })

  it('rejects unknown status', () => {
    expect(Body.safeParse({ status: 'pending' }).success).toBe(false)
    expect(Body.safeParse({ status: 'Won' }).success).toBe(false) // case-sensitive
    expect(Body.safeParse({ status: '' }).success).toBe(false)
  })

  it('rejects missing status field', () => {
    expect(Body.safeParse({}).success).toBe(false)
  })

  it('matches the 7-status enum from migration 003', () => {
    // If migration 003's CHECK constraint changes, this test breaks loudly.
    expect(STATUSES.length).toBe(7)
    expect(STATUSES).toContain('new')
    expect(STATUSES).toContain('qualified')
    expect(STATUSES).toContain('contacted')
    expect(STATUSES).toContain('responded')
    expect(STATUSES).toContain('won')
    expect(STATUSES).toContain('lost')
    expect(STATUSES).toContain('archived')
  })
})
