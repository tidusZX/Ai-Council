import { describe, it, expect } from 'vitest'
import {
  COUNCIL_MEMBERS,
  CHAIRPERSON,
  getMemberConfig,
} from '@/lib/ai/council-members'

describe('COUNCIL_MEMBERS', () => {
  it('has 5 members', () => {
    expect(COUNCIL_MEMBERS).toHaveLength(5)
  })

  it('includes all required roles', () => {
    const roles = COUNCIL_MEMBERS.map((m) => m.role)
    expect(roles).toContain('strategist')
    expect(roles).toContain('creative_director')
    expect(roles).toContain('technical_producer')
    expect(roles).toContain('marketing_lead')
    expect(roles).toContain('critic')
  })

  it('every member has required fields', () => {
    for (const member of COUNCIL_MEMBERS) {
      expect(member.name).toBeTruthy()
      expect(member.title).toBeTruthy()
      expect(member.icon).toBeTruthy()
      expect(member.systemPrompt.length).toBeGreaterThan(50)
    }
  })
})

describe('CHAIRPERSON', () => {
  it('has chairperson role', () => {
    expect(CHAIRPERSON.role).toBe('chairperson')
  })

  it('has a synthesis-focused system prompt', () => {
    expect(CHAIRPERSON.systemPrompt).toContain('synthesize')
  })
})

describe('getMemberConfig', () => {
  it('returns chairperson for chairperson role', () => {
    expect(getMemberConfig('chairperson')).toBe(CHAIRPERSON)
  })

  it('returns correct member for each role', () => {
    const strategist = getMemberConfig('strategist')
    expect(strategist.role).toBe('strategist')
  })
})
