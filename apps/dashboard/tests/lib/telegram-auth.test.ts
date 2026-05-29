import { afterEach, describe, it, expect } from 'vitest'

import { getUserAccess, ReadOnlyError, requireWrite } from '@/lib/telegram-auth'

const originalAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS
const originalWriteUserIds = process.env.TELEGRAM_WRITE_USER_IDS

afterEach(() => {
  process.env.TELEGRAM_ALLOWED_USER_IDS = originalAllowedUserIds
  process.env.TELEGRAM_WRITE_USER_IDS = originalWriteUserIds
})

describe('getUserAccess', () => {
  it('returns null for users outside TELEGRAM_ALLOWED_USER_IDS', () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123,456'
    process.env.TELEGRAM_WRITE_USER_IDS = '789'

    expect(getUserAccess(789)).toBeNull()
  })

  it('returns read for allowed users outside TELEGRAM_WRITE_USER_IDS', () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123, 456'
    process.env.TELEGRAM_WRITE_USER_IDS = '456'

    expect(getUserAccess(123)).toBe('read')
  })

  it('returns write for allowed users in TELEGRAM_WRITE_USER_IDS', () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123,456'
    process.env.TELEGRAM_WRITE_USER_IDS = '456'

    expect(getUserAccess('456')).toBe('write')
  })
})

describe('requireWrite', () => {
  it('allows write access', () => {
    expect(() => requireWrite('write')).not.toThrow()
  })

  it('throws ReadOnlyError for read or null access', () => {
    expect(() => requireWrite('read')).toThrow(ReadOnlyError)
    expect(() => requireWrite(null)).toThrow(ReadOnlyError)
  })
})
