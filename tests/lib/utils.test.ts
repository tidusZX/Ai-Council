import { describe, it, expect } from 'vitest'
import {
  cn,
  truncate,
  generateSessionTitle,
  formatDate,
} from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('deduplicates tailwind classes', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6')
  })

  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
})

describe('truncate', () => {
  it('returns string unchanged if short enough', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates and appends ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
})

describe('generateSessionTitle', () => {
  it('takes first 8 words', () => {
    const prompt = 'one two three four five six seven eight nine ten'
    const title = generateSessionTitle(prompt)
    expect(title).toBe('one two three four five six seven eight...')
  })

  it('returns full text if 8 words or fewer', () => {
    const prompt = 'short prompt here'
    expect(generateSessionTitle(prompt)).toBe(prompt)
  })
})

describe('formatDate', () => {
  it('formats a date string', () => {
    const result = formatDate('2024-01-15T10:00:00Z')
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('2024')
  })
})
