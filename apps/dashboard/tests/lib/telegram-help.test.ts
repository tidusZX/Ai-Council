import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, it, expect } from 'vitest'

import {
  getCommand,
  getHelpCategory,
  getSectionByHeading,
  getTelegramHelpText,
} from '@/lib/telegram-help'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('getCommand', () => {
  it('normalizes direct and bot-addressed commands', () => {
    expect(getCommand('/help')).toBe('/help')
    expect(getCommand('/help@MyBot billing')).toBe('/help')
    expect(getCommand('/START')).toBe('/start')
  })
})

describe('getHelpCategory', () => {
  it('returns categories only for /help', () => {
    expect(getHelpCategory('/help billing')).toBe('billing')
    expect(getHelpCategory('/help@MyBot Billing')).toBe('billing')
    expect(getHelpCategory('/start billing')).toBeNull()
    expect(getHelpCategory('/help')).toBeNull()
  })
})

describe('getSectionByHeading', () => {
  it('returns the matching ## section', () => {
    const markdown = [
      '# FAQ',
      '',
      'Intro',
      '',
      '## Billing',
      'Billing answer',
      '',
      '## Deploys',
      'Deploy answer',
    ].join('\n')

    expect(getSectionByHeading(markdown, 'billing')).toBe(
      '## Billing\nBilling answer',
    )
  })
})

describe('getTelegramHelpText', () => {
  it('returns the whole FAQ for /start and /help without category', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'telegram-help-'))
    tempDirs.push(dir)
    const faqPath = path.join(dir, 'faq.md')

    await writeFile(faqPath, '# FAQ\n\n## Billing\nBilling answer\n')

    expect(await getTelegramHelpText('/start billing', faqPath)).toBe(
      '# FAQ\n\n## Billing\nBilling answer',
    )
    expect(await getTelegramHelpText('/help', faqPath)).toBe(
      '# FAQ\n\n## Billing\nBilling answer',
    )
  })

  it('returns a category section for /help category', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'telegram-help-'))
    tempDirs.push(dir)
    const faqPath = path.join(dir, 'faq.md')

    await writeFile(faqPath, '# FAQ\n\n## Billing\nBilling answer\n')

    expect(await getTelegramHelpText('/help billing', faqPath)).toBe(
      '## Billing\nBilling answer',
    )
  })

  it('returns a graceful fallback when the FAQ file is missing', async () => {
    expect(await getTelegramHelpText('/help', '/tmp/does-not-exist.md')).toBe(
      'Telegram bot help is not available yet.',
    )
  })
})
