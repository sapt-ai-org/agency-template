import { Button } from '@/components/ui/button'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

export function WelcomeStep({ config, submitting, error, onSubmit, onBack }: StepProps) {
  return (
    <StepShell
      theme={config.theme}
      title={`Welcome to ${config.theme.agencyName}`}
      description={config.theme.welcomeCopy}
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
