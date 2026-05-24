import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteStep({ config, submitting, error, onSubmit, onBack }: StepProps) {
  const [email, setEmail] = useState('')
  const valid = EMAIL_RE.test(email.trim())

  return (
    <StepShell
      theme={config.theme}
      title="Where should we send the invite?"
      description="We'll send you a link to accept your project in Sapt. You'll sign in with this email."
      error={error}
      onBack={onBack}
      showBack
      footer={
        <Button onClick={() => onSubmit({ email: email.trim() })} disabled={submitting || !valid}>
          {submitting ? 'Sending…' : 'Send invite'}
        </Button>
      }
    >
      <Input
        autoFocus
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </StepShell>
  )
}
