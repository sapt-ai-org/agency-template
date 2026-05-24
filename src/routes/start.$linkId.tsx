import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { LinkRecord, ProgressRecord, Step } from '@/lib/types'
import { STEPS } from '@/questionnaire/steps'
import { theme } from '@/theme'

export const Route = createFileRoute('/start/$linkId')({
  component: QuestionnairePage,
})

interface FetchState {
  link: LinkRecord
  progress: ProgressRecord
}

function QuestionnairePage() {
  const { linkId } = Route.useParams()
  const [state, setState] = useState<FetchState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/steps/${linkId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setLoadError('This onboarding link is invalid or has expired.')
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoadError('Could not load this onboarding session.')
          return
        }
        const body = (await res.json()) as FetchState
        if (cancelled) return
        if (body.link.status === 'completed') {
          setDone(true)
          setState(body)
        } else {
          setState(body)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this onboarding session.')
      })
    return () => {
      cancelled = true
    }
  }, [linkId])

  const handleSubmit = useCallback(
    async (stepName: Step, body: Record<string, unknown>) => {
      setSubmitting(true)
      setSubmitError(null)
      try {
        const res = await fetch(`/api/steps/${linkId}/${stepName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setSubmitError(data?.error?.message ?? 'Something went wrong. Please try again.')
          return
        }
        const data = (await res.json()) as { progress: ProgressRecord }
        const fresh = await fetch(`/api/steps/${linkId}`)
        const refreshed = (await fresh.json()) as FetchState
        if (refreshed.link.status === 'completed') {
          setState(refreshed)
          setDone(true)
        } else {
          setState({ link: refreshed.link, progress: data.progress })
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Network error')
      } finally {
        setSubmitting(false)
      }
    },
    [linkId]
  )

  const handleBack = useCallback(() => {
    if (!state) return
    const idx = STEPS.findIndex((s) => s.step === state.progress.currentStep)
    if (idx <= 0) return
    const prev = STEPS[idx - 1]
    if (!prev) return
    setState({ ...state, progress: { ...state.progress, currentStep: prev.step } })
    setSubmitError(null)
  }, [state])

  const currentDef = useMemo(() => {
    if (!state) return null
    return STEPS.find((s) => s.step === state.progress.currentStep)
  }, [state])

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">{loadError}</h1>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <img src={theme.agencyLogoUrl} alt={theme.agencyName} className="size-12" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re all set</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{theme.completionCopy}</p>
        <Button className="mt-8" onClick={() => (window.location.href = 'https://app.sapt.ai')}>
          Continue in Sapt
        </Button>
      </div>
    )
  }

  if (!state || !currentDef) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  const StepComponent = currentDef.Component
  return (
    <StepComponent
      progress={state.progress}
      submitting={submitting}
      error={submitError}
      onSubmit={(body) => handleSubmit(state.progress.currentStep, body)}
      onBack={handleBack}
    />
  )
}
