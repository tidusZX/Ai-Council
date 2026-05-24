import { describe, it, expect } from 'vitest'
import { monthLabelToYYYYMM } from '@/lib/month'

describe('monthLabelToYYYYMM', () => {
  it('returns null for undefined / empty', () => {
    expect(monthLabelToYYYYMM(undefined)).toBeNull()
    expect(monthLabelToYYYYMM('')).toBeNull()
    expect(monthLabelToYYYYMM('   ')).toBeNull()
  })

  it('passes through ISO YYYY-MM unchanged', () => {
    expect(monthLabelToYYYYMM('2026-06')).toBe('2026-06')
    expect(monthLabelToYYYYMM('  2027-01  ')).toBe('2027-01')
  })

  it('parses "Month YYYY" form (any case)', () => {
    expect(monthLabelToYYYYMM('June 2026')).toBe('2026-06')
    expect(monthLabelToYYYYMM('june 2026')).toBe('2026-06')
    expect(monthLabelToYYYYMM('JUNE 2026')).toBe('2026-06')
    expect(monthLabelToYYYYMM('December 2025')).toBe('2025-12')
  })

  it('defaults to current year when year omitted', () => {
    const thisYear = new Date().getFullYear()
    expect(monthLabelToYYYYMM('March')).toBe(`${thisYear}-03`)
    expect(monthLabelToYYYYMM('august')).toBe(`${thisYear}-08`)
  })

  it('returns null for nonsense input', () => {
    expect(monthLabelToYYYYMM('asdf')).toBeNull()
    expect(monthLabelToYYYYMM('2026')).toBeNull()
    expect(monthLabelToYYYYMM('Q4 2026')).toBeNull()
    expect(monthLabelToYYYYMM('next month')).toBeNull()
  })
})
