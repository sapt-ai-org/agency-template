import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function AudienceStep({ progress, submitting, error, onSubmit, onBack }: StepProps) {
  const [value, setValue] = useState(progress.audience ?? '')
  const canSubmit = value.trim().length > 0

  return (
    <StepShell
      title="Who's your audience?"
      description="The people you make this for. Demographics, interests, what they care about — whatever matters."
      error={error}
      onBack={onBack}
      showBack
      footer={
        <Button onClick={() => onSubmit({ content: value.trim() })} disabled={submitting || !canSubmit}>
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
      }
    >
      <Textarea
        autoFocus
        placeholder="Mostly women 25–40 who care about clean ingredients…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        rows={6}
      />
    </StepShell>
  )
}
