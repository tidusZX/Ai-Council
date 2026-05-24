import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const Body = z.object({
  draftCaption: z.string().min(5).max(2000),
  title: z.string().min(3).max(160).optional(),
  hook: z.string().max(200).optional(),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']).optional(),
  client: z.string().max(120).nullable().optional(),
  includeHashtags: z.boolean().default(false),
  includeFullPost: z.boolean().default(false),
})

const ResultSchema = z.object({
  sharpenedCaption: z.string().min(5).max(800),
  angle: z.string().min(5).max(300),
  changesSummary: z.array(z.string().min(3).max(200)).min(0).max(8),
  bannedWordsRemoved: z.array(z.string().min(1).max(40)).max(20),
  ctaUsed: z.string().min(1).max(80),
  confidence: z.number().int().min(1).max(3),
  flags: z.array(z.string().min(3).max(200)).max(5),
  hashtags: z.array(z.string().min(2).max(60)).max(15).default([]),
  fullPost: z.string().max(2400).nullable().default(null),
})

describe('voice/sharpen Body schema', () => {
  it('rejects a draft caption shorter than 5 chars', () => {
    const r = Body.safeParse({ draftCaption: 'hey' })
    expect(r.success).toBe(false)
  })

  it('defaults flags to false when omitted', () => {
    const r = Body.safeParse({ draftCaption: 'hello world this is a draft' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.includeHashtags).toBe(false)
      expect(r.data.includeFullPost).toBe(false)
    }
  })

  it('accepts flags when explicitly set', () => {
    const r = Body.safeParse({
      draftCaption: 'hello world this is a draft',
      includeHashtags: true,
      includeFullPost: true,
      format: 'CAROUSEL',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.includeHashtags).toBe(true)
      expect(r.data.includeFullPost).toBe(true)
      expect(r.data.format).toBe('CAROUSEL')
    }
  })

  it('rejects invalid format enum', () => {
    const r = Body.safeParse({
      draftCaption: 'hello world this is a draft',
      format: 'REEL',
    })
    expect(r.success).toBe(false)
  })

  it('allows client to be null (cleared)', () => {
    const r = Body.safeParse({
      draftCaption: 'hello world this is a draft',
      client: null,
    })
    expect(r.success).toBe(true)
  })
})

describe('voice/sharpen Result schema', () => {
  it('hashtags defaults to empty array', () => {
    const r = ResultSchema.safeParse({
      sharpenedCaption: 'a much sharper caption',
      angle: 'for some specific audience',
      changesSummary: [],
      bannedWordsRemoved: [],
      ctaUsed: "DM 'SHOOT'.",
      confidence: 3,
      flags: [],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.hashtags).toEqual([])
      expect(r.data.fullPost).toBeNull()
    }
  })

  it('accepts populated hashtags + fullPost', () => {
    const r = ResultSchema.safeParse({
      sharpenedCaption: 'a much sharper caption',
      angle: 'for some specific audience',
      changesSummary: ['tightened opening', 'swapped CTA'],
      bannedWordsRemoved: ['elevate'],
      ctaUsed: "DM 'SHOOT'.",
      confidence: 2,
      flags: [],
      hashtags: ['#sgfoodphotography', '#commercialphotographersg'],
      fullPost: 'caption text\n\n#sgfoodphotography #commercialphotographersg',
    })
    expect(r.success).toBe(true)
  })

  it('confidence must be an integer 1-3', () => {
    expect(
      ResultSchema.safeParse({
        sharpenedCaption: 'a',
        angle: 'b',
        changesSummary: [],
        bannedWordsRemoved: [],
        ctaUsed: 'x',
        confidence: 4,
        flags: [],
      }).success
    ).toBe(false)
    expect(
      ResultSchema.safeParse({
        sharpenedCaption: 'a',
        angle: 'b',
        changesSummary: [],
        bannedWordsRemoved: [],
        ctaUsed: 'x',
        confidence: 2.5,
        flags: [],
      }).success
    ).toBe(false)
  })
})
