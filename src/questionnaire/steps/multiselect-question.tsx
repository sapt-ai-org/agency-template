import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MultiselectQuestion } from '@/lib/config'
import { cn } from '@/lib/utils'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function makeMultiselectQuestionStep(question: MultiselectQuestion) {
  return function MultiselectQuestionStep({
    progress,
    config,
    submitting,
    error,
    onSubmit,
    onBack,
  }: StepProps) {
    const initial = progress.answers?.[question.id]
    const initialValues = Array.isArray(initial) ? initial : []
    const [selected, setSelected] = useState<string[]>(initialValues)
    const required = question.required !== false
    const canSubmit = required ? selected.length > 0 : true

    const toggle = (value: string) => {
      if (question.multi) {
        setSelected((prev) =>
          prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
        )
      } else {
        setSelected([value])
      }
    }

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
            onClick={() => onSubmit({ options: selected })}
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const isSelected = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn(
                  'rounded-md border px-4 py-3 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-muted/50'
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </StepShell>
    )
  }
}
