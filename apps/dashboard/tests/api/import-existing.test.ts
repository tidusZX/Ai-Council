import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const ItemSchema = z.object({
  title: z.string().min(3).max(200),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  draftCaption: z.string().min(5).max(2000),
  status: z
    .enum(['Idea', 'Planned', 'Scheduled', 'Published'])
    .default('Planned'),
  client: z.string().max(120).optional(),
  hook: z.string().max(500).optional(),
  hashtags: z.array(z.string().min(1).max(60)).max(30).optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO yyyy-mm-dd')
    .optional(),
  imageUrl: z.url().optional(),
  shootName: z.string().max(200).optional(),
})

const Body = z.object({
  items: z.array(ItemSchema).min(1).max(40),
})

describe('import-existing Body schema', () => {
  const valid = {
    title: 'Smoke test — delete me',
    format: 'CAROUSEL' as const,
    draftCaption: 'A caption long enough to pass',
  }

  it('requires at least one item', () => {
    expect(Body.safeParse({ items: [] }).success).toBe(false)
  })

  it('rejects more than 40 items', () => {
    const items = Array.from({ length: 41 }, () => valid)
    expect(Body.safeParse({ items }).success).toBe(false)
  })

  it('defaults status to Planned when omitted', () => {
    const r = Body.safeParse({ items: [valid] })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.items[0].status).toBe('Planned')
  })

  it('rejects scheduledDate not in yyyy-mm-dd', () => {
    expect(
      Body.safeParse({
        items: [{ ...valid, scheduledDate: '06/16/2026' }],
      }).success
    ).toBe(false)
    expect(
      Body.safeParse({
        items: [{ ...valid, scheduledDate: '2026-06-16' }],
      }).success
    ).toBe(true)
  })

  it('rejects malformed imageUrl', () => {
    expect(
      Body.safeParse({
        items: [{ ...valid, imageUrl: 'not-a-url' }],
      }).success
    ).toBe(false)
  })

  it('rejects too-short caption', () => {
    expect(
      Body.safeParse({
        items: [{ ...valid, draftCaption: 'tiny' }],
      }).success
    ).toBe(false)
  })

  it('caps hashtags at 30', () => {
    const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`)
    expect(
      Body.safeParse({
        items: [{ ...valid, hashtags }],
      }).success
    ).toBe(false)
  })
})
