import { Button } from '@/components/ui/button'
import { theme } from '@/theme'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function WelcomeStep({ submitting, error, onSubmit, onBack }: StepProps) {
  return (
    <StepShell
      title={`Welcome to ${theme.agencyName}`}
      description={theme.welcomeCopy}
      error={error}
      onBack={onBack}
      showBack={false}
      footer={
        <Button onClick={() => onSubmit({})} disabled={submitting}>
          {submitting ? 'Continuing…' : 'Get started'}
        </Button>
      }
    >
      <div />
    </StepShell>
  )
}
