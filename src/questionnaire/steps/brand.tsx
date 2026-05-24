import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function BrandStep({ progress, submitting, error, onSubmit, onBack }: StepProps) {
  const [value, setValue] = useState(progress.brand ?? '')
  const canSubmit = value.trim().length > 0

  return (
    <StepShell
      title="Tell us about your business"
      description="What do you do? Who do you serve? What makes your voice yours? A paragraph or two is plenty."
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
        placeholder="We're an indie skincare brand…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        rows={6}
      />
    </StepShell>
  )
}
