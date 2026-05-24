import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { TextQuestion } from '@/lib/config'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function makeTextQuestionStep(question: TextQuestion) {
  return function TextQuestionStep({ progress, config, submitting, error, onSubmit, onBack }: StepProps) {
    const initial = progress.answers?.[question.id]
    const [value, setValue] = useState(typeof initial === 'string' ? initial : '')
    const required = question.required !== false
    const canSubmit = required ? value.trim().length > 0 : true

    return (
      <StepShell
        theme={config.theme}
        title={question.title}
        description={question.description}
        error={error}
        onBack={onBack}
        showBack
        footer={
          <Button
            onClick={() => onSubmit({ content: value.trim() })}
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </Button>
        }
      >
        <Textarea
          autoFocus
          placeholder={question.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={question.maxLength}
          rows={question.rows ?? 6}
        />
      </StepShell>
    )
  }
}
