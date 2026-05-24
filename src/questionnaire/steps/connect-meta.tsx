import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { StepShell } from '../step-shell'
import type { StepProps } from '../types'

interface ConnectPayload {
  connectUrl?: string
  token?: string
  status?: 'pending' | 'completed' | 'failed' | 'expired'
}

export function ConnectMetaStep({ config, progress, submitting, error, onSubmit, onBack }: StepProps) {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'done'>(
    progress.connectSessionToken ? 'waiting' : 'idle'
  )
  const [pollError, setPollError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTime = useRef<number>(Date.now())

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const handleStart = async () => {
    setPollError(null)
    const res = await fetch(`/api/steps/${progress.linkId}/connect-meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    })
    if (!res.ok) {
      setPollError('Could not start the Meta connect flow. Try again.')
      return
    }
    const data = (await res.json()) as { payload?: ConnectPayload }
    if (data.payload?.connectUrl) {
      window.open(data.payload.connectUrl, '_blank', 'noopener,noreferrer')
    }
    startTime.current = Date.now()
    setPhase('waiting')
    schedulePoll(0)
  }

  const schedulePoll = useCallback(
    (depth: number) => {
      stopPolling()
      const elapsed = Date.now() - startTime.current
      if (elapsed > 10 * 60 * 1000) {
        setPollError('Timed out waiting for Meta to finish. You can skip and continue.')
        return
      }
      const delay = elapsed < 30_000 ? 2_000 : 10_000
      pollTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/steps/${progress.linkId}/connect-meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'poll' }),
          })
          if (!res.ok) {
            schedulePoll(depth + 1)
            return
          }
          const data = (await res.json()) as { payload?: ConnectPayload }
          const status = data.payload?.status
          if (status === 'completed') {
            setPhase('done')
            await onSubmit({ action: 'continue' })
            return
          }
          if (status === 'failed' || status === 'expired') {
            setPollError(
              status === 'expired'
                ? 'This Meta connect session expired. Try again or skip.'
                : 'The Meta connect failed. Try again or skip.'
            )
            return
          }
          schedulePoll(depth + 1)
        } catch {
          schedulePoll(depth + 1)
        }
      }, delay)
    },
    [onSubmit, progress.linkId, stopPolling]
  )

  const handleSkip = async () => {
    stopPolling()
    await onSubmit({ action: 'skip' })
  }

  return (
    <StepShell
      theme={config.theme}
      title="Connect your Meta account"
      description="We'll open a Meta authorization window in a new tab. Once you're done, we'll pick it up automatically."
      error={pollError ?? error}
      onBack={onBack}
      showBack
      footer={
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={submitting}>
            Skip
          </Button>
          {phase === 'idle' && (
            <Button onClick={handleStart} disabled={submitting}>
              Connect Meta
            </Button>
          )}
          {phase === 'waiting' && <Button disabled>Waiting for Meta…</Button>}
        </div>
      }
    >
      {phase === 'waiting' && (
        <p className="text-muted-foreground text-sm">
          A Meta authorization tab opened. Approve the connection there and come back — we&apos;ll
          detect it automatically.
        </p>
      )}
    </StepShell>
  )
}
