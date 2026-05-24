import { describe, expect, it } from 'vitest'
import type { Question } from './config'
import { buildMemoryContent } from './memory-content'

describe('buildMemoryContent', () => {
  it('renders a text answer under the question title', () => {
    const questions: Question[] = [
      { id: 'brand', type: 'text', title: 'Tell us about your business' },
    ]
    const content = buildMemoryContent(questions, { brand: 'We make candles.' })
    expect(content).toBe('## Tell us about your business\n\nWe make candles.')
  })

  it('renders multiselect answers as a markdown bullet list using option labels', () => {
    const questions: Question[] = [
      {
        id: 'channels',
        type: 'multiselect',
        title: 'Where do you sell?',
        multi: true,
        options: [
          { value: 'ig', label: 'Instagram' },
          { value: 'tt', label: 'TikTok' },
          { value: 'web', label: 'Direct via website' },
        ],
      },
    ]
    const content = buildMemoryContent(questions, { channels: ['ig', 'web'] })
    expect(content).toBe('## Where do you sell?\n\n- Instagram\n- Direct via website')
  })

  it('preserves question order even when answers come out of order', () => {
    const questions: Question[] = [
      { id: 'first', type: 'text', title: 'First question' },
      { id: 'second', type: 'text', title: 'Second question' },
    ]
    const content = buildMemoryContent(questions, {
      second: 'second answer',
      first: 'first answer',
    })
    expect(content.indexOf('First question')).toBeLessThan(content.indexOf('Second question'))
  })

  it('omits questions with no answer entirely (no placeholder section)', () => {
    const questions: Question[] = [
      { id: 'answered', type: 'text', title: 'Answered question' },
      { id: 'skipped', type: 'text', title: 'Skipped question' },
    ]
    const content = buildMemoryContent(questions, { answered: 'yes' })
    expect(content).toContain('## Answered question')
    expect(content).not.toContain('## Skipped question')
  })

  it('omits text answers that are empty after trimming', () => {
    const questions: Question[] = [
      { id: 'q', type: 'text', title: 'Whitespace only' },
    ]
    const content = buildMemoryContent(questions, { q: '   \n  ' })
    expect(content).toBe('')
  })

  it('falls back to the raw value when an option label is missing', () => {
    const questions: Question[] = [
      {
        id: 'q',
        type: 'multiselect',
        title: 'Q',
        options: [{ value: 'a', label: 'A' }],
      },
    ]
    const content = buildMemoryContent(questions, { q: ['unknown-value'] })
    expect(content).toContain('- unknown-value')
  })
})
