/**
 * Build the markdown body for the single Sapt memory entry written at the end
 * of the questionnaire. Each question contributes a level-2 heading
 * (its title) followed by the answer. Multiselect answers render as a
 * markdown bullet list using the option labels (not raw values), preserving
 * the question definition's wording in the captured memory.
 *
 * Questions the client didn't answer are omitted entirely — no "no answer"
 * placeholders. Order follows the question definitions in agency-config so
 * the agency owner controls how the memory reads.
 */

import type { Question } from './config'

export function buildMemoryContent(
  questions: Question[],
  answers: Record<string, string | string[]>
): string {
  const sections: string[] = []

  for (const question of questions) {
    const raw = answers[question.id]
    if (raw === undefined) continue

    if (question.type === 'text') {
      if (typeof raw !== 'string' || raw.trim() === '') continue
      sections.push(`## ${question.title}\n\n${raw.trim()}`)
      continue
    }

    if (question.type === 'multiselect') {
      const values = Array.isArray(raw) ? raw : [raw]
      if (values.length === 0) continue
      const labelByValue = new Map(question.options.map((o) => [o.value, o.label]))
      const bullets = values
        .map((v) => labelByValue.get(v) ?? v)
        .map((label) => `- ${label}`)
        .join('\n')
      sections.push(`## ${question.title}\n\n${bullets}`)
    }
  }

  return sections.join('\n\n')
}
