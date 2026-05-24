import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

const URL_RE = /^https?:\/\//i

function normalize(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withProto = URL_RE.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProto)
    const host = url.hostname.replace(/\.$/, '')
    if (!host.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function WebsiteStep({ progress, submitting, error, onSubmit, onBack }: StepProps) {
  const [value, setValue] = useState(progress.websiteUrl ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const normalized = normalize(value)
    if (normalized === null) {
      setValidationError('Enter a valid website, e.g. yoursite.com')
      return
    }
    setValidationError(null)
    await onSubmit({ url: normalized })
  }

  return (
    <StepShell
      title="Your website"
      description="Optional. You can skip this and add it later."
      error={validationError ?? error}
      onBack={onBack}
      showBack
      footer={
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : value.trim() ? 'Continue' : 'Skip'}
        </Button>
      }
    >
      <Input
        autoFocus
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="yoursite.com"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (validationError) setValidationError(null)
        }}
      />
    </StepShell>
  )
}
